const { ValidationError } = require('../utils/errors');

/**
 * SSEEventParams - Standardized parameter object for SSE event creation
 * Consolidates the 13+ parameters needed for SSE events into structured objects
 */
class SSEEventParams {
  constructor(params = {}) {
    const {
      tokenIndex,
      token,
      transactions = [],
      processedTokens,
      totalTokens,
      // Swap-specific data
      provider = null,
      expectedTokenAmount = '0',
      minToAmount = '0',
      toUsd = 0,
      gasCostUSD = 0,
      tradingLoss = null,
      // Error-specific data
      error = null,
      errorCategory = null,
      userFriendlyMessage = null,
      // Additional metadata
      metadata = {},
    } = params;

    this.tokenIndex = tokenIndex;
    this.token = token;
    this.transactions = transactions;
    this.processedTokens = processedTokens;
    this.totalTokens = totalTokens;
    this.provider = provider;
    this.expectedTokenAmount = expectedTokenAmount;
    this.minToAmount = minToAmount;
    this.toUsd = toUsd;
    this.gasCostUSD = gasCostUSD;
    this.tradingLoss = tradingLoss;
    this.error = error;
    this.errorCategory = errorCategory;
    this.userFriendlyMessage = userFriendlyMessage;
    this.metadata = metadata;
  }

  /**
   * Create params for successful token processing
   * @param {Object} result - TokenProcessingResult
   * @param {number} tokenIndex - Token index
   * @param {number} processedTokens - Processed token count
   * @param {number} totalTokens - Total token count
   * @returns {SSEEventParams}
   */
  static forSuccess(result, tokenIndex, processedTokens, totalTokens) {
    const swapData = result.getSwapData() || {};

    return new SSEEventParams({
      tokenIndex,
      token: result.token,
      transactions: result.transactions,
      processedTokens,
      totalTokens,
      provider: swapData.provider,
      expectedTokenAmount: swapData.expectedTokenAmount,
      minToAmount: swapData.minToAmount,
      toUsd: swapData.toUsd,
      gasCostUSD: swapData.gasCostUSD,
      tradingLoss: result.tradingLoss,
    });
  }

  /**
   * Create params for failed token processing
   * @param {Object} result - TokenProcessingResult
   * @param {number} tokenIndex - Token index
   * @param {number} processedTokens - Processed token count
   * @param {number} totalTokens - Total token count
   * @returns {SSEEventParams}
   */
  static forFailure(result, tokenIndex, processedTokens, totalTokens) {
    return new SSEEventParams({
      tokenIndex,
      token: result.token,
      transactions: [],
      processedTokens,
      totalTokens,
      provider: 'failed',
      error: result.error,
      tradingLoss: result.tradingLoss,
    });
  }

  /**
   * Create params from legacy parameter object (backward compatibility)
   * @param {Object} params - Legacy parameter object
   * @returns {SSEEventParams}
   */
  static fromLegacyParams(params) {
    return new SSEEventParams(params);
  }

  /**
   * Get parameters for token ready event
   * @returns {Object}
   */
  getTokenReadyParams() {
    return {
      tokenIndex: this.tokenIndex,
      token: this.token,
      transactions: this.transactions,
      provider: this.provider,
      expectedTokenAmount: this.expectedTokenAmount,
      minToAmount: this.minToAmount,
      toUsd: this.toUsd,
      gasCostUSD: this.gasCostUSD,
      tradingLoss: this.tradingLoss,
      processedTokens: this.processedTokens,
      totalTokens: this.totalTokens,
    };
  }

  /**
   * Get parameters for token failed event
   * @returns {Object}
   */
  getTokenFailedParams() {
    return {
      tokenIndex: this.tokenIndex,
      token: this.token,
      error: this.error,
      errorCategory: this.errorCategory,
      userFriendlyMessage: this.userFriendlyMessage,
      provider: this.provider || 'failed',
      tradingLoss: this.tradingLoss,
      processedTokens: this.processedTokens,
      totalTokens: this.totalTokens,
    };
  }

  /**
   * Calculate progress percentage
   * @returns {number}
   */
  getProgress() {
    if (!this.totalTokens || this.totalTokens <= 0) {
      return 0;
    }
    return (this.processedTokens + 1) / this.totalTokens;
  }

  /**
   * Validate required fields for the event type
   * @param {string} eventType - 'success' or 'failure'
   */
  validate(eventType) {
    const requiredBase = [
      'tokenIndex',
      'token',
      'processedTokens',
      'totalTokens',
    ];

    for (const field of requiredBase) {
      if (this[field] === undefined || this[field] === null) {
        throw new ValidationError(`SSEEventParams missing required field: ${field}`);
      }
    }

    if (eventType === 'success' && !this.transactions) {
      throw new ValidationError(
        'SSEEventParams for success event must include transactions'
      );
    }

    if (eventType === 'failure' && !this.error) {
      throw new ValidationError('SSEEventParams for failure event must include error');
    }
  }

  /**
   * Clone with updates
   * @param {Object} updates - Fields to update
   * @returns {SSEEventParams}
   */
  clone(updates = {}) {
    return new SSEEventParams({
      tokenIndex: this.tokenIndex,
      token: this.token,
      transactions: this.transactions,
      processedTokens: this.processedTokens,
      totalTokens: this.totalTokens,
      provider: this.provider,
      expectedTokenAmount: this.expectedTokenAmount,
      minToAmount: this.minToAmount,
      toUsd: this.toUsd,
      gasCostUSD: this.gasCostUSD,
      tradingLoss: this.tradingLoss,
      error: this.error,
      errorCategory: this.errorCategory,
      userFriendlyMessage: this.userFriendlyMessage,
      metadata: { ...this.metadata },
      ...updates,
    });
  }
}

module.exports = SSEEventParams;
