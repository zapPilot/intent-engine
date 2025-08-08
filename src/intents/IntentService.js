const DustZapIntentHandler = require('./DustZapIntentHandler');
const { ValidationError, NotFoundError, AppError } = require('../utils/errors');

/**
 * Intent Service - Orchestrates different intent handlers
 */
class IntentService {
  constructor(swapService, priceService, rebalanceClient) {
    this.handlers = new Map();

    // Register intent handlers
    this.handlers.set(
      'dustZap',
      new DustZapIntentHandler(swapService, priceService, rebalanceClient)
    );
    // Future handlers can be added here:
    // this.handlers.set('zapIn', new ZapInIntentHandler(...));
    // this.handlers.set('zapOut', new ZapOutIntentHandler(...));
    // this.handlers.set('rebalance', new RebalanceIntentHandler(...));
  }

  /**
   * Process an intent request
   * @param {string} intentType - Type of intent (dustZap, zapIn, zapOut, rebalance)
   * @param {Object} request - Intent request object
   * @returns {Promise<Object>} - Intent response with transactions
   */
  async processIntent(intentType, request) {
    // Validate intent type
    if (!intentType || typeof intentType !== 'string') {
      throw new ValidationError('Intent type is required and must be a string');
    }

    // Get handler for intent type
    const handler = this.handlers.get(intentType);
    if (!handler) {
      throw new NotFoundError(
        'Intent handler',
        `${intentType}. Supported types: ${Array.from(this.handlers.keys()).join(', ')}`
      );
    }

    // Validate request structure
    this.validateRequest(request);

    try {
      // Execute intent
      const result = await handler.execute(request);

      // Ensure result has required fields
      if (!result || typeof result !== 'object') {
        throw new AppError('Intent handler returned invalid result', 500, 'INVALID_HANDLER_RESULT');
      }

      // All intents now use SSE streaming mode
      if (!result.intentId || !result.streamUrl) {
        throw new AppError(
          'SSE streaming response must include intentId and streamUrl',
          500,
          'INVALID_HANDLER_RESPONSE'
        );
      }

      return result;
    } catch (error) {
      console.error(`Error processing ${intentType} intent:`, error);
      throw error;
    }
  }

  /**
   * Validate basic request structure
   * @param {Object} request - Intent request
   */
  validateRequest(request) {
    if (!request || typeof request !== 'object') {
      throw new ValidationError('Request must be an object');
    }

    const { userAddress, chainId, params } = request;

    if (!userAddress) {
      throw new ValidationError('userAddress is required');
    }

    if (!chainId) {
      throw new ValidationError('chainId is required');
    }

    if (!params || typeof params !== 'object') {
      throw new ValidationError('params object is required');
    }
  }

  /**
   * Get list of supported intent types
   * @returns {Array<string>} - Array of supported intent type names
   */
  getSupportedIntents() {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if an intent type is supported
   * @param {string} intentType - Intent type to check
   * @returns {boolean} - True if intent type is supported
   */
  isIntentSupported(intentType) {
    return this.handlers.has(intentType);
  }

  /**
   * Get handler instance for testing/debugging
   * @param {string} intentType - Intent type
   * @returns {Object|null} - Handler instance or null if not found
   */
  getHandler(intentType) {
    return this.handlers.get(intentType) || null;
  }

  /**
   * Clean up all handlers (cleanup timers, intervals, etc.)
   * Essential for preventing Jest test hanging
   */
  cleanup() {
    for (const [intentType, handler] of this.handlers) {
      if (handler && typeof handler.cleanup === 'function') {
        try {
          handler.cleanup();
        } catch (error) {
          console.warn(
            `Error cleaning up ${intentType} handler:`,
            error.message
          );
        }
      }
    }
  }
}

module.exports = IntentService;
