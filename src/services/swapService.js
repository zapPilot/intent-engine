const OneInchService = require('./dexAggregators/oneinch');
const ParaswapService = require('./dexAggregators/paraswap');
const ZeroXService = require('./dexAggregators/zerox');
const { retryWithBackoff } = require('../utils/retry');

/**
 * Main Swap Service that orchestrates all DEX aggregators
 */
class SwapService {
  constructor() {
    this.providers = {
      // '1inch': new OneInchService(),
      'paraswap': new ParaswapService(),
      // '0x': new ZeroXService(),
    };
  }

  /**
   * Get the best swap data from the specified provider
   * @param {string} provider - DEX aggregator provider
   * @param {Object} params - Swap parameters
   * @returns {Promise<Object>} - Swap data response
   */
  async getBestSwapData(provider, params) {
    try {
      const service = this.providers[provider];
      if (!service) {
        throw new Error(`Provider ${provider} is not supported`);
      }

      // Add default eth_price if not provided
      const enhancedParams = {
        ...params,
        ethPrice: params.eth_price && params.eth_price !== 'null' 
          ? parseFloat(params.eth_price) 
          : 1000,
      };

      // Use retry logic for API calls
      const swapData = await retryWithBackoff(
        () => service.getSwapData(enhancedParams),
        {
          retries: 1,
          minTimeout: 3000,
          maxTimeout: 10000,
        }
      );

      return swapData;
    } catch (error) {
      console.error(`Error getting swap data from ${provider}:`, error.message);
      throw error;
    }
  }

  /**
   * Get all supported providers
   * @returns {Array<string>} - List of supported providers
   */
  getSupportedProviders() {
    return Object.keys(this.providers);
  }

  /**
   * Check if a provider is supported
   * @param {string} provider - Provider name
   * @returns {boolean} - Whether provider is supported
   */
  isProviderSupported(provider) {
    return this.providers.hasOwnProperty(provider);
  }
}

module.exports = SwapService;