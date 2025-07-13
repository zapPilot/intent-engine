const CoinMarketCapProvider = require('./priceProviders/coinmarketcap');
const CoinGeckoProvider = require('./priceProviders/coingecko');
const RateLimitManager = require('./rateLimiting/rateLimitManager');
const {
  getProvidersByPriority,
  getProviderConfig,
} = require('../config/priceConfig');

/**
 * Main Price Service with fallback logic and rate limiting
 */
class PriceService {
  constructor() {
    this.providers = {
      coinmarketcap: new CoinMarketCapProvider(),
      coingecko: new CoinGeckoProvider(),
    };

    this.rateLimitManager = new RateLimitManager();
    this.initializeRateLimiters();
    this.cache = new Map();
    this.cacheTimeouts = new Map();
  }

  /**
   * Initialize rate limiters for all providers
   */
  initializeRateLimiters() {
    const providerNames = Object.keys(this.providers);
    for (const providerName of providerNames) {
      const config = getProviderConfig(providerName);
      if (config && config.rateLimit) {
        this.rateLimitManager.initProvider(
          providerName,
          config.rateLimit.rate,
          config.rateLimit.capacity
        );
      }
    }
  }

  /**
   * Get cached price if available and not expired
   * @param {string} symbol - Token symbol
   * @returns {Object|null} - Cached price data or null
   */
  getCachedPrice(symbol) {
    const cacheKey = symbol.toLowerCase();
    const cached = this.cache.get(cacheKey);
    const timeout = this.cacheTimeouts.get(cacheKey);
    if (cached && timeout && Date.now() < timeout) {
      return cached;
    }

    // Clean up expired cache entries
    if (cached) {
      this.cache.delete(cacheKey);
      this.cacheTimeouts.delete(cacheKey);
    }

    return null;
  }

  /**
   * Set price in cache
   * @param {string} symbol - Token symbol
   * @param {Object} priceData - Price data to cache
   * @param {number} ttl - Time to live in seconds
   */
  setCachedPrice(symbol, priceData, ttl = 180) {
    const cacheKey = symbol.toLowerCase();
    this.cache.set(cacheKey, priceData);
    this.cacheTimeouts.set(cacheKey, Date.now() + ttl * 1000);
  }

  /**
   * Get price for a single token using fallback logic
   * @param {string} symbol - Token symbol (e.g., 'btc', 'eth')
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Price response
   */
  async getPrice(symbol, options = {}) {
    const { useCache = true, timeout = 5000 } = options;

    // Check cache first
    if (useCache) {
      const cached = this.getCachedPrice(symbol);
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
          this.setCachedPrice(symbol, result);
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
   * Get prices for multiple tokens using fallback logic
   * @param {Array<string>} symbols - Array of token symbols
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Bulk price response
   */
  async getBulkPrices(symbols, options = {}) {
    const { useCache = true, timeout = 5000 } = options;

    const results = {};
    const errors = [];
    const remaining = new Set(symbols.map(s => s.toLowerCase()));

    // Check cache for all symbols first
    if (useCache) {
      for (const symbol of symbols) {
        const cached = this.getCachedPrice(symbol);
        if (cached) {
          results[symbol.toLowerCase()] = {
            ...cached,
            fromCache: true,
          };
          remaining.delete(symbol.toLowerCase());
        }
      }
    }

    if (remaining.size === 0) {
      return {
        results,
        errors,
        totalRequested: symbols.length,
        fromCache: symbols.length,
        fromProviders: 0,
      };
    }

    const providers = getProvidersByPriority();
    let fromProviders = 0;

    // Try each provider in priority order
    for (const providerName of providers) {
      if (remaining.size === 0) {
        break;
      }

      const provider = this.providers[providerName];
      if (!provider || !provider.isAvailable()) {
        continue;
      }

      // Check if provider can handle bulk requests
      if (!provider.getBulkPrices) {
        // Fallback to individual requests
        await this.handleIndividualRequests(
          provider,
          providerName,
          Array.from(remaining),
          results,
          errors,
          remaining,
          timeout,
          useCache
        );
        fromProviders +=
          Object.keys(results).length - (symbols.length - remaining.size);
        continue;
      }

      // Check rate limit (only consume 1 token for bulk request)
      if (!this.rateLimitManager.consumeTokens(providerName)) {
        continue;
      }

      try {
        const bulkResult = await provider.getBulkPrices(Array.from(remaining), {
          timeout,
        });
        // Process successful results
        for (const [symbol, priceData] of Object.entries(bulkResult.results)) {
          results[symbol] = {
            ...priceData,
            fromCache: false,
          };
          remaining.delete(symbol);
          fromProviders++;

          // Cache successful results
          if (useCache) {
            this.setCachedPrice(symbol, priceData);
          }
        }

        // Add errors from this provider
        if (bulkResult.errors) {
          errors.push(...bulkResult.errors);
        }
      } catch (error) {
        console.error(
          `Bulk request error from provider ${providerName}:`,
          error.message
        );
        // If bulk request fails, try individual requests as fallback
        await this.handleIndividualRequests(
          provider,
          providerName,
          Array.from(remaining),
          results,
          errors,
          remaining,
          timeout,
          useCache
        );
      }
    }

    // Add errors for tokens that couldn't be fetched from any provider
    for (const symbol of remaining) {
      errors.push({
        symbol,
        error: 'Failed to get price from all providers',
        providers: providers.filter(
          p => this.providers[p] && this.providers[p].isAvailable()
        ),
      });
    }

    return {
      results,
      errors,
      totalRequested: symbols.length,
      fromCache: symbols.length - fromProviders - remaining.size,
      fromProviders,
      failed: remaining.size,
      timestamp: new Date().toISOString(),
    };
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
  async handleIndividualRequests(
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
          this.setCachedPrice(symbol, result);
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
   * Get supported providers
   * @returns {Array<string>} - List of available provider names
   */
  getSupportedProviders() {
    return Object.keys(this.providers).filter(
      name => this.providers[name] && this.providers[name].isAvailable()
    );
  }

  /**
   * Get service status
   * @returns {Object} - Service status information
   */
  getStatus() {
    const providers = {};
    for (const [name, provider] of Object.entries(this.providers)) {
      providers[name] = provider.getStatus();
    }

    return {
      providers,
      rateLimits: this.rateLimitManager.getStatus(),
      cache: {
        size: this.cache.size,
        entries: Array.from(this.cache.keys()),
      },
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheTimeouts.clear();
  }
}

module.exports = PriceService;
