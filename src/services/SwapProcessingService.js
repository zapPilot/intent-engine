/**
 * SwapProcessingService - Reusable swap processing logic with SSE integration
 * Provides unified swap processing for all intent handlers with consistent error handling
 */

const { ethers } = require('ethers');
const TransactionBuilder = require('../transactions/TransactionBuilder');
const SSEEventFactory = require('./SSEEventFactory');
const { SwapErrorClassifier } = require('../utils/SwapErrorClassifier');

class SwapProcessingService {
  constructor(swapService, priceService) {
    this.swapService = swapService;
    this.priceService = priceService;
  }

  /**
   * Process a single token with comprehensive error handling and SSE streaming
   * @param {Object} params - Processing parameters
   * @returns {Promise<Object>} Processing result with transaction data
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

      if (SwapErrorClassifier.isSwapSuccessful(result)) {
        // Emit success event
        const successEvent = SSEEventFactory.createTokenReadyEvent({
          tokenIndex,
          token,
          transactions: result.transactions,
          provider: result.swapQuote.provider,
          expectedTokenAmount: result.swapQuote.toAmount || '0',
          minToAmount: result.swapQuote.minToAmount || '0',
          toUsd: result.swapQuote.toUsd || 0,
          gasCostUSD: result.swapQuote.gasCostUSD || 0,
          tradingLoss: result.tradingLoss,
          processedTokens,
          totalTokens,
        });

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
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} Swap processing result
   */
  async processTokenSwap(token, context) {
    const {
      chainId,
      ethPrice,
      toTokenPrice,
      userAddress,
      toTokenAddress,
      toTokenDecimals,
      slippage,
    } = context;

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

      // Get best swap quote
      const requestParam = {
        chainId: chainId,
        fromTokenAddress: token.address,
        fromTokenDecimals: token.decimals,
        toTokenAddress: toTokenAddress,
        toTokenDecimals: toTokenDecimals,
        amount: token.raw_amount,
        fromAddress: userAddress,
        slippage: slippage,
        eth_price: ethPrice,
        toTokenPrice: toTokenPrice,
      };

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

      return {
        success: true,
        token,
        swapQuote,
        transactions: txBuilder.getTransactions(),
        inputValueUSD,
        tradingLoss,
      };
    } catch (error) {
      // Return structured error result
      return {
        success: false,
        token,
        error: error.message || 'Unknown swap error',
        inputValueUSD: token.amount * token.price,
        swapQuote: null,
        transactions: [],
      };
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
   * Process fee insertion before token processing
   * @param {Object} params - Fee insertion parameters
   * @returns {Object} Updated insertion state
   */
  _processFeeInsertion(params) {
    const {
      shouldInsertFees,
      insertionPoints,
      currentTransactionIndex,
      feesInserted,
      feeTransactions,
      results,
    } = params;

    let updatedInsertionPoints = insertionPoints;
    let updatedFeesInserted = feesInserted;
    let updatedTransactionIndex = currentTransactionIndex;

    // Check if we should insert fee transactions before processing this token
    if (
      shouldInsertFees &&
      updatedInsertionPoints.length > 0 &&
      updatedInsertionPoints[0] <= currentTransactionIndex
    ) {
      // Insert fee transactions at this point
      const feesToInsert = Math.min(
        feeTransactions.length - updatedFeesInserted,
        updatedInsertionPoints.length
      );

      for (let j = 0; j < feesToInsert; j++) {
        if (updatedFeesInserted < feeTransactions.length) {
          results.transactions.push(feeTransactions[updatedFeesInserted]);
          updatedFeesInserted++;
          updatedTransactionIndex++;
        }
      }

      // Remove used insertion points
      updatedInsertionPoints = updatedInsertionPoints.slice(feesToInsert);
    }

    return {
      insertionPoints: updatedInsertionPoints,
      feesInserted: updatedFeesInserted,
      currentTransactionIndex: updatedTransactionIndex,
    };
  }

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

  /**
   * Insert remaining fee transactions as fallback
   * @param {Object} params - Remaining fee insertion parameters
   */
  _insertRemainingFees(params) {
    const { shouldInsertFees, feesInserted, feeTransactions, results } = params;

    if (shouldInsertFees && feesInserted < feeTransactions.length) {
      const remainingFees = feeTransactions.slice(feesInserted);
      results.transactions.push(...remainingFees);
      console.log(
        `Inserted ${remainingFees.length} remaining fee transactions at end as fallback`
      );
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
        // Process fee insertion before token processing
        const feeInsertionResult = this._processFeeInsertion({
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
    this._insertRemainingFees({
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
   * @returns {Object} Processing context for swap operations
   */
  static createProcessingContext(executionContext) {
    const { chainId, ethPrice, userAddress, params } = executionContext;
    const { toTokenAddress, toTokenDecimals, slippage } = params;

    return {
      chainId,
      ethPrice,
      toTokenPrice: ethPrice, // Assuming ETH as target token
      userAddress,
      toTokenAddress,
      toTokenDecimals,
      slippage: slippage || 1, // Default 1% slippage
    };
  }
}

module.exports = SwapProcessingService;
