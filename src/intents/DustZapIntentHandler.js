const BaseIntentHandler = require('./BaseIntentHandler');
const DUST_ZAP_CONFIG = require('../config/dustZapConfig');
const FeeCalculationService = require('../services/FeeCalculationService');
const SmartFeeInsertionService = require('../services/SmartFeeInsertionService');
const SwapProcessingService = require('../services/SwapProcessingService');
const SSEEventFactory = require('../services/SSEEventFactory');
const IntentIdGenerator = require('../utils/intentIdGenerator');
const { groupIntoBatches } = require('../utils/dustFilters');

/**
 * DustZap Intent Handler - Converts dust tokens to ETH
 */
class DustZapIntentHandler extends BaseIntentHandler {
  constructor(swapService, priceService, rebalanceClient) {
    super(swapService, priceService, rebalanceClient);
    this.feeCalculationService = new FeeCalculationService();
    this.smartFeeInsertionService = new SmartFeeInsertionService();
    this.swapProcessingService = new SwapProcessingService(
      swapService,
      priceService
    );

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

    const {
      dustTokens: filteredDustTokens,
      targetToken,
      referralAddress,
      toTokenAddress,
      toTokenDecimals,
    } = params;
    // Validate filteredDustTokens
    if (!filteredDustTokens || !Array.isArray(filteredDustTokens)) {
      throw new Error('filteredDustTokens must be provided as an array');
    }

    if (filteredDustTokens.length === 0) {
      throw new Error(DUST_ZAP_CONFIG.ERRORS.NO_DUST_TOKENS);
    }

    // Validate each token structure
    for (const token of filteredDustTokens) {
      if (
        !token.address ||
        !token.symbol ||
        !token.decimals ||
        !token.raw_amount_hex_str ||
        !token.price
      ) {
        throw new Error(
          'Each token must have address, symbol, decimals, raw_amount_hex_str, and price'
        );
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

    // Validate toTokenAddress
    if (!toTokenAddress) {
      throw new Error(DUST_ZAP_CONFIG.ERRORS.MISSING_TO_TOKEN_ADDRESS);
    }

    if (!DUST_ZAP_CONFIG.VALIDATION.ETH_ADDRESS_PATTERN.test(toTokenAddress)) {
      throw new Error(DUST_ZAP_CONFIG.ERRORS.INVALID_TO_TOKEN_ADDRESS);
    }

    // Validate toTokenDecimals
    if (toTokenDecimals === undefined || toTokenDecimals === null) {
      throw new Error(DUST_ZAP_CONFIG.ERRORS.MISSING_TO_TOKEN_DECIMALS);
    }

    if (!Number.isInteger(toTokenDecimals) || toTokenDecimals <= 0) {
      throw new Error(DUST_ZAP_CONFIG.ERRORS.INVALID_TO_TOKEN_DECIMALS);
    }
  }

  /**
   * Execute dustZap intent using SSE streaming
   * @param {Object} request - Intent request
   * @returns {Promise<Object>} - SSE streaming response
   */
  async execute(request) {
    this.validate(request);

    try {
      // 1. Prepare execution context with all required data
      const executionContext = await this.prepareExecutionContext(request);

      // 2. Return SSE streaming response immediately
      return this.buildSSEResponse(executionContext);
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
      dustTokens: filteredDustTokens,
      referralAddress,
      toTokenAddress,
      toTokenDecimals,
      slippage,
    } = params;

    // 1. Use frontend-filtered tokens directly
    const dustTokens = filteredDustTokens;

    // 2. Get ETH price for fee calculations
    const ethPrice = await this.getETHPrice();

    // 3. Group tokens into batches
    const batches = groupIntoBatches(
      dustTokens,
      DUST_ZAP_CONFIG.DEFAULT_BATCH_SIZE
    );

    return {
      userAddress,
      chainId,
      params: {
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
   * Get current ETH price
   * @returns {Promise<number>} - ETH price in USD
   */
  async getETHPrice() {
    const priceObj = await this.priceService.getPrice('eth');
    return priceObj.price;
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

    try {
      // Create processing context for swap service
      const processingContext =
        SwapProcessingService.createProcessingContext(executionContext);

      // Use SwapProcessingService to process tokens with unified error handling
      const batchResults =
        await this.swapProcessingService.processTokenBatchWithSSE({
          tokens: dustTokens,
          context: processingContext,
          streamWriter: streamWriter,
          onProgress: _progressData => {
            // Optional: Add any custom progress handling here
          },
        });

      // Calculate total value from successful swaps
      let totalValueUSD = 0;
      const allTransactions = [...batchResults.transactions];

      // Add successful token values to total
      for (const result of batchResults.successful) {
        totalValueUSD += result.inputValueUSD || 0;
      }

      // Validate totalValueUSD before proceeding with fee calculations
      if (totalValueUSD <= 0) {
        const errorMessage = `Invalid totalValueUSD: ${totalValueUSD}. This indicates either no tokens were processed successfully or all tokens have zero value.`;
        console.error(errorMessage, {
          dustTokensLength: dustTokens.length,
          successfulTokens: batchResults.successful.length,
          failedTokens: batchResults.failed.length,
          totalValueUSD,
        });

        throw new Error(errorMessage);
      }

      // Add fee transactions using TransactionBuilder with WETH wrapping pattern
      const { txBuilder: feeTxBuilder } =
        this.feeCalculationService.createFeeTransactions(
          totalValueUSD,
          executionContext.ethPrice,
          executionContext.chainId,
          referralAddress
        );

      // Get fee transactions from builder
      const feeTransactions = feeTxBuilder.getTransactions();
      allTransactions.push(...feeTransactions);

      // Stream completion with all transactions
      const finalResult = SSEEventFactory.createCompletionEvent({
        transactions: allTransactions,
        metadata: {
          totalTokens: dustTokens.length,
          processedTokens:
            batchResults.successful.length + batchResults.failed.length,
          successfulTokens: batchResults.successful.length,
          failedTokens: batchResults.failed.length,
          totalValueUSD,
          feeInfo: this.feeCalculationService.buildFeeInfo(
            totalValueUSD,
            referralAddress,
            true // useWETHPattern
          ),
          estimatedTotalGas: allTransactions
            .reduce(
              (sum, tx) => sum + BigInt(tx.gasLimit || '21000'),
              BigInt(0)
            )
            .toString(),
        },
      });

      streamWriter(finalResult);

      return {
        allTransactions,
        totalValueUSD,
        processedTokens:
          batchResults.successful.length + batchResults.failed.length,
        successfulTokens: batchResults.successful.length,
        failedTokens: batchResults.failed.length,
      };
    } catch (error) {
      console.error('Token processing error:', error);

      const errorEvent = SSEEventFactory.createErrorEvent(error, {
        processedTokens: 0,
        totalTokens: dustTokens.length,
      });

      streamWriter(errorEvent);
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
      }
    }
  }

  /**
   * Cleanup method for tests - clears the interval timer
   */
  cleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

module.exports = DustZapIntentHandler;
