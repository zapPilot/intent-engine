const CoinMarketCapProvider = require('./priceProviders/coinmarketcap');
const CoinGeckoProvider = require('./priceProviders/coingecko');
const RateLimitManager = require('./rateLimiting/rateLimitManager');
const PriceCache = require('./priceService/PriceCache');
const ProviderOrchestrator = require('./priceService/ProviderOrchestrator');
const BulkPriceProcessor = require('./priceService/BulkPriceProcessor');
const { getProviderConfig } = require('../config/priceConfig');

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

    // Initialize focused service classes
    this.priceCache = new PriceCache();
    this.orchestrator = new ProviderOrchestrator(
      this.providers,
      this.rateLimitManager,
      this.priceCache
    );
    this.bulkProcessor = new BulkPriceProcessor(
      this.providers,
      this.rateLimitManager,
      this.priceCache,
      this.orchestrator
    );

    // Maintain backward compatibility with direct cache access
    this.cache = this.priceCache.cache;
    this.cacheTimeouts = this.priceCache.cacheTimeouts;
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
    return this.priceCache.get(symbol);
  }

  /**
   * Set price in cache
   * @param {string} symbol - Token symbol
   * @param {Object} priceData - Price data to cache
   * @param {number} ttl - Time to live in seconds
   */
  setCachedPrice(symbol, priceData, ttl = 180) {
    return this.priceCache.set(symbol, priceData, ttl);
  }

  /**
   * Get price for a single token using fallback logic
   * @param {string} symbol - Token symbol (e.g., 'btc', 'eth')
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Price response
   */
  getPrice(symbol, options = {}) {
    return this.orchestrator.getPrice(symbol, options);
  }

  /**
   * Get prices for multiple tokens using fallback logic
   * @param {Array<string>} symbols - Array of token symbols
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Bulk price response
   */
  getBulkPrices(symbols, options = {}) {
    return this.bulkProcessor.getBulkPrices(symbols, options);
  }

  /**
   * Get supported providers
   * @returns {Array<string>} - List of available provider names
   */
  getSupportedProviders() {
    return this.orchestrator.getAvailableProviders();
  }

  /**
   * Get service status
   * @returns {Object} - Service status information
   */
  getStatus() {
    return {
      providers: this.orchestrator.getProviderStatus(),
      rateLimits: this.rateLimitManager.getStatus(),
      cache: this.priceCache.getStats(),
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.priceCache.clear();
  }
}

module.exports = PriceService;
