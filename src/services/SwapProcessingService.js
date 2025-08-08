/**
 * SwapProcessingService - Reusable swap processing logic with SSE integration
 * Provides unified swap processing for all intent handlers with consistent error handling
 */

const { ethers } = require('ethers');
const TransactionBuilder = require('../transactions/TransactionBuilder');
const SSEEventFactory = require('./SSEEventFactory');
const { SwapErrorClassifier } = require('../utils/SwapErrorClassifier');
const TokenProcessingResult = require('../valueObjects/TokenProcessingResult');
const SwapExecutionContext = require('../valueObjects/SwapExecutionContext');
const SSEEventParams = require('../valueObjects/SSEEventParams');
const SmartFeeInsertionService = require('./SmartFeeInsertionService');

class SwapProcessingService {
  constructor(swapService, priceService) {
    this.swapService = swapService;
    this.priceService = priceService;
    this.smartFeeInsertionService = new SmartFeeInsertionService();
  }

  /**
   * Process a single token with comprehensive error handling and SSE streaming
   * @param {Object} params - Processing parameters
   * @returns {Promise<TokenProcessingResult>} Processing result with transaction data
   */
  async processTokenWithSSE(params) {
    const {
      token,
      tokenIndex,
      context,
      streamWriter,
      progressInfo = {},
    } = params;

    const { processedTokens = tokenIndex, totalTokens = 1 } = progressInfo;

    try {
      // Process the token swap
      const result = await this.processTokenSwap(token, context);

      if (result.isSuccess()) {
        // Create SSE event params using value object
        const eventParams = SSEEventParams.forSuccess(
          result,
          tokenIndex,
          processedTokens,
          totalTokens
        );
        const successEvent = SSEEventFactory.createTokenReadyEvent(
          eventParams.getTokenReadyParams()
        );

        streamWriter(successEvent);
        return result;
      } else {
        // Handle swap failure
        return this.handleTokenFailure(token, result.error || 'Swap failed', {
          tokenIndex,
          streamWriter,
          processedTokens,
          totalTokens,
          swapResult: result,
        });
      }
    } catch (error) {
      // Handle processing exception
      return this.handleTokenFailure(token, error, {
        tokenIndex,
        streamWriter,
        processedTokens,
        totalTokens,
      });
    }
  }

  /**
   * Process a single token swap with unified error handling
   * @param {Object} token - Token to process
   * @param {SwapExecutionContext|Object} context - Processing context (value object or legacy format)
   * @returns {Promise<TokenProcessingResult>} Swap processing result
   */
  async processTokenSwap(token, context) {
    // Convert to value object if needed (backward compatibility)
    const swapContext =
      context instanceof SwapExecutionContext
        ? context
        : SwapExecutionContext.fromExecutionContext({
            ...context,
            params: context,
          });

    try {
      // Calculate input value in USD for diagnostics
      const inputValueUSD = token.amount * token.price;

      // Validate and parse raw_amount_hex_str to prevent DoS attacks
      if (
        !token.raw_amount_hex_str ||
        typeof token.raw_amount_hex_str !== 'string'
      ) {
        throw new Error(`Invalid raw_amount_hex_str: must be a hex string`);
      }

      // Validate hex format to prevent parsing errors
      if (!/^0x[0-9a-fA-F]+$/.test(token.raw_amount_hex_str)) {
        throw new Error(
          `Invalid hex format in raw_amount_hex_str: ${token.raw_amount_hex_str}`
        );
      }

      try {
        token.raw_amount = ethers.getBigInt(token.raw_amount_hex_str);
      } catch (parseError) {
        throw new Error(
          `Failed to parse raw_amount_hex_str as BigInt: ${parseError.message}`
        );
      }

      // Get best swap quote using value object
      const requestParam = swapContext.createSwapRequest(token);

      const swapQuote =
        await this.swapService.getSecondBestSwapQuote(requestParam);

      // Build transactions
      const txBuilder = new TransactionBuilder();

      // Add approve transaction
      txBuilder.addApprove(
        token.address,
        swapQuote.approve_to, // Router address
        token.raw_amount
      );

      // Add swap transaction
      txBuilder.addSwap(swapQuote, `Swap ${token.symbol} to target token`);

      // Calculate trading loss
      const tradingLoss = this.calculateTradingLoss(swapQuote, inputValueUSD);

      return TokenProcessingResult.success({
        token,
        swapQuote,
        transactions: txBuilder.getTransactions(),
        inputValueUSD,
        tradingLoss,
        provider: swapQuote.provider,
      });
    } catch (error) {
      // Return structured error result using value object
      return TokenProcessingResult.failure({
        token,
        error: error.message || 'Unknown swap error',
        inputValueUSD: token.amount * token.price,
      });
    }
  }

