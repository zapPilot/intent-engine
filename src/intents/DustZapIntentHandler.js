const BaseIntentHandler = require('./BaseIntentHandler');
const TransactionBuilder = require('../transactions/TransactionBuilder');
const DUST_ZAP_CONFIG = require('../config/dustZapConfig');
const FeeCalculationService = require('../services/FeeCalculationService');
const SmartFeeInsertionService = require('../services/SmartFeeInsertionService');
const IntentIdGenerator = require('../utils/intentIdGenerator');
const {
  filterDustTokens,
  groupIntoBatches,
  calculateTotalValue,
} = require('../utils/dustFilters');

/**
 * DustZap Intent Handler - Converts dust tokens to ETH
 */
class DustZapIntentHandler extends BaseIntentHandler {
  constructor(swapService, priceService, rebalanceClient) {
    super(swapService, priceService, rebalanceClient);
    this.feeCalculationService = new FeeCalculationService();
    this.smartFeeInsertionService = new SmartFeeInsertionService();

    // In-memory storage for execution contexts (in production, use Redis or similar)
    this.executionContexts = new Map();

    // Cleanup expired contexts periodically
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredContexts();
    }, DUST_ZAP_CONFIG.SSE_STREAMING.CLEANUP_INTERVAL);
  }

  /**
   * Validate dustZap-specific parameters
   * @param {Object} request - Intent request
   */
  validate(request) {
    this.validateCommon(request);

    const { params } = request;
    if (!params) {
      throw new Error(DUST_ZAP_CONFIG.ERRORS.MISSING_PARAMS);
    }

    const { dustThreshold, targetToken, referralAddress } = params;

    if (dustThreshold !== undefined) {
      if (typeof dustThreshold !== 'number' || dustThreshold < 0) {
        throw new Error(DUST_ZAP_CONFIG.ERRORS.INVALID_DUST_THRESHOLD);
      }
    }

    if (
      targetToken &&
      !DUST_ZAP_CONFIG.SUPPORTED_TARGET_TOKENS.includes(targetToken)
    ) {
      throw new Error(DUST_ZAP_CONFIG.ERRORS.UNSUPPORTED_TARGET_TOKEN);
    }

    if (
      referralAddress &&
      !DUST_ZAP_CONFIG.VALIDATION.ETH_ADDRESS_PATTERN.test(referralAddress)
    ) {
      throw new Error(DUST_ZAP_CONFIG.ERRORS.INVALID_REFERRAL_ADDRESS);
    }
  }

  /**
   * Execute dustZap intent
   * @param {Object} request - Intent request
   * @param {Object} options - Execution options
   * @param {boolean} options.useSSE - Whether to use SSE streaming (default: check config)
   * @returns {Promise<Object>} - Intent response with transactions or stream info
   */
  async execute(request, options = {}) {
    this.validate(request);

    const useSSE =
      options.useSSE !== undefined
        ? options.useSSE
        : DUST_ZAP_CONFIG.SSE_STREAMING.ENABLED;

    try {
      // 1. Prepare execution context with all required data
      const executionContext = await this.prepareExecutionContext(request);

      if (useSSE) {
        // 2. Return SSE streaming response immediately
        return this.buildSSEResponse(executionContext);
      } else {
        // 2. Process all batches and generate transactions (legacy mode)
        const processedData = await this.processAllBatches(executionContext);

        // 3. Build and return response with metadata
        return this.buildResponse(executionContext, processedData);
      }
    } catch (error) {
      console.error('DustZap execution error:', error);
      throw error;
    }
  }

  /**
   * Prepare execution context with all required data
   * @param {Object} request - Intent request
   * @returns {Promise<Object>} - Execution context object
   */
  async prepareExecutionContext(request) {
    const { userAddress, chainId, params } = request;
    const {
      dustThreshold = DUST_ZAP_CONFIG.DEFAULT_DUST_THRESHOLD,
      referralAddress,
      toTokenAddress,
      toTokenDecimals,
      slippage,
    } = params;

    // 1. Get user token balances
    const userTokens = await this.rebalanceClient.getUserTokenBalances(
      userAddress,
      chainId
    );

    // 2. Filter dust tokens
    const dustTokens = filterDustTokens(userTokens, dustThreshold);
    if (dustTokens.length === 0) {
      throw new Error(DUST_ZAP_CONFIG.ERRORS.NO_DUST_TOKENS);
    }

    // 3. Get ETH price for fee calculations
    const ethPrice = await this.getETHPrice();

    // 4. Group tokens into batches
    const batches = groupIntoBatches(
      dustTokens,
      DUST_ZAP_CONFIG.DEFAULT_BATCH_SIZE
    );

    return {
      userAddress,
      chainId,
      params: {
        dustThreshold,
        referralAddress,
        toTokenAddress,
        toTokenDecimals,
        slippage,
      },
      dustTokens,
      ethPrice,
      batches,
    };
  }

  /**
   * Process all batches and generate transactions with smart fee insertion
   * @param {Object} executionContext - Execution context
   * @returns {Promise<Object>} - Processed data with transactions and totals
   */
  async processAllBatches(executionContext) {
    const { batches, ethPrice, params } = executionContext;
    const { referralAddress } = params;

    const txBuilder = new TransactionBuilder();
    let totalValueUSD = 0;

    // PHASE 1: Process all swap transactions first (without fees)
    for (const batch of batches) {
      const batchContext = this.createBatchProcessingContext(
        batch,
        txBuilder,
        executionContext
      );

      await this.processBatch(batchContext);
      totalValueUSD += calculateTotalValue(batch);
    }

    // PHASE 2: Calculate smart fee insertion strategy
    const { feeTransactions, feeAmounts } =
      this.feeCalculationService.createFeeTransactionData(
        totalValueUSD,
        ethPrice,
        referralAddress
      );

    // Calculate insertion strategy using smart service
    const insertionStrategy =
      this.smartFeeInsertionService.calculateInsertionStrategy(
        batches,
        feeAmounts.totalFeeETH,
        txBuilder.getTransactionCount(),
        feeTransactions.length
      );

    // Validate the insertion strategy for safety
    if (
      !this.smartFeeInsertionService.validateInsertionStrategy(
        insertionStrategy,
        txBuilder.getTransactionCount()
      )
    ) {
      console.warn(
        'Fee insertion strategy validation failed, falling back to end insertion'
      );
      // Fallback: insert fees at the end (legacy behavior)
      this.feeCalculationService.addFeeTransactions(
        txBuilder,
        totalValueUSD,
        ethPrice,
        referralAddress
      );
    } else {
      // PHASE 3: Insert fee transactions at calculated random points
      txBuilder.insertFeeTransactionsRandomly(
        feeTransactions,
        insertionStrategy.insertionPoints
      );
    }

    return {
      txBuilder,
      totalValueUSD,
      insertionStrategy, // Include strategy metadata for debugging/monitoring
    };
  }

  /**
   * Build SSE streaming response (immediate return)
   * @param {Object} executionContext - Execution context
   * @returns {Object} - SSE streaming response
   */
  buildSSEResponse(executionContext) {
    const { dustTokens, userAddress } = executionContext;
    const intentId = IntentIdGenerator.generate('dustZap', userAddress);

    // Store execution context for SSE processing
    this.storeExecutionContext(intentId, executionContext);

    return {
      success: true,
      intentType: 'dustZap',
      mode: 'streaming',
      intentId,
      streamUrl: `/api/dustzap/${intentId}/stream`,
      metadata: {
        totalTokens: dustTokens.length,
        estimatedDuration: this.estimateProcessingDuration(dustTokens.length),
        streamingEnabled: true,
      },
    };
  }

  /**
   * Build traditional response with metadata (legacy mode)
   * @param {Object} executionContext - Execution context
   * @param {Object} processedData - Processed transaction data
   * @returns {Object} - Complete intent response
   */
  buildResponse(executionContext, processedData) {
    const { dustTokens, batches, params } = executionContext;
    const { txBuilder, totalValueUSD } = processedData;
    const { dustThreshold, referralAddress } = params;

    const transactions = txBuilder.getTransactions();
    const batchInfo = this.buildBatchInfo(batches);

    return {
      success: true,
      intentType: 'dustZap',
      mode: 'immediate',
      transactions,
      metadata: {
        totalTokens: dustTokens.length,
        batchInfo,
        feeInfo: this.feeCalculationService.buildFeeInfo(
          totalValueUSD,
          referralAddress
        ),
        estimatedTotalGas: txBuilder.getTotalGas(),
        dustThreshold,
      },
    };
  }

  /**
   * Create batch processing context
   * @param {Array} batch - Batch of dust tokens
   * @param {TransactionBuilder} txBuilder - Transaction builder instance
   * @param {Object} executionContext - Execution context
   * @returns {Object} - Batch processing context
   */
  createBatchProcessingContext(batch, txBuilder, executionContext) {
    const { chainId, ethPrice, userAddress, params } = executionContext;
    const { toTokenAddress, toTokenDecimals, slippage } = params;

    return {
      batch,
      txBuilder,
      chainId,
      ethPrice,
      toTokenPrice: ethPrice, // Fix: was duplicated ethPrice parameter
      userAddress,
      toTokenAddress,
      toTokenDecimals,
      slippage,
    };
  }

  /**
   * Process a batch of dust tokens
   * @param {Object} context - Batch processing context
   * @param {Array} context.batch - Batch of dust tokens
   * @param {TransactionBuilder} context.txBuilder - Transaction builder instance
   * @param {number} context.chainId - Chain ID
   * @param {number} context.ethPrice - ETH price in USD
   * @param {number} context.toTokenPrice - Target token price in USD
   * @param {string} context.userAddress - User address
   * @param {string} context.toTokenAddress - Target token address
   * @param {number} context.toTokenDecimals - Target token decimals
   * @param {number} context.slippage - Slippage tolerance
   */
  async processBatch(context) {
    const {
      batch,
      txBuilder,
      chainId,
      ethPrice,
      toTokenPrice,
      userAddress,
      toTokenAddress,
      toTokenDecimals,
      slippage,
    } = context;
    for (const token of batch) {
      try {
        // Get best swap quote
        const requestParam = {
          chainId: chainId,
          fromTokenAddress: token.id,
          fromTokenDecimals: token.decimals,
          toTokenAddress: toTokenAddress,
          toTokenDecimals: toTokenDecimals,
          amount: token.raw_amount,
          fromAddress: userAddress,
          slippage: slippage, // unit is percentage
          eth_price: ethPrice,
          toTokenPrice: toTokenPrice,
        };
        const swapQuote = await this.swapService.getBestSwapQuote(requestParam);
        // Add approve transaction
        txBuilder.addApprove(
          token.id,
          swapQuote.to, // Router address
          token.raw_amount
        );

        // Add swap transaction
        txBuilder.addSwap(swapQuote, `Swap ${token.symbol} to ETH`);
      } catch (error) {
        console.warn(`Failed to process token ${token.symbol}:`, error.message);
        // Continue with other tokens (graceful degradation)
      }
    }
  }

  /**
   * Get current ETH price
   * @returns {Promise<number>} - ETH price in USD
   */
  async getETHPrice() {
    const priceObj = await this.priceService.getPrice('eth');
    return priceObj.price;
  }

  /**
   * Build batch info metadata
   * @param {Array} batches - Array of token batches
   * @returns {Array} - Batch info array
   */
  buildBatchInfo(batches) {
    let currentIndex = 0;
    const batchInfo = [];

    for (const batch of batches) {
      const transactionCount =
        batch.length * DUST_ZAP_CONFIG.TRANSACTIONS_PER_TOKEN; // approve + swap per token
      batchInfo.push({
        startIndex: currentIndex,
        endIndex: currentIndex + transactionCount - 1,
        tokenCount: batch.length,
      });
      currentIndex += transactionCount;
    }

    return batchInfo;
  }

  /**
   * Store execution context for SSE processing
   * @param {string} intentId - Intent ID
   * @param {Object} executionContext - Execution context to store
   */
  storeExecutionContext(intentId, executionContext) {
    this.executionContexts.set(intentId, {
      ...executionContext,
      intentId, // Store the intent ID for cleanup
      createdAt: Date.now(),
    });
  }

  /**
   * Retrieve execution context for SSE processing
   * @param {string} intentId - Intent ID
   * @returns {Object|null} - Execution context or null if not found
   */
  getExecutionContext(intentId) {
    return this.executionContexts.get(intentId) || null;
  }

  /**
   * Remove execution context after processing
   * @param {string} intentId - Intent ID
   */
  removeExecutionContext(intentId) {
    this.executionContexts.delete(intentId);
  }

  /**
   * Estimate processing duration based on token count
   * @param {number} tokenCount - Number of tokens to process
   * @returns {string} - Estimated duration range
   */
  estimateProcessingDuration(tokenCount) {
    // Rough estimate: 1-2 seconds per token (includes API calls, gas estimation, etc.)
    const minSeconds = Math.max(5, tokenCount * 1);
    const maxSeconds = Math.max(10, tokenCount * 2);

    if (maxSeconds < 60) {
      return `${minSeconds}-${maxSeconds} seconds`;
    } else {
      const minMinutes = Math.floor(minSeconds / 60);
      const maxMinutes = Math.ceil(maxSeconds / 60);
      return `${minMinutes}-${maxMinutes} minutes`;
    }
  }

  /**
   * Process tokens with SSE streaming (token-level granularity)
   * @param {Object} executionContext - Execution context
   * @param {Function} streamWriter - Function to write SSE events
   * @returns {Promise<Object>} - Final processing results
   */
  async processTokensWithSSEStreaming(executionContext, streamWriter) {
    const { dustTokens, params } = executionContext;
    const { referralAddress } = params;

    const allTransactions = [];
    let totalValueUSD = 0;
    let processedTokens = 0;

    try {
      // Process each token individually for maximum granularity
      for (let i = 0; i < dustTokens.length; i++) {
        const token = dustTokens[i];

        try {
          // Create a mini-batch with just this token
          const tokenBatch = [token];
          const txBuilder = new TransactionBuilder();

          // Process this single token
          const batchContext = this.createBatchProcessingContext(
            tokenBatch,
            txBuilder,
            executionContext
          );

          await this.processBatch(batchContext);
          const tokenTransactions = txBuilder.getTransactions();

          // Add to running totals
          allTransactions.push(...tokenTransactions);
          totalValueUSD += calculateTotalValue(tokenBatch);
          processedTokens++;

          // Stream this token's completion
          streamWriter({
            type: 'token_ready',
            tokenIndex: i,
            tokenSymbol: token.symbol,
            tokenAddress: token.id,
            transactions: tokenTransactions,
            progress: processedTokens / dustTokens.length,
            processedTokens,
            totalTokens: dustTokens.length,
            timestamp: new Date().toISOString(),
          });
        } catch (tokenError) {
          console.warn(
            `Failed to process token ${token.symbol}:`,
            tokenError.message
          );

          // Increment processed count even for failures
          processedTokens++;

          // Stream token failure but continue
          streamWriter({
            type: 'token_failed',
            tokenIndex: i,
            tokenSymbol: token.symbol,
            error: tokenError.message,
            progress: processedTokens / dustTokens.length,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Add fee transactions using smart insertion
      const { feeTransactions } =
        this.feeCalculationService.createFeeTransactionData(
          totalValueUSD,
          executionContext.ethPrice,
          referralAddress
        );

      // For SSE streaming, append fees at the end for simplicity
      // (Could be enhanced with smart insertion in the future)
      const feeTransactionObjects = feeTransactions.map(fee => ({
        to: fee.recipient,
        value: fee.amount.toString(),
        description: fee.description,
        gasLimit: '21000',
      }));

      allTransactions.push(...feeTransactionObjects);

      // Stream completion with all transactions
      const finalResult = {
        type: 'complete',
        transactions: allTransactions,
        metadata: {
          totalTokens: dustTokens.length,
          processedTokens,
          totalValueUSD,
          feeInfo: this.feeCalculationService.buildFeeInfo(
            totalValueUSD,
            referralAddress
          ),
          estimatedTotalGas: allTransactions
            .reduce(
              (sum, tx) => sum + BigInt(tx.gasLimit || '21000'),
              BigInt(0)
            )
            .toString(),
        },
        timestamp: new Date().toISOString(),
      };

      streamWriter(finalResult);

      return {
        allTransactions,
        totalValueUSD,
        processedTokens,
      };
    } catch (error) {
      console.error('Token processing error:', error);

      streamWriter({
        type: 'error',
        error: error.message,
        processedTokens,
        totalTokens: dustTokens.length,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Cleanup expired execution contexts
   */
  cleanupExpiredContexts() {
    const now = Date.now();
    const maxAge = DUST_ZAP_CONFIG.SSE_STREAMING.CONNECTION_TIMEOUT;

    for (const [intentId, context] of this.executionContexts.entries()) {
      if (now - context.createdAt > maxAge) {
        this.executionContexts.delete(intentId);
        console.log(`Cleaned up expired execution context: ${intentId}`);
      }
    }
  }
}

module.exports = DustZapIntentHandler;
