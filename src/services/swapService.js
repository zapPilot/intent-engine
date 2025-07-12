const OneInchService = require('./dexAggregators/oneinch');
const ParaswapService = require('./dexAggregators/paraswap');
const ZeroXService = require('./dexAggregators/zerox');
const { retryWithBackoff, RetryStrategies } = require('../utils/retry');

/**
 * Main Swap Service that orchestrates all DEX aggregators
 */
class SwapService {
  constructor() {
    this.providers = {
      '1inch': new OneInchService(),
      paraswap: new ParaswapService(),
      '0x': new ZeroXService(),
    };
  }

  /**
   * Get the best swap quote from all available providers
   * @param {Object} params - Swap parameters
   * @returns {Promise<Object>} - Best swap quote with provider info
   */
  async getBestSwapQuote(params) {
    const enhancedParams = {
      ...params,
      ethPrice:
        params.eth_price && params.eth_price !== 'null'
          ? parseFloat(params.eth_price)
          : 3000,
    };

    const quotes = await Promise.allSettled(
      Object.entries(this.providers).map(async ([providerName, service]) => {
        try {
          // Get provider-specific retry strategy
          const retryStrategy = this.getRetryStrategy(providerName);

          const quote = await retryWithBackoff(
            () => service.getSwapData(enhancedParams),
            {
              retries: 2,
              minTimeout: 1000,
              maxTimeout: 5000,
            },
            retryStrategy
          );
          return {
            provider: providerName,
            quote,
            success: true,
          };
        } catch (error) {
          console.error(
            `Error getting quote from ${providerName}:`,
            error.message
          );
          return {
            provider: providerName,
            error: error.message,
            success: false,
          };
        }
      })
    );

    // Filter successful quotes
    const successfulQuotes = quotes
      .filter(result => result.status === 'fulfilled' && result.value.success)
      .map(result => result.value);
    if (successfulQuotes.length === 0) {
      throw new Error('No providers returned successful quotes');
    }

    // Find the best quote based on toUsd (highest net value after gas costs)
    const bestQuote = successfulQuotes.reduce((best, current) => {
      return current.quote.toUsd > best.quote.toUsd ? current : best;
    });

    return {
      ...bestQuote.quote,
      provider: bestQuote.provider,
      allQuotes: successfulQuotes.map(q => ({
        provider: q.provider,
        toUsd: q.quote.toUsd,
        gasCostUSD: q.quote.gasCostUSD,
        toAmount: q.quote.toAmount,
      })),
    };
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
    return Object.prototype.hasOwnProperty.call(this.providers, provider);
  }

  /**
   * Get provider-specific retry strategy
   * @param {string} providerName - Name of the provider
   * @returns {Function|null} - Retry strategy function or null for default behavior
   */
  getRetryStrategy(providerName) {
    const strategyMap = {
      '1inch': RetryStrategies.oneInch,
      paraswap: RetryStrategies.paraswap,
      '0x': RetryStrategies.zeroX,
    };

    return strategyMap[providerName] || null;
  }
}

module.exports = SwapService;