  /**
   * Handle token processing failure with consistent error handling
   * @param {Object} token - Token that failed
   * @param {Error|string} error - Error that occurred
   * @param {Object} params - Failure handling parameters
   * @returns {Object} Failure result
   */
  handleTokenFailure(token, error, params = {}) {
    const {
      tokenIndex = 0,
      streamWriter = null,
      processedTokens = 0,
      totalTokens = 1,
      swapResult = null,
    } = params;

    // Classify the error
    const errorClassification = SwapErrorClassifier.classifyError(error, {
      tokenSymbol: token.symbol,
      swapQuote: swapResult?.swapQuote,
      inputValueUSD: token.amount * token.price,
    });

    // Create fallback data
    const fallbackData = SwapErrorClassifier.createFallbackData(
      errorClassification,
      {
        tokenSymbol: token.symbol,
        inputValueUSD: token.amount * token.price,
      }
    );

    // Emit failure event if streamWriter provided
    if (streamWriter) {
      const failureEvent = SSEEventFactory.createTokenFailedEvent({
        tokenIndex,
        token,
        error: errorClassification.errorMessage,
        errorCategory: errorClassification.category,
        userFriendlyMessage: errorClassification.userFriendlyMessage,
        provider: errorClassification.providerState,
        tradingLoss: fallbackData.tradingLoss,
        processedTokens,
        totalTokens,
      });

      streamWriter(failureEvent);
    }

    return {
      success: false,
      token,
      error: errorClassification.errorMessage,
      errorCategory: errorClassification.category,
      inputValueUSD: token.amount * token.price,
      ...fallbackData,
    };
  }

  /**
   * Calculate trading loss for successful swaps
   * @param {Object} swapQuote - Swap quote data
   * @param {number} inputValueUSD - Input value in USD
   * @returns {Object} Trading loss calculation
   */
  calculateTradingLoss(swapQuote, inputValueUSD) {
    try {
      const toUsd = swapQuote.toUsd || 0;
      const gasCostUSD = swapQuote.gasCostUSD || 0;

      if (toUsd !== null && inputValueUSD !== undefined) {
        return {
          inputValueUSD,
          outputValueUSD: toUsd + gasCostUSD, // toUsd excludes gas, so add it back
          netLossUSD: inputValueUSD - toUsd,
          lossPercentage:
            inputValueUSD > 0
              ? ((inputValueUSD - toUsd) / inputValueUSD) * 100
              : 0,
        };
      } else {
        console.warn('Incomplete swap quote data for trading loss calculation');
        return {
          inputValueUSD: inputValueUSD || 0,
          outputValueUSD: null,
          netLossUSD: null,
          lossPercentage: null,
          error: 'Insufficient data for loss calculation',
        };
      }
    } catch (error) {
      console.error('Error calculating trading loss:', error);
      return {
        inputValueUSD: inputValueUSD || 0,
        outputValueUSD: null,
        netLossUSD: null,
        lossPercentage: null,
        error: error.message,
      };
    }
  }

  /**
   * Process multiple tokens with SSE streaming
   * @param {Object} params - Batch processing parameters
   * @param {Array} params.tokens - Tokens to process
   * @param {Object} params.context - Processing context
   * @param {Function} params.streamWriter - SSE stream writer function
   * @param {Function} params.onProgress - Optional progress callback
   * @param {Array} params.feeTransactions - Optional fee transactions to insert dynamically
   * @param {Object} params.insertionStrategy - Optional insertion strategy from SmartFeeInsertionService
   * @returns {Promise<Object>} Batch processing results
   */

