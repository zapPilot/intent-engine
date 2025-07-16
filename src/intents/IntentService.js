const DustZapIntentHandler = require('./DustZapIntentHandler');

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
      throw new Error('Intent type is required and must be a string');
    }

    // Get handler for intent type
    const handler = this.handlers.get(intentType);
    if (!handler) {
      throw new Error(
        `Unknown intent type: ${intentType}. Supported types: ${Array.from(this.handlers.keys()).join(', ')}`
      );
    }

    // Validate request structure
    this.validateRequest(request);

    try {
      // Execute intent
      const result = await handler.execute(request);

      // Ensure result has required fields
      if (!result || typeof result !== 'object') {
        throw new Error('Intent handler returned invalid result');
      }

      // SSE streaming mode returns intentId instead of immediate transactions
      if (result.mode === 'streaming') {
        if (!result.intentId || !result.streamUrl) {
          throw new Error(
            'SSE streaming response must include intentId and streamUrl'
          );
        }
      } else {
        // Traditional mode requires immediate transactions
        if (!result.transactions || !Array.isArray(result.transactions)) {
          throw new Error('Intent handler must return transactions array');
        }
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
      throw new Error('Request must be an object');
    }

    const { userAddress, chainId, params } = request;

    if (!userAddress) {
      throw new Error('userAddress is required');
    }

    if (!chainId) {
      throw new Error('chainId is required');
    }

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
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
}

module.exports = IntentService;
