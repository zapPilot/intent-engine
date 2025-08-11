/**
 * Price Cache - Handles caching concerns for price data
 */
class PriceCache {
  constructor() {
    this.cache = new Map();
    this.cacheTimeouts = new Map();
  }

  /**
   * Get cached price if available and not expired
   * @param {string} symbol - Token symbol
   * @returns {Object|null} - Cached price data or null
   */
  get(symbol) {
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
  set(symbol, priceData, ttl = 180) {
    const cacheKey = symbol.toLowerCase();
    this.cache.set(cacheKey, priceData);
    this.cacheTimeouts.set(cacheKey, Date.now() + ttl * 1000);
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache information
   */
  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }

  /**
   * Clear cache
   */
  clear() {
    this.cache.clear();
    this.cacheTimeouts.clear();
  }

  /**
   * Get cached prices for multiple symbols
   * @param {Array<string>} symbols - Array of token symbols
   * @returns {Object} - Object with results and remaining symbols
   */
  getBulk(symbols) {
    const results = {};
    const remaining = new Set(symbols.map(s => s.toLowerCase()));

    for (const symbol of symbols) {
      const cached = this.get(symbol);
      if (cached) {
        results[symbol.toLowerCase()] = {
          ...cached,
          fromCache: true,
        };
        remaining.delete(symbol.toLowerCase());
      }
    }

    return {
      results,
      remaining: Array.from(remaining),
    };
  }
}

module.exports = PriceCache;