  /**
   * Handle token processing result and update progress
   * @param {Object} params - Result handling parameters
   * @returns {number} Updated transaction index
   */
  _handleTokenProcessingResult(params) {
    const {
      tokenResult,
      results,
      tokenIndex,
      token,
      tokens,
      onProgress,
      currentTransactionIndex,
    } = params;

    let updatedTransactionIndex = currentTransactionIndex;

    if (tokenResult.success) {
      results.successful.push(tokenResult);
      results.transactions.push(...tokenResult.transactions);
      results.totalValueUSD += tokenResult.inputValueUSD || 0;
      // Update transaction index count (typically 2 transactions per token: approve + swap)
      updatedTransactionIndex += tokenResult.transactions.length;
    } else {
      results.failed.push(tokenResult);
    }

    // Call progress callback if provided
    if (onProgress) {
      onProgress({
        tokenIndex,
        token,
        result: tokenResult,
        processed: tokenIndex + 1,
        total: tokens.length,
      });
    }

    return updatedTransactionIndex;
  }

  async processTokenWithErrorHandling(token, context, progressInfo) {
    try {
      return await this.processTokenBusiness({
        token,
        tokenIndex: progressInfo.tokenIndex,
        context,
        progressInfo: {
          processedTokens: progressInfo.processedTokens,
          totalTokens: progressInfo.totalTokens,
        },
      });
    } catch (error) {
      console.error(
        `Token ${progressInfo.tokenIndex} processing error:`,
        error
      );
      return {
        isSuccess: () => false,
        error: error,
        toLegacyFormat: () => ({}),
        transactions: [],
      };
    }
  }

  handleTokenResult(tokenResult, results, tokenIndex, token) {
    if (tokenResult.isSuccess()) {
      results.successful.push({
        ...tokenResult.toLegacyFormat(),
        tokenIndex,
        token,
        transactions: tokenResult.transactions || [],
      });
    } else {
      const failureResult = this.handleTokenFailureInternal(
        token,
        tokenResult.error || 'Swap failed',
        {
          tokenIndex,
          processedTokens: tokenIndex,
          totalTokens: results.successful.length + results.failed.length + 1,
        }
      );
      results.failed.push(failureResult);
    }
  }

  handleFeeInsertion(params) {
    const {
      feeTransactions,
      insertionStrategy,
      results,
      processedCount,
      totalTokenCount,
      feeBlockInserted,
    } = params;

    if (!feeTransactions || !insertionStrategy || feeBlockInserted) {
      return feeBlockInserted;
    }

    const currentTransactionCount = results.transactions.length;
    const insertionResult =
      this.smartFeeInsertionService.executeFeeBlockInsertion({
        feeTransactions,
        insertionStrategy,
        transactions: results.transactions,
        currentTransactionCount,
        processedTokenCount: processedCount,
        totalTokenCount,
      });

    if (insertionResult.inserted) {
      console.log(`Fee insertion: ${insertionResult.reason}`);
      return true;
    }

    return false;
  }

  handleFallbackFeeInsertion(feeTransactions, results, feeBlockInserted) {
    if (!feeTransactions || feeBlockInserted) {
      return;
    }

    const fallbackResult =
      this.smartFeeInsertionService.executeFallbackFeeInsertion({
        feeTransactions,
        transactions: results.transactions,
      });

    if (fallbackResult.inserted) {
      console.log(`Fee insertion: ${fallbackResult.reason}`);
    }
  }

  /**
   * Process a single token with business logic only (no SSE streaming)
   * @param {Object} params - Processing parameters
   * @returns {Promise<TokenProcessingResult>} Processing result with transaction data
   */
  async processTokenBusiness(params) {
    const { token, tokenIndex, context, progressInfo = {} } = params;

    const { processedTokens = 0, totalTokens = 1 } = progressInfo;

    try {
      const result = await this.processTokenSwap(token, context);

      if (result.isSuccess()) {
        return result;
      } else {
        return this.handleTokenFailureInternal(
          token,
          result.error || 'Swap failed',
          {
            tokenIndex,
            processedTokens,
            totalTokens,
          }
        );
      }
    } catch (error) {
      console.error(`Token ${tokenIndex} processing error:`, error);
      return this.handleTokenFailureInternal(token, error, {
        tokenIndex,
        processedTokens,
        totalTokens,
      });
    }
  }

