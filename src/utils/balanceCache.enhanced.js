/**
 * Enhanced In-Memory Cache Manager for Token Balances
 *
 * NEW FEATURES:
 * - Partial cache updates (update single tokens without full invalidation)
 * - Cache monitoring and metrics
 * - Stale data detection and warnings
 * - Improved logging and observability
 * - Cache age tracking
 *
 * Cache Key Format: balance:{chainId}:{address}:{tokenAddresses}
 * Default TTL: 3 minutes (aligned with price cache)
 */

class BalanceCacheMonitor {
  constructor() {
    this.metrics = {
      hits: 0,
      misses: 0,
      staleHits: 0,
      sets: 0,
      evictions: 0,
      invalidations: 0,
      partialUpdates: 0,
      totalCacheAge: 0,
    };
    this.staleThreshold = 300000; // 5 minutes - warn if cache older than this
  }

  recordHit(cacheAge) {
    this.metrics.hits++;
    this.metrics.totalCacheAge += cacheAge;

    if (cacheAge > this.staleThreshold) {
      this.metrics.staleHits++;
      console.warn(
        `[BalanceCache] Stale cache hit: ${(cacheAge / 1000).toFixed(1)}s old`
      );
    }
  }

  recordMiss() {
    this.metrics.misses++;
  }

  recordSet() {
    this.metrics.sets++;
  }

  recordEviction() {
    this.metrics.evictions++;
  }

  recordInvalidation(reason) {
    this.metrics.invalidations++;
    console.log(`[BalanceCache] Invalidated: ${reason}`);
  }

  recordPartialUpdate() {
    this.metrics.partialUpdates++;
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
      evictions: 0,
      invalidations: 0,
      partialUpdates: 0,
      totalCacheAge: 0,
    };
  }
}

