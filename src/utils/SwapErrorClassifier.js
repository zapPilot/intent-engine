/**
 * SwapErrorClassifier - Standardized error categorization and handling for swap operations
 * Provides consistent error structures and classifications across all intent handlers
 */

/**
 * Error categories for swap operations
 */
const ERROR_CATEGORIES = {
  QUOTE_FAILED: 'QUOTE_FAILED',
  DATA_EXTRACTION_ERROR: 'DATA_EXTRACTION_ERROR',
  PROCESSING_ERROR: 'PROCESSING_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

/**
 * Provider states for swap operations
 */
const PROVIDER_STATES = {
  SUCCESS: 'success',
  FAILED: 'failed',
  ERROR: 'error',
  TIMEOUT: 'timeout',
};

/**
 * SSE event types for swap results
 */
const SSE_EVENT_TYPES = {
  TOKEN_READY: 'token_ready',
  TOKEN_FAILED: 'token_failed',
  COMPLETE: 'complete',
  ERROR: 'error',
};

class SwapErrorClassifier {
  /**
   * Classify error and return standardized error information
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Additional context (tokenSymbol, swapQuote, etc.)
   * @returns {Object} Standardized error classification
   */
  static classifyError(error, context = {}) {
    const errorMessage =
      typeof error === 'string' ? error : error?.message || 'Unknown error';
    const { tokenSymbol = 'Unknown', swapQuote = null } = context;

    // Determine error category based on error message and context
    let category = ERROR_CATEGORIES.UNKNOWN_ERROR;
    let providerState = PROVIDER_STATES.ERROR;
    let userFriendlyMessage = `Unable to swap ${tokenSymbol}`;

    if (
      errorMessage.toLowerCase().includes('network') ||
      errorMessage.toLowerCase().includes('timeout')
    ) {
      category = ERROR_CATEGORIES.NETWORK_ERROR;
      providerState = PROVIDER_STATES.TIMEOUT;
      userFriendlyMessage = `Network error while swapping ${tokenSymbol}`;
    } else if (
      errorMessage.toLowerCase().includes('validation') ||
      errorMessage.toLowerCase().includes('invalid')
    ) {
      category = ERROR_CATEGORIES.VALIDATION_ERROR;
      providerState = PROVIDER_STATES.FAILED;
      userFriendlyMessage = `Invalid parameters for ${tokenSymbol} swap`;
    } else if (swapQuote && !swapQuote.provider) {
      category = ERROR_CATEGORIES.DATA_EXTRACTION_ERROR;
      providerState = PROVIDER_STATES.ERROR;
      userFriendlyMessage = `Data processing error for ${tokenSymbol}`;
    } else if (!swapQuote || swapQuote.provider === 'failed') {
      category = ERROR_CATEGORIES.QUOTE_FAILED;
      providerState = PROVIDER_STATES.FAILED;
      userFriendlyMessage = `No swap route found for ${tokenSymbol}`;
    } else {
      category = ERROR_CATEGORIES.PROCESSING_ERROR;
      providerState = PROVIDER_STATES.ERROR;
    }

    return {
      category,
      providerState,
      errorMessage,
      userFriendlyMessage,
      originalError: error,
    };
  }

  /**
   * Create standardized fallback data for failed swaps
   * @param {Object} errorClassification - Result from classifyError()
   * @param {Object} context - Token and swap context
   * @returns {Object} Standardized fallback data structure
   */
  static createFallbackData(errorClassification, context = {}) {
    const { inputValueUSD = 0 } = context;
    const { category, providerState, errorMessage, userFriendlyMessage } =
      errorClassification;

    return {
      // Provider information
      provider: providerState,
      expectedTokenAmount: '0',
      minToAmount: '0',
      toUsd: 0,
      gasCostUSD: 0,

      // Trading loss calculation
      tradingLoss: {
        inputValueUSD,
        outputValueUSD: 0,
        netLossUSD: inputValueUSD, // Total loss since swap failed
        lossPercentage: inputValueUSD > 0 ? 100 : 0, // 100% loss if swap impossible
        swapError: errorMessage,
        errorCategory: category,
        userFriendlyMessage,
      },

      // Error metadata
      errorCategory: category,
      userFriendlyMessage,
      success: false,
    };
  }

  /**
   * Determine appropriate SSE event type based on error classification
   * @param {Object} _errorClassification - Result from classifyError()
   * @returns {string} SSE event type
   */
  static getSSEEventType(_errorClassification) {
    // All swap failures should emit 'token_failed', not 'token_ready'
    return SSE_EVENT_TYPES.TOKEN_FAILED;
  }

  /**
   * Create complete error response for SSE streaming
   * @param {Object} token - Token being processed
   * @param {Error|string} error - Error that occurred
   * @param {number} tokenIndex - Index of token in processing sequence
   * @param {Object} progressInfo - Progress tracking information
   * @returns {Object} Complete SSE error event data
   */
  static createSSEErrorEvent(token, error, tokenIndex, progressInfo = {}) {
    const { processedTokens = 0, totalTokens = 1 } = progressInfo;

    const errorClassification = this.classifyError(error, {
      tokenSymbol: token.symbol,
      inputValueUSD: token.amount * token.price,
    });

    const fallbackData = this.createFallbackData(errorClassification, {
      tokenSymbol: token.symbol,
      inputValueUSD: token.amount * token.price,
    });

    return {
      type: this.getSSEEventType(errorClassification),
      tokenIndex,
      tokenSymbol: token.symbol,
      tokenAddress: token.address,

      // Include fallback data for consistency
      ...fallbackData,

      // Progress tracking
      progress: (processedTokens + 1) / totalTokens,
      processedTokens: processedTokens + 1,
      totalTokens,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check if a swap result indicates success
   * @param {Object} swapResult - Result from swap processing
   * @returns {boolean} True if swap was successful
   */
  static isSwapSuccessful(swapResult) {
    return (
      swapResult &&
      swapResult.success === true &&
      swapResult.swapQuote &&
      swapResult.swapQuote.provider &&
      swapResult.swapQuote.provider !== 'failed' &&
      swapResult.swapQuote.provider !== 'error'
    );
  }
}

module.exports = {
  SwapErrorClassifier,
  ERROR_CATEGORIES,
  PROVIDER_STATES,
  SSE_EVENT_TYPES,
};