  /**
   * Handle token failure without SSE emission (internal version)
   * @param {Object} token - Token that failed
   * @param {Error|string} error - Error that occurred
   * @param {Object} options - Failure handling options
   * @returns {TokenProcessingResult} Failure result object
   */
  handleTokenFailureInternal(token, error, options = {}) {
    const { tokenIndex = 0, processedTokens = 0, totalTokens = 1 } = options;

    console.error(
      `Token processing failed: ${token?.symbol || 'Unknown'} (${token?.address || 'Unknown address'})`,
      {
        error: error?.message || error,
        tokenIndex,
        processedTokens,
        totalTokens,
      }
    );

    const errorClassification = SwapErrorClassifier.classifyError(
      error,
      token?.symbol || 'Unknown'
    );

    return TokenProcessingResult.failure({
      token,
      tokenIndex,
      error: error?.message || error,
      provider: errorClassification.provider,
      inputValueUSD: token?.amount * token?.price || 0,
      metadata: {
        errorType: errorClassification.errorType,
        errorCategory: errorClassification.errorCategory,
        shouldRetry: errorClassification.shouldRetry,
        progress: processedTokens / totalTokens,
      },
    });
  }

  async processTokenBatchWithSSE(params) {
    const {
      tokens,
      context,
      streamWriter,
      onProgress = null,
      feeTransactions = null,
      insertionStrategy = null,
    } = params;

    const results = {
      successful: [],
      failed: [],
      transactions: [],
      totalValueUSD: 0,
    };

    // Initialize fee insertion tracking
    const shouldInsertFees =
      feeTransactions && insertionStrategy && Array.isArray(feeTransactions);
    let insertionPoints = shouldInsertFees
      ? [...insertionStrategy.insertionPoints]
      : [];
    let currentTransactionIndex = 0;
    let feesInserted = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      try {
        // Process fee insertion before token processing using SmartFeeInsertionService
        const feeInsertionResult =
          this.smartFeeInsertionService.processFeeInsertion({
            shouldInsertFees,
            insertionPoints,
            currentTransactionIndex,
            feesInserted,
            feeTransactions,
            results,
          });

        insertionPoints = feeInsertionResult.insertionPoints;
        feesInserted = feeInsertionResult.feesInserted;
        currentTransactionIndex = feeInsertionResult.currentTransactionIndex;

        // Process the token
        const tokenResult = await this.processTokenWithSSE({
          token,
          tokenIndex: i,
          context,
          streamWriter,
          progressInfo: {
            processedTokens: i,
            totalTokens: tokens.length,
          },
        });

        // Handle token processing result and update progress
        currentTransactionIndex = this._handleTokenProcessingResult({
          tokenResult,
          results,
          tokenIndex: i,
          token,
          tokens,
          onProgress,
          currentTransactionIndex,
        });
      } catch (error) {
        console.error(`Failed to process token ${token.symbol}:`, error);

        const failureResult = this.handleTokenFailure(token, error, {
          tokenIndex: i,
          streamWriter,
          processedTokens: i,
          totalTokens: tokens.length,
        });

        results.failed.push(failureResult);
      }
    }

    // Insert any remaining fee transactions as fallback
    this.smartFeeInsertionService.insertRemainingFees({
      shouldInsertFees,
      feesInserted,
      feeTransactions,
      results,
    });

    return results;
  }

  /**
   * Extract processing context from request parameters
   * @param {Object} executionContext - Execution context from intent handler
   * @returns {SwapExecutionContext} Processing context for swap operations
   */
  static createProcessingContext(executionContext) {
    const { chainId, ethPrice, userAddress, params } = executionContext;
    const { toTokenAddress, toTokenDecimals, slippage, referralAddress } =
      params;

    return new SwapExecutionContext({
      chainId,
      ethPrice,
      toTokenPrice: ethPrice, // Assuming ETH as target token
      userAddress,
      // Default to ETH for tests and legacy scenarios
      toTokenAddress:
        toTokenAddress || '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      toTokenDecimals: toTokenDecimals !== undefined ? toTokenDecimals : 18,
      slippage: slippage || 1, // Default 1% slippage
      referralAddress,
    });
  }
}

module.exports = SwapProcessingService;
