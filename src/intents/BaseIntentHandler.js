/**
 * Base Intent Handler - Abstract class for all intent types
 */
class BaseIntentHandler {
  constructor(swapService, priceService, rebalanceClient) {
    this.swapService = swapService;
    this.priceService = priceService;
    this.rebalanceClient = rebalanceClient;
  }

  /**
   * Execute the intent and return transaction array
   * @param {Object} _request - Intent request
   * @returns {Promise<Object>} - Intent response with transactions
   */
  execute(_request) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Validate intent-specific parameters
   * @param {Object} _request - Intent request
   * @throws {Error} - Validation error
   */
  validate(_request) {
    throw new Error('validate() must be implemented by subclass');
  }

  /**
   * Common validation for all intents
   * @param {Object} request - Intent request
   */
  validateCommon(request) {
    const { userAddress, chainId } = request;

    if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      throw new Error('Invalid userAddress: must be a valid Ethereum address');
    }

    if (!chainId || !Number.isInteger(chainId) || chainId <= 0) {
      throw new Error('Invalid chainId: must be a positive integer');
    }
  }
}

module.exports = BaseIntentHandler;
