const { getProvidersByPriority } = require('../../config/priceConfig');

/**
 * Provider Orchestrator - Handles provider iteration, availability, and fallback logic
 */
class ProviderOrchestrator {
  constructor(providers, rateLimitManager, cache) {
    this.providers = providers;
    this.rateLimitManager = rateLimitManager;
    this.cache = cache;
  }

  /**
   * Get price from the first available provider using fallback logic
   * @param {string} symbol - Token symbol
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Price response
   */
  async getPrice(symbol, options = {}) {
    const { useCache = true, timeout = 5000 } = options;

    // Check cache first
    if (useCache) {
      const cached = this.cache.get(symbol);
      if (cached) {
        return {
          ...cached,
          fromCache: true,
        };
      }
    }

    const providers = getProvidersByPriority();
    const errors = [];

    for (const providerName of providers) {
      const provider = this.providers[providerName];
      if (!provider || !provider.isAvailable()) {
        errors.push({
          provider: providerName,
          error: 'Provider not available',
        });
        continue;
      }

      // Check rate limit
      if (!this.rateLimitManager.consumeTokens(providerName)) {
        errors.push({
          provider: providerName,
          error: 'Rate limit exceeded',
        });
        continue;
      }

      try {
        const result = await provider.getPrice(symbol, { timeout });

        // Cache successful result
        if (useCache && result.success) {
          this.cache.set(symbol, result);
        }

        return {
          ...result,
          fromCache: false,
          providersAttempted: errors.length + 1,
        };
      } catch (error) {
        console.error(
          `Error from provider ${providerName} for ${symbol}:`,
          error.message
        );
        errors.push({
          provider: providerName,
          error: error.message,
        });
      }
    }

    // If all providers failed, throw error with details
    throw new Error(
      `Failed to get price for ${symbol} from all providers: ${JSON.stringify(errors)}`
    );
  }

  /**
   * Handle individual requests for providers that don't support bulk
   * @param {Object} provider - Price provider instance
   * @param {string} providerName - Provider name
   * @param {Array<string>} symbols - Symbols to fetch
   * @param {Object} results - Results object to update
   * @param {Array} errors - Errors array to update
   * @param {Set} remaining - Set of remaining symbols to update
   * @param {number} timeout - Request timeout
   * @param {boolean} useCache - Whether to use caching
   */
  async processIndividualRequests(
    provider,
    providerName,
    symbols,
    results,
    errors,
    remaining,
    timeout,
    useCache
  ) {
    for (const symbol of symbols) {
      if (!remaining.has(symbol)) {
        continue;
      }

      // Check rate limit for each individual request
      if (!this.rateLimitManager.consumeTokens(providerName)) {
        break; // Stop trying this provider if rate limited
      }

      try {
        const result = await provider.getPrice(symbol, { timeout });
        results[symbol] = {
          ...result,
          fromCache: false,
        };
        remaining.delete(symbol);

        // Cache successful result
        if (useCache) {
          this.cache.set(symbol, result);
        }
      } catch (error) {
        errors.push({
          symbol,
          provider: providerName,
          error: error.message,
        });
      }
    }
  }

  /**
   * Get available providers in priority order
   * @returns {Array<string>} - List of available provider names
   */
  getAvailableProviders() {
    const providers = getProvidersByPriority();
    return providers.filter(
      name => this.providers[name] && this.providers[name].isAvailable()
    );
  }

  /**
   * Get provider status information
   * @returns {Object} - Provider status information
   */
  getProviderStatus() {
    const providers = {};
    for (const [name, provider] of Object.entries(this.providers)) {
      providers[name] = provider.getStatus();
    }
    return providers;
  }
}

module.exports = ProviderOrchestrator;
