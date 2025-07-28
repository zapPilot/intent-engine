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

      // Ensure raw_amount_hex_str is handled as a string to avoid overflow
      token.raw_amount = ethers.getBigInt(token.raw_amount_hex_str);

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
   * @returns {Promise<Object>} Batch processing results
   */
  async processTokenBatchWithSSE(params) {
    const { tokens, context, streamWriter, onProgress = null } = params;

    const results = {
      successful: [],
      failed: [],
      transactions: [],
      totalValueUSD: 0,
    };

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      try {
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

        if (tokenResult.success) {
          results.successful.push(tokenResult);
          results.transactions.push(...tokenResult.transactions);
          results.totalValueUSD += tokenResult.inputValueUSD || 0;
        } else {
          results.failed.push(tokenResult);
        }

        // Call progress callback if provided
        if (onProgress) {
          onProgress({
            tokenIndex: i,
            token,
            result: tokenResult,
            processed: i + 1,
            total: tokens.length,
          });
        }
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
