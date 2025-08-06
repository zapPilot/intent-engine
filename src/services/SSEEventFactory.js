/**
 * SSEEventFactory - Standardized SSE event creation for streaming intents
 * Provides consistent event structure and formatting across all SSE endpoints
 */

const { SSE_EVENT_TYPES } = require('../utils/SwapErrorClassifier');

class SSEEventFactory {
  /**
   * Create initial connection event
   * @param {string} intentId - Intent identifier
   * @param {Object} metadata - Initial connection metadata
   * @returns {Object} SSE connection event
   */
  static createConnectionEvent(intentId, metadata = {}) {
    return {
      type: 'connected',
      intentId,
      timestamp: new Date().toISOString(),
      ...metadata,
    };
  }

  /**
   * Create token processing success event
   * @param {Object} params - Token success parameters
   * @returns {Object} SSE token ready event
   */
  static createTokenReadyEvent(params) {
    const {
      tokenIndex,
      token,
      transactions = [],
      provider,
      expectedTokenAmount,
      minToAmount,
      toUsd,
      gasCostUSD,
      tradingLoss,
      processedTokens,
      totalTokens,
    } = params;

    return {
      type: SSE_EVENT_TYPES.TOKEN_READY,
      tokenIndex,
      tokenSymbol: token.symbol,
      tokenAddress: token.address,
      transactions,

      // DEX/swap data
      provider,
      expectedTokenAmount,
      minToAmount,
      toUsd,
      gasCostUSD,
      tradingLoss,

      // Progress tracking
      progress: (processedTokens + 1) / totalTokens,
      processedTokens: processedTokens + 1,
      totalTokens,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create token processing failure event
   * @param {Object} params - Token failure parameters
   * @returns {Object} SSE token failed event
   */
  static createTokenFailedEvent(params) {
    const {
      tokenIndex,
      token,
      error,
      errorCategory,
      userFriendlyMessage,
      provider = 'failed',
      tradingLoss = null,
      processedTokens,
      totalTokens,
    } = params;

    return {
      type: SSE_EVENT_TYPES.TOKEN_FAILED,
      tokenIndex,
      tokenSymbol: token.symbol,
      tokenAddress: token.address,

      // Error information
      error:
        typeof error === 'string' ? error : error?.message || 'Unknown error',
      errorCategory,
      userFriendlyMessage,

      // Fallback data for consistency
      provider,
      expectedTokenAmount: '0',
      minToAmount: '0',
      toUsd: 0,
      gasCostUSD: 0,
      tradingLoss,

      // Progress tracking
      progress: (processedTokens + 1) / totalTokens,
      processedTokens: processedTokens + 1,
      totalTokens,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create processing completion event
   * @param {Object} params - Completion parameters
   * @returns {Object} SSE completion event
   */
  static createCompletionEvent(params) {
    const {
      transactions = [],
      metadata = {},
      totalTokens = 0,
      processedTokens = 0,
      additionalData = {},
    } = params;

    return {
      type: SSE_EVENT_TYPES.COMPLETE,
      transactions,
      metadata: {
        totalTokens,
        processedTokens,
        ...metadata,
      },
      timestamp: new Date().toISOString(),
      ...additionalData,
    };
  }

  /**
   * Create error event for streaming failures
   * @param {string|Error} error - Error that occurred
   * @param {Object} context - Additional error context
   * @returns {Object} SSE error event
   */
  static createErrorEvent(error, context = {}) {
    const { processedTokens = 0, totalTokens = 0 } = context;

    return {
      type: SSE_EVENT_TYPES.ERROR,
      error:
        typeof error === 'string'
          ? error
          : error?.message || 'Processing failed',
      processedTokens,
      totalTokens,
      timestamp: new Date().toISOString(),
      ...context,
    };
  }

  /**
   * Create progress update event
   * @param {Object} params - Progress parameters
   * @returns {Object} SSE progress event
   */
  static createProgressEvent(params) {
    const {
      processedTokens,
      totalTokens,
      currentOperation = 'processing',
      additionalInfo = {},
    } = params;

    return {
      type: 'progress',
      progress: processedTokens / totalTokens,
      processedTokens,
      totalTokens,
      currentOperation,
      timestamp: new Date().toISOString(),
      ...additionalInfo,
    };
  }

  /**
   * Validate event structure before emission
   * @param {Object} event - Event to validate
   * @returns {boolean} True if event is valid
   */
  static validateEvent(event) {
    if (!event || typeof event !== 'object') {
      return false;
    }

    // All events must have type and timestamp
    if (!event.type || !event.timestamp) {
      return false;
    }

    // Validate specific event types
    switch (event.type) {
      case SSE_EVENT_TYPES.TOKEN_READY:
      case SSE_EVENT_TYPES.TOKEN_FAILED:
        return (
          event.tokenSymbol &&
          event.tokenAddress &&
          typeof event.tokenIndex === 'number' &&
          typeof event.processedTokens === 'number' &&
          typeof event.totalTokens === 'number'
        );

      case SSE_EVENT_TYPES.COMPLETE:
        return (
          Array.isArray(event.transactions) &&
          event.metadata &&
          typeof event.metadata === 'object'
        );

      case SSE_EVENT_TYPES.ERROR:
        return typeof event.error === 'string';

      default:
        return true; // Allow custom event types
    }
  }

  /**
   * Format event for SSE transmission
   * @param {Object} event - Event to format
   * @returns {string} SSE-formatted event string
   */
  static formatForSSE(event) {
    if (!this.validateEvent(event)) {
      throw new Error('Invalid event structure for SSE transmission');
    }

    return `data: ${JSON.stringify(event)}\n\n`;
  }

  /**
   * Create stream writer function for consistent SSE output
   * @param {Response} res - Express response object
   * @returns {Function} Stream writer function
   */

  /**
   * Create intent batch transaction event
   * @param {Object} batchData - Batch transaction data
   * @returns {Object} Intent batch event
   */
  static createIntentBatchEvent(batchData) {
    const {
      batchId,
      intentType,
      transactions = [],
      batchIndex = 0,
      totalBatches = 1,
      status = 'completed',
      metadata = {},
      error = null,
    } = batchData;

    const baseEvent = {
      type: SSE_EVENT_TYPES.INTENT_BATCH,
      batchId,
      intentType,
      batchIndex,
      totalBatches,
      progress: (batchIndex + 1) / totalBatches,
      status, // 'processing', 'completed', 'failed'
      timestamp: new Date().toISOString(),
      metadata: {
        batchSize: transactions.length,
        ...metadata,
      },
    };

    // Add appropriate data based on status
    if (status === 'failed' && error) {
      return {
        ...baseEvent,
        error: typeof error === 'string' ? error : error.message,
        transactions: [], // Don't include transactions on failure
      };
    }

    return {
      ...baseEvent,
      transactions,
    };
  }

  /**
   * Create transaction update event for individual transactions
   * @param {Object} txnData - Transaction data
   * @returns {Object} Transaction update event
   */
  static createTransactionUpdateEvent(txnData) {
    const {
      transactionId,
      txnIndex,
      totalTxns,
      status = 'pending',
      transactionHash = null,
      gasUsed = null,
      blockNumber = null,
      error = null,
      metadata = {},
    } = txnData;

    return {
      type: SSE_EVENT_TYPES.TRANSACTION_UPDATE,
      transactionId,
      txnIndex,
      totalTxns,
      progress: (txnIndex + 1) / totalTxns,
      status, // 'pending', 'confirmed', 'failed'
      transactionHash,
      gasUsed,
      blockNumber,
      error: error ? (typeof error === 'string' ? error : error.message) : null,
      timestamp: new Date().toISOString(),
      metadata,
    };
  }

  /**
   * Create stream writer function for consistent SSE output
   * @param {Response} res - Express response object
   * @returns {Function} Stream writer function
   */
  static createStreamWriter(res) {
    return eventData => {
      try {
        const formattedEvent = this.formatForSSE(eventData);
        res.write(formattedEvent);
      } catch (error) {
        console.error('SSE event formatting error:', error);
        // Send basic error event as fallback
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            error: 'Event formatting failed',
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
      }
    };
  }
}

module.exports = SSEEventFactory;
