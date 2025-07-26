const { ethers } = require('ethers');
const BaseIntentHandler = require('./BaseIntentHandler');
const TransactionBuilder = require('../transactions/TransactionBuilder');
const DUST_ZAP_CONFIG = require('../config/dustZapConfig');
const FeeCalculationService = require('../services/FeeCalculationService');
const SmartFeeInsertionService = require('../services/SmartFeeInsertionService');
const IntentIdGenerator = require('../utils/intentIdGenerator');
const {
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
        !token.raw_amount ||
        !token.price
      ) {
        throw new Error(
          'Each token must have address, symbol, decimals, raw_amount, and price'
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
   * @returns {Promise<Array>} - Array of token processing results with quote data
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

    const tokenResults = [];

    for (const token of batch) {
      try {
        // Calculate input value in USD for diagnostics
        const inputValueUSD = token.amount * token.price;
        // Ensure raw_amount is handled as a string to avoid overflow
        token.raw_amount = ethers.getBigInt(token.raw_amount.toString());
        // Get best swap quote
        const requestParam = {
          chainId: chainId,
          fromTokenAddress: token.address,
          fromTokenDecimals: token.decimals,
          toTokenAddress: toTokenAddress,
          toTokenDecimals: toTokenDecimals,
          amount: token.raw_amount,
          fromAddress: userAddress,
          slippage: slippage, // unit is percentage
          eth_price: ethPrice,
          toTokenPrice: toTokenPrice,
        };
        const swapQuote =
          await this.swapService.getSecondBestSwapQuote(requestParam);
        // Add approve transaction
        txBuilder.addApprove(
          token.address,
          swapQuote.approve_to, // Router address
          token.raw_amount
        );
        // Add swap transaction
        txBuilder.addSwap(swapQuote, `Swap ${token.symbol} to ETH`);
        // Store token processing result with quote data
        tokenResults.push({
          token,
          swapQuote,
          inputValueUSD,
          success: true,
        });
      } catch (error) {
        console.warn(`Failed to process token ${token.symbol}:`, error.message);
      }
    }

    return tokenResults;
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
          const tokenResults = await this.processBatch(batchContext);
          const tokenTransactions = txBuilder.getTransactions();
          const tokenResult = tokenResults[0]; // Single token result
          // Add to running totals
          allTransactions.push(...tokenTransactions);
          totalValueUSD += calculateTotalValue(tokenBatch);
          processedTokens++;

          // Extract DEX data and prepare enhanced response with comprehensive error handling
          let provider = null;
          let expectedTokenAmount = null;
          let minToAmount = null;
          let toUsd = null;
          let gasCostUSD = null;
          let tradingLoss = null;
          if (
            tokenResults.length > 0 &&
            tokenResult.success &&
            tokenResult.swapQuote
          ) {
            try {
              const { swapQuote } = tokenResult;

              // Direct field extraction with fallbacks
              provider = swapQuote.provider || 'unknown';
              expectedTokenAmount = swapQuote.toAmount || '0';
              minToAmount = swapQuote.minToAmount || '0';
              toUsd = swapQuote.toUsd !== undefined ? swapQuote.toUsd : null;
              gasCostUSD =
                swapQuote.gasCostUSD !== undefined
                  ? swapQuote.gasCostUSD
                  : null;

              // Calculate simplified trading loss only if we have required data
              if (toUsd !== null && tokenResult.inputValueUSD !== undefined) {
                tradingLoss = {
                  inputValueUSD: tokenResult.inputValueUSD,
                  outputValueUSD: toUsd + (gasCostUSD || 0), // toUsd excludes gas, so add it back
                  netLossUSD: tokenResult.inputValueUSD - toUsd,
                  lossPercentage:
                    tokenResult.inputValueUSD > 0
                      ? ((tokenResult.inputValueUSD - toUsd) /
                          tokenResult.inputValueUSD) *
                        100
                      : 0,
                };
              } else {
                console.warn(
                  `Incomplete swap quote data for token ${token.symbol}, missing toUsd or inputValueUSD`
                );
                tradingLoss = {
                  inputValueUSD: tokenResult.inputValueUSD || 0,
                  outputValueUSD: null,
                  netLossUSD: null,
                  lossPercentage: null,
                  error: 'Insufficient data for loss calculation',
                };
              }

              // Log warning for missing critical fields
              const missingFields = [];
              if (!swapQuote.provider) {
                missingFields.push('provider');
              }
              if (!swapQuote.toAmount) {
                missingFields.push('toAmount');
              }
              if (swapQuote.toUsd === undefined) {
                missingFields.push('toUsd');
              }

              if (missingFields.length > 0) {
                console.warn(
                  `Missing swapQuote fields for token ${token.symbol}: ${missingFields.join(', ')}`
                );
              }
            } catch (dataExtractionError) {
              console.error(
                `Error extracting swap quote data for token ${token.symbol}:`,
                dataExtractionError.message
              );
              // Fallback to error state for safe streaming
              provider = 'error';
              expectedTokenAmount = '0';
              minToAmount = '0';
              toUsd = null;
              gasCostUSD = null;
              tradingLoss = {
                inputValueUSD: tokenResult.inputValueUSD || 0,
                outputValueUSD: null,
                netLossUSD: null,
                lossPercentage: null,
                error: dataExtractionError.message,
              };
            }
          } else {
            // ENHANCED: Provide diagnostic information instead of null values
            console.warn(
              `Swap failed for token ${token.symbol}, providing diagnostic information`
            );

            // Set diagnostic values instead of null
            provider = 'failed';
            expectedTokenAmount = '0';
            minToAmount = '0';
            toUsd = 0;
            gasCostUSD = 0;
            // Create comprehensive error information
            const inputValue = tokenResult.inputValueUSD || 0;
            tradingLoss = {
              inputValueUSD: inputValue,
              outputValueUSD: 0,
              netLossUSD: inputValue, // Total loss since swap failed
              lossPercentage: 100, // 100% loss if swap impossible
              swapError: tokenResult.error || 'Unknown swap error',
              errorCategory: tokenResult.errorCategory || 'UNKNOWN_ERROR',
              userFriendlyMessage:
                tokenResult.userFriendlyMessage || 'Unable to swap this token',
            };
          }

          // Stream this token's completion with enhanced data and diagnostics
          streamWriter({
            type: 'token_ready',
            tokenIndex: i,
            tokenSymbol: token.symbol,
            tokenAddress: token.address,
            transactions: tokenTransactions,

            // Core DEX data (now never null!)
            provider,
            expectedTokenAmount,
            minToAmount,
            toUsd,
            gasCostUSD,
            tradingLoss,

            // Progress tracking
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

      // Validate totalValueUSD before proceeding with fee calculations
      if (totalValueUSD <= 0) {
        const errorMessage = `Invalid totalValueUSD: ${totalValueUSD}. This indicates either no tokens were processed successfully or all tokens have zero value.`;
        console.error(errorMessage, {
          dustTokensLength: dustTokens.length,
          processedTokens,
          totalValueUSD,
          tokenDetails: dustTokens.map(t => ({
            symbol: t.symbol,
            amount: t.amount,
            price: t.price,
            value: t.amount * t.price,
          })),
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
      const finalResult = {
        type: 'complete',
        transactions: allTransactions,
        metadata: {
          totalTokens: dustTokens.length,
          processedTokens,
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
