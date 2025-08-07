/**
 * DustZapStreamHandler - Handles streaming for DustZap intent
 * Leverages BaseStreamHandler for common SSE patterns and focuses on DustZap-specific logic
 */

const BaseStreamHandler = require('./BaseStreamHandler');

class DustZapStreamHandler extends BaseStreamHandler {
  /**
   * Get the intent type for DustZap
   * @returns {string} Intent type
   */
  getIntentType() {
    return 'dustZap';
  }

  /**
   * Get the intent handler name for DustZap
   * @returns {string} Intent handler name
   * @protected
   */
  _getIntentHandlerName() {
    return 'dustZap';
  }

  /**
   * Process DustZap streaming operation
   * @param {Object} executionContext - DustZap execution context
   * @param {Function} streamWriter - Stream writer function
   * @returns {Promise<Object>} Processing results
   */
  processStream(executionContext, streamWriter) {
    const dustZapHandler = this._getIntentHandler();

    // Delegate to the existing DustZap SSE streaming logic
    return dustZapHandler.processTokensWithSSEStreaming(
      executionContext,
      streamWriter
    );
  }

  /**
   * Override execution context retrieval to provide DustZap-specific metadata
   * @param {string} intentId - Intent identifier
   * @returns {Object|null} Execution context with additional metadata
   */
  getExecutionContext(intentId) {
    const executionContext = super.getExecutionContext(intentId);

    if (executionContext) {
      // Add DustZap-specific metadata for SSE initialization
      executionContext.totalItems = executionContext.dustTokens?.length || 0;
    }

    return executionContext;
  }
}

module.exports = DustZapStreamHandler;
