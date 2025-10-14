/**
 * In-Memory Cache Manager for Token Balances
 *
 * Provides TTL-based caching with automatic cleanup to prevent memory leaks.
 * Designed for multi-chain token balance data with configurable expiration.
 *
 * Cache Key Format: balance:{chainId}:{address}:{tokenAddresses}
 * Default TTL: 3-5 minutes (configurable)
 */

class BalanceCache {
  constructor(defaultTTL = 180000) {
    // 3 minutes default
    this.cache = new Map();
    this.expirations = new Map();
    this.defaultTTL = defaultTTL;
    this.cleanupInterval = null;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
    };

    // Start cleanup interval (runs every minute)
    this.startCleanup();
  }

  /**
   * Generate cache key from balance request parameters
   * @param {string|number} chainId - Chain ID
   * @param {string} address - Wallet address
   * @param {string[]} [tokenAddresses] - Optional array of token addresses
   * @returns {string} - Cache key
   */
  static generateKey(chainId, address, tokenAddresses = null) {
    const normalizedChain = String(chainId).toLowerCase();
    const normalizedAddress = address.toLowerCase();

    if (tokenAddresses && tokenAddresses.length > 0) {
      // Sort token addresses for consistent keys
      const sortedTokens = [...tokenAddresses]
        .map(t => t.toLowerCase())
        .sort()
        .join(',');
      return `balance:${normalizedChain}:${normalizedAddress}:${sortedTokens}`;
    }

    return `balance:${normalizedChain}:${normalizedAddress}:all`;
  }

  /**
   * Get cached balance data
   * @param {string} key - Cache key
   * @returns {Object|null} - Cached balance data or null if expired/missing
   */
  get(key) {
    const expiresAt = this.expirations.get(key);

    // Check if expired
    if (!expiresAt || Date.now() >= expiresAt) {
      if (this.cache.has(key)) {
        this.delete(key);
        this.stats.evictions++;
      }
      this.stats.misses++;
      return null;
    }

    const data = this.cache.get(key);
    if (data) {
      this.stats.hits++;
      return data;
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Set balance data in cache with TTL
   * @param {string} key - Cache key
   * @param {Object} data - Balance data to cache
   * @param {number} [ttl] - Time to live in milliseconds (optional)
   */
  set(key, data, ttl = null) {
    const expiresAt = Date.now() + (ttl || this.defaultTTL);

    this.cache.set(key, data);
    this.expirations.set(key, expiresAt);
    this.stats.sets++;
  }

  /**
   * Delete specific cache entry
   * @param {string} key - Cache key
   * @returns {boolean} - True if deleted, false if not found
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    this.expirations.delete(key);
    return deleted;
  }

  /**
   * Clear all cache entries for a specific address
   * @param {string} address - Wallet address
   * @returns {number} - Number of entries cleared
   */
  clearAddress(address) {
    const normalizedAddress = address.toLowerCase();
    let cleared = 0;

    for (const key of this.cache.keys()) {
      if (key.includes(`:${normalizedAddress}:`)) {
        this.delete(key);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Clear all cache entries for a specific chain
   * @param {string|number} chainId - Chain ID
   * @returns {number} - Number of entries cleared
   */
  clearChain(chainId) {
    const normalizedChain = String(chainId).toLowerCase();
    let cleared = 0;

    for (const key of this.cache.keys()) {
      if (key.startsWith(`balance:${normalizedChain}:`)) {
        this.delete(key);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.expirations.clear();
    this.stats.evictions += this.cache.size;
  }

  /**
   * Clean up expired entries
   * @returns {number} - Number of entries cleaned
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, expiresAt] of this.expirations.entries()) {
      if (now >= expiresAt) {
        this.delete(key);
        cleaned++;
        this.stats.evictions++;
      }
    }

    return cleaned;
  }

  /**
   * Start automatic cleanup interval
   * @param {number} [interval] - Cleanup interval in ms (default: 60000)
   */
  startCleanup(interval = 60000) {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      const cleaned = this.cleanup();
      if (cleaned > 0) {
        console.warn(`[BalanceCache] Cleaned up ${cleaned} expired entries`);
      }
    }, interval);

    // Prevent cleanup interval from keeping process alive
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stop automatic cleanup interval
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache stats
   */
  getStats() {
    const hitRate =
      this.stats.hits + this.stats.misses > 0
        ? (
            (this.stats.hits / (this.stats.hits + this.stats.misses)) *
            100
          ).toFixed(2)
        : 0;

    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: `${hitRate}%`,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * Estimate memory usage (rough approximation)
   * @returns {string} - Memory usage estimate
   */
  estimateMemoryUsage() {
    const sizeKB = Math.ceil(this.cache.size * 0.5); // Rough estimate: ~0.5KB per entry
    if (sizeKB < 1024) {
      return `${sizeKB} KB`;
    }
    return `${(sizeKB / 1024).toFixed(2)} MB`;
  }

  /**
   * Reset cache statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
    };
  }
}

module.exports = BalanceCache;
