/**
 * TokenProcessor - Handles individual token processing operations
 * Extracted from SwapProcessingService for better separation of concerns
 */

const { ethers } = require('ethers');
const TransactionBuilder = require('../transactions/TransactionBuilder');
const SSEEventFactory = require('./SSEEventFactory');
const { SwapErrorClassifier } = require('../utils/SwapErrorClassifier');
const TokenProcessingResult = require('../valueObjects/TokenProcessingResult');
const SwapExecutionContext = require('../valueObjects/SwapExecutionContext');
const SSEEventParams = require('../valueObjects/SSEEventParams');

class TokenProcessor {
  constructor(swapService, priceService) {
    this.swapService = swapService;
    this.priceService = priceService;
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
}

module.exports = TokenProcessor;
