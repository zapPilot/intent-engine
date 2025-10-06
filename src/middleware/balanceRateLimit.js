/**
 * Rate Limiting Middleware for Balance Endpoint
 *
 * Implements two-tier rate limiting:
 * - Per-wallet: 10 requests/minute
 * - Global: 100 requests/minute
 *
 * Uses in-memory Map storage with automatic cleanup of expired entries.
 */

class RateLimiter {
  constructor() {
    // Map<string, { count: number, resetAt: number }>
    this.walletLimits = new Map();
    this.globalLimit = { count: 0, resetAt: Date.now() + 60000 };

    // Cleanup expired entries every 2 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 120000);
  }

  /**
   * Remove expired rate limit entries to prevent memory leaks
   */
  cleanup() {
    const now = Date.now();
    for (const [wallet, data] of this.walletLimits.entries()) {
      if (data.resetAt < now) {
        this.walletLimits.delete(wallet);
      }
    }
  }

  /**
   * Check and increment rate limits for a wallet
   * @param {string} wallet - Ethereum wallet address
   * @returns {{ allowed: boolean, retryAfter?: number, limit?: string }}
   */
  checkLimit(wallet) {
    const now = Date.now();

    // Check global limit (100 req/min)
    if (this.globalLimit.resetAt < now) {
      this.globalLimit = { count: 0, resetAt: now + 60000 };
    }

    if (this.globalLimit.count >= 100) {
      const retryAfter = Math.ceil((this.globalLimit.resetAt - now) / 1000);
      return {
        allowed: false,
        retryAfter,
        limit: 'global',
        message:
          'Global rate limit exceeded. Too many requests across all wallets.',
      };
    }

    // Check per-wallet limit (10 req/min)
    const walletKey = wallet.toLowerCase();
    let walletData = this.walletLimits.get(walletKey);

    if (!walletData || walletData.resetAt < now) {
      walletData = { count: 0, resetAt: now + 60000 };
      this.walletLimits.set(walletKey, walletData);
    }

    if (walletData.count >= 10) {
      const retryAfter = Math.ceil((walletData.resetAt - now) / 1000);
      return {
        allowed: false,
        retryAfter,
        limit: 'wallet',
        message: `Rate limit exceeded for wallet ${wallet}. Maximum 10 requests per minute.`,
      };
    }

    // Increment both counters
    walletData.count++;
    this.globalLimit.count++;

    return { allowed: true };
  }

  /**
   * Get current limit status for a wallet (for monitoring/debugging)
   * @param {string} wallet - Ethereum wallet address
   * @returns {{ walletCount: number, globalCount: number, walletReset: number, globalReset: number }}
   */
  getStatus(wallet) {
    const walletKey = wallet.toLowerCase();
    const walletData = this.walletLimits.get(walletKey);

    return {
      walletCount: walletData?.count || 0,
      globalCount: this.globalLimit.count,
      walletReset: walletData?.resetAt || Date.now(),
      globalReset: this.globalLimit.resetAt,
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.walletLimits.clear();
  }
}

// Singleton instance
const rateLimiter = new RateLimiter();

/**
 * Express middleware for balance endpoint rate limiting
 *
 * Usage:
 *   router.get('/balance', balanceRateLimit, balanceValidator, getBalance);
 *
 * Response headers:
 *   X-RateLimit-Limit-Wallet: 10
 *   X-RateLimit-Remaining-Wallet: 7
 *   X-RateLimit-Reset-Wallet: 1633024800
 *   X-RateLimit-Limit-Global: 100
 *   X-RateLimit-Remaining-Global: 85
 *   Retry-After: 45 (only on 429)
 */
const balanceRateLimit = (req, res, next) => {
  // Extract wallet from query params or body
  const wallet = req.query.wallet || req.body?.wallet;

  if (!wallet) {
    // If no wallet provided, validation will catch it later
    return next();
  }

  const result = rateLimiter.checkLimit(wallet);

  // Add rate limit headers
  const status = rateLimiter.getStatus(wallet);
  res.set({
    'X-RateLimit-Limit-Wallet': '10',
    'X-RateLimit-Remaining-Wallet': Math.max(0, 10 - status.walletCount),
    'X-RateLimit-Reset-Wallet': Math.floor(status.walletReset / 1000),
    'X-RateLimit-Limit-Global': '100',
    'X-RateLimit-Remaining-Global': Math.max(0, 100 - status.globalCount),
  });

  if (!result.allowed) {
    res.set('Retry-After', result.retryAfter);
    return res.status(429).json({
      error: 'Too Many Requests',
      message: result.message,
      limitType: result.limit,
      retryAfter: result.retryAfter,
      retryAfterMs: result.retryAfter * 1000,
    });
  }

  next();
};

// Export for testing
module.exports = balanceRateLimit;
module.exports.RateLimiter = RateLimiter;
module.exports.rateLimiter = rateLimiter;