class BalanceCache {
  constructor(defaultTTL = 180000) {
    // 3 minutes default (aligned with price cache)
    this.cache = new Map();
    this.expirations = new Map();
    this.defaultTTL = defaultTTL;
    this.cleanupInterval = null;
    this.monitor = new BalanceCacheMonitor();

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
   * Get cached balance data with monitoring
   * @param {string} key - Cache key
   * @returns {Object|null} - Cached balance data or null if expired/missing
   */
  get(key) {
    const expiresAt = this.expirations.get(key);

    // Check if expired
    if (!expiresAt || Date.now() >= expiresAt) {
      if (this.cache.has(key)) {
        this.delete(key);
        this.monitor.recordEviction();
      }
      this.monitor.recordMiss();
      return null;
    }

    const data = this.cache.get(key);
    if (data) {
      const cacheAge = Date.now() - data.timestamp;
      this.monitor.recordHit(cacheAge);
      return data;
    }

    this.monitor.recordMiss();
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

    // Add timestamp to data if not present
    const dataWithTimestamp = {
      ...data,
      timestamp: data.timestamp || Date.now(),
    };

    this.cache.set(key, dataWithTimestamp);
    this.expirations.set(key, expiresAt);
    this.monitor.recordSet();
  }

  /**
   * Update specific token balance without clearing entire cache
   * @param {string|number} chainId - Chain ID
   * @param {string} address - Wallet address
   * @param {string} tokenAddress - Token address to update
   * @param {string} newBalance - New balance value
   * @returns {boolean} - True if update successful, false if cache miss
   */
  updateTokenBalance(chainId, address, tokenAddress, newBalance) {
    const cacheKey = BalanceCache.generateKey(chainId, address, null);
    const cached = this.get(cacheKey);

    if (!cached || !cached.balances) {
      return false;
    }

    // Update specific token in cached balances
    const updatedBalances = cached.balances.map(bal =>
      bal.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
        ? { ...bal, balance: newBalance, lastUpdated: Date.now() }
        : bal
    );

    // Check if token was found and updated
    const wasUpdated = updatedBalances.some(
      bal => bal.lastUpdated && bal.lastUpdated === Date.now()
    );

    if (wasUpdated) {
      this.set(cacheKey, {
        ...cached,
        balances: updatedBalances,
        partialUpdate: true,
        lastPartialUpdate: Date.now(),
      });

      this.monitor.recordPartialUpdate();
      console.log(
        `[BalanceCache] Partial update: ${tokenAddress} on chain ${chainId}`
      );
    }

    return wasUpdated;
  }

  /**
   * Refresh specific tokens without full cache invalidation
   * @param {string|number} chainId - Chain ID
   * @param {string} address - Wallet address
   * @param {string[]} tokenAddresses - Array of token addresses to refresh
   * @param {Function} fetchFn - Async function to fetch fresh token balances
   * @returns {Promise<Object>} - Updated cache data
   */
  async refreshTokens(chainId, address, tokenAddresses, fetchFn) {
    const cacheKey = BalanceCache.generateKey(chainId, address, null);
    const cached = this.get(cacheKey);

    // Fetch fresh data for specified tokens
    const freshData = await fetchFn(chainId, address, tokenAddresses);

    if (!cached) {
      // No existing cache, set fresh data
      this.set(cacheKey, freshData);
      return freshData;
    }

    // Merge fresh data with cached data
    const tokenAddressSet = new Set(tokenAddresses.map(t => t.toLowerCase()));
    const mergedBalances = [
      // Keep cached balances for tokens not being refreshed
      ...cached.balances.filter(
        bal => !tokenAddressSet.has(bal.tokenAddress.toLowerCase())
      ),
      // Add fresh balances for refreshed tokens
      ...freshData.balances,
    ];

    const updated = {
      ...cached,
      balances: mergedBalances,
      partialUpdate: true,
      lastPartialUpdate: Date.now(),
      timestamp: Date.now(),
    };

    this.set(cacheKey, updated);
    this.monitor.recordPartialUpdate();

    console.log(
      `[BalanceCache] Refreshed ${tokenAddresses.length} tokens on chain ${chainId}`
    );
    return updated;
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
   * Clear all cache entries for a specific address (with reason logging)
   * @param {string} address - Wallet address
   * @param {string} reason - Reason for invalidation
   * @returns {number} - Number of entries cleared
   */
  clearAddress(address, reason = 'manual') {
    const normalizedAddress = address.toLowerCase();
    let cleared = 0;

    for (const key of this.cache.keys()) {
      if (key.includes(`:${normalizedAddress}:`)) {
        this.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      this.monitor.recordInvalidation(`address ${address} (${reason})`);
    }

    return cleared;
  }

  /**
   * Clear all cache entries for a specific chain
   * @param {string|number} chainId - Chain ID
   * @param {string} reason - Reason for invalidation
   * @returns {number} - Number of entries cleared
   */
  clearChain(chainId, reason = 'manual') {
    const normalizedChain = String(chainId).toLowerCase();
    let cleared = 0;

    for (const key of this.cache.keys()) {
      if (key.startsWith(`balance:${normalizedChain}:`)) {
        this.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      this.monitor.recordInvalidation(`chain ${chainId} (${reason})`);
    }

    return cleared;
  }

  /**
   * Invalidate cache after transaction completion
   * @param {string|number} chainId - Chain ID where transaction occurred
   * @param {string} address - Wallet address
   * @param {string} txType - Transaction type (zapIn, zapOut, rebalance, etc.)
   * @returns {number} - Number of entries cleared
   */
  invalidateAfterTransaction(chainId, address, txType) {
    const reason = `transaction:${txType}`;
    return this.clearAddress(address, reason);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.expirations.clear();
    this.monitor.recordInvalidation(`full clear (${size} entries)`);
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
        this.monitor.recordEviction();
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
        console.log(`[BalanceCache] Cleaned up ${cleaned} expired entries`);
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
   * Get cache statistics with monitoring data
   * @returns {Object} - Enhanced cache stats
   */
  getStats() {
    const monitorStats = this.monitor.getStats();

    return {
      size: this.cache.size,
      defaultTTL: this.defaultTTL,
      ...monitorStats,
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
    this.monitor.reset();
  }

  /**
   * Log detailed cache health report
   */
  logHealthReport() {
    const stats = this.getStats();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Balance Cache Health Report');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Cache Size:        ${stats.size} entries`);
    console.log(`  Hit Rate:          ${stats.hitRate}`);
    console.log(`  Avg Cache Age:     ${stats.avgCacheAge}`);
    console.log(`  Stale Hit Rate:    ${stats.staleHitRate}`);
    console.log(`  Total Hits:        ${stats.hits}`);
    console.log(`  Total Misses:      ${stats.misses}`);
    console.log(`  Partial Updates:   ${stats.partialUpdates}`);
    console.log(`  Invalidations:     ${stats.invalidations}`);
    console.log(`  Memory Usage:      ${stats.memoryUsage}`);
    console.log(`  TTL:               ${stats.defaultTTL / 1000}s`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

module.exports = BalanceCache;
