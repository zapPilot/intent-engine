/**
 * Enhanced Price Cache - Handles caching concerns for price data with monitoring
 *
 * IMPROVEMENTS:
 * - Aligned TTL with balance cache (3 minutes)
 * - Added cache monitoring and metrics
 * - Stale data detection
 * - Improved logging
 */

class PriceCacheMonitor {
  constructor() {
    this.metrics = {
      hits: 0,
      misses: 0,
      staleHits: 0,
      sets: 0,
      totalCacheAge: 0,
    };
    this.staleThreshold = 300000; // 5 minutes
  }

  recordHit(cacheAge) {
    this.metrics.hits++;
    this.metrics.totalCacheAge += cacheAge;

    if (cacheAge > this.staleThreshold) {
      this.metrics.staleHits++;
      console.warn(
        `[PriceCache] Stale price hit: ${(cacheAge / 1000).toFixed(1)}s old`
      );
    }
  }

  recordMiss() {
    this.metrics.misses++;
  }

  recordSet() {
    this.metrics.sets++;
  }

  getHitRate() {
    const total = this.metrics.hits + this.metrics.misses;
    return total > 0 ? ((this.metrics.hits / total) * 100).toFixed(2) : '0.00';
  }

  getAvgCacheAge() {
    return this.metrics.hits > 0
      ? Math.round(this.metrics.totalCacheAge / this.metrics.hits)
      : 0;
  }

  getStats() {
    return {
      ...this.metrics,
      hitRate: `${this.getHitRate()}%`,
      avgCacheAge: `${(this.getAvgCacheAge() / 1000).toFixed(1)}s`,
      staleHitRate:
        this.metrics.hits > 0
          ? `${((this.metrics.staleHits / this.metrics.hits) * 100).toFixed(2)}%`
          : '0.00%',
    };
  }

  reset() {
    this.metrics = {
      hits: 0,
      misses: 0,
      staleHits: 0,
      sets: 0,
      totalCacheAge: 0,
    };
  }
}

class PriceCache {
  constructor() {
    this.cache = new Map();
    this.cacheTimeouts = new Map();
    this.monitor = new PriceCacheMonitor();
  }

  /**
   * Get cached price if available and not expired (with monitoring)
   * @param {string} symbol - Token symbol
   * @returns {Object|null} - Cached price data or null
   */
  get(symbol) {
    const cacheKey = symbol.toLowerCase();
    const cached = this.cache.get(cacheKey);
    const timeout = this.cacheTimeouts.get(cacheKey);

    if (cached && timeout && Date.now() < timeout) {
      const cacheAge = Date.now() - (cached.timestamp || 0);
      this.monitor.recordHit(cacheAge);
      return cached;
    }

    // Clean up expired cache entries
    if (cached) {
      this.cache.delete(cacheKey);
      this.cacheTimeouts.delete(cacheKey);
    }

    this.monitor.recordMiss();
    return null;
  }

  /**
   * Set price in cache with TTL (aligned with balance cache: 3 minutes)
   * @param {string} symbol - Token symbol
   * @param {Object} priceData - Price data to cache
   * @param {number} ttl - Time to live in seconds (default: 180s = 3 minutes)
   */
  set(symbol, priceData, ttl = 180) {
    const cacheKey = symbol.toLowerCase();

    // Add timestamp to price data
    const dataWithTimestamp = {
      ...priceData,
      timestamp: Date.now(),
    };

    this.cache.set(cacheKey, dataWithTimestamp);
    this.cacheTimeouts.set(cacheKey, Date.now() + ttl * 1000);
    this.monitor.recordSet();
  }

  /**
   * Get cache statistics with monitoring data
   * @returns {Object} - Enhanced cache info
   */
  getStats() {
    const monitorStats = this.monitor.getStats();

    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
      ...monitorStats,
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

  /**
   * Reset monitoring statistics
   */
  resetStats() {
    this.monitor.reset();
  }

  /**
   * Log detailed cache health report
   */
  logHealthReport() {
    const stats = this.getStats();

    console.warn('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.warn('  Price Cache Health Report');
    console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.warn(`  Cache Size:        ${stats.size} tokens`);
    console.warn(`  Hit Rate:          ${stats.hitRate}`);
    console.warn(`  Avg Cache Age:     ${stats.avgCacheAge}`);
    console.warn(`  Stale Hit Rate:    ${stats.staleHitRate}`);
    console.warn(`  Total Hits:        ${stats.hits}`);
    console.warn(`  Total Misses:      ${stats.misses}`);
    console.warn(`  Total Sets:        ${stats.sets}`);
    console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

module.exports = PriceCache;
