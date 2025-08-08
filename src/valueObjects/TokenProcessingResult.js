/**
 * TokenProcessingResult - Standardized result object for token processing operations
 * Replaces complex return objects with a consistent structure
 */
class TokenProcessingResult {
  constructor(params = {}) {
    const {
      success = false,
      token = null,
      tokenIndex = 0,
      swapQuote = null,
      transactions = [],
      inputValueUSD = 0,
      tradingLoss = null,
      error = null,
      provider = null,
      // Additional metadata
      metadata = {},
    } = params;

    this.success = success;
    this.token = token;
    this.tokenIndex = tokenIndex;
    this.swapQuote = swapQuote;
    this.transactions = transactions;
    this.inputValueUSD = inputValueUSD;
    this.tradingLoss = tradingLoss;
    this.error = error;
    this.provider = provider;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Create a successful result
   * @param {Object} params - Success parameters
   * @returns {TokenProcessingResult}
   */
  static success(params = {}) {
    return new TokenProcessingResult({
      ...params,
      success: true,
    });
  }

  /**
   * Create a failed result
   * @param {Object} params - Failure parameters
   * @returns {TokenProcessingResult}
   */
  static failure(params = {}) {
    const { token, error, inputValueUSD = 0 } = params;
    return new TokenProcessingResult({
      success: false,
      token,
      error:
        typeof error === 'string' ? error : error?.message || 'Unknown error',
      inputValueUSD,
      swapQuote: null,
      transactions: [],
      ...params,
    });
  }

  /**
   * Check if this result represents a successful operation
   * @returns {boolean}
   */
  isSuccess() {
    return this.success === true;
  }

  /**
   * Check if this result represents a failed operation
   * @returns {boolean}
   */
  isFailure() {
    return this.success === false;
  }

  /**
   * Get the result in the legacy format for backward compatibility
   * @returns {Object}
   */
  toLegacyFormat() {
    return {
      success: this.success,
      token: this.token,
      swapQuote: this.swapQuote,
      transactions: this.transactions,
      inputValueUSD: this.inputValueUSD,
      tradingLoss: this.tradingLoss,
      error: this.error,
    };
  }

  /**
   * Get swap quote data for SSE events
   * @returns {Object|null}
   */
  getSwapData() {
    if (!this.swapQuote) {
      return null;
    }

    return {
      provider: this.swapQuote.provider,
      expectedTokenAmount: this.swapQuote.toAmount || '0',
      minToAmount: this.swapQuote.minToAmount || '0',
      toUsd: this.swapQuote.toUsd || 0,
      gasCostUSD: this.swapQuote.gasCostUSD || 0,
    };
  }
}

module.exports = TokenProcessingResult;
