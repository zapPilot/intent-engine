/**
 * BaseStreamHandler - Base class for all streaming intent handlers
 * Provides common SSE setup, validation, and error handling patterns
 */

const IntentIdGenerator = require('../utils/intentIdGenerator');
const { SSEStreamManager } = require('../services/SSEStreamManager');

class BaseStreamHandler {
  constructor(intentService) {
    this.intentService = intentService;
  }

  /**
   * Handle streaming request using SSEStreamManager pattern
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  handleStream(req, res) {
    // Use SSEStreamManager's createStreamEndpoint for standardized handling
    const streamHandler = SSEStreamManager.createStreamEndpoint({
      validateParams: req => this.validateRequest(req),
      getExecutionContext: intentId => this.getExecutionContext(intentId),
      processStream: (executionContext, streamWriter) =>
        this.processStream(executionContext, streamWriter),
      cleanup: intentId => this.cleanup(intentId),
      intentType: this.getIntentType(),
    });

    return streamHandler(req, res);
  }

  /**
   * Validate the streaming request
   * @param {Object} req - Express request object
   * @returns {Object} Validation result
   */
  validateRequest(req) {
    return SSEStreamManager.validateIntentId(
      req,
      IntentIdGenerator.validate.bind(IntentIdGenerator),
      IntentIdGenerator.isExpired.bind(IntentIdGenerator)
    );
  }

  /**
   * Get execution context for the intent
   * @param {string} intentId - Intent identifier
   * @returns {Object|null} Execution context
   */
  getExecutionContext(intentId) {
    const handler = this._getIntentHandler();
    return handler?.getExecutionContext(intentId);
  }

  /**
   * Process the streaming operation
   * @param {Object} executionContext - Execution context
   * @param {Function} streamWriter - Stream writer function
   * @returns {Promise<Object>} Processing results
   */
  processStream(_executionContext, _streamWriter) {
    throw new Error('processStream must be implemented by subclass');
  }

  /**
   * Clean up resources after streaming
   * @param {string} intentId - Intent identifier
   */
  cleanup(intentId) {
    const handler = this._getIntentHandler();
    handler?.removeExecutionContext(intentId);
  }

  /**
   * Get the intent type for this handler
   * @returns {string} Intent type
   */
  getIntentType() {
    throw new Error('getIntentType must be implemented by subclass');
  }

  /**
   * Get the intent handler name for this streaming handler
   * @returns {string} Intent handler name
   * @protected
   */
  _getIntentHandlerName() {
    throw new Error('_getIntentHandlerName must be implemented by subclass');
  }

  /**
   * Get the intent handler instance
   * @returns {Object} Intent handler
   * @protected
   */
  _getIntentHandler() {
    return this.intentService.getHandler(this._getIntentHandlerName());
  }
}

module.exports = BaseStreamHandler;
