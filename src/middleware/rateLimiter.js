/**
 * Simple in-memory rate limiter middleware
 * For production, consider using Redis-based rate limiting (e.g., express-rate-limit with Redis store)
 */

class RateLimiter {
  constructor(windowMs = 60000, maxRequests = 100, options = {}) {
    // Allow passing a single options object for readability
    if (typeof windowMs === 'object' && windowMs !== null) {
      options = windowMs;
      windowMs = options.windowMs ?? 60000;
      maxRequests = options.maxRequests ?? 100;
    }

    this.windowMs = windowMs; // Time window in milliseconds
    this.maxRequests = maxRequests; // Max requests per window
    this.requests = new Map(); // Store: key -> { count, resetTime }

    this.cleanupInterval = null;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? 60000;
    this.autoStartCleanup =
      options.autoStartCleanup ?? process.env.NODE_ENV !== 'test';

    if (this.autoStartCleanup) {
      this.startCleanup();
    }
  }

  /**
   * Get client identifier from request
   * Priority: API key > IP address
   */
  _getClientKey(req) {
    // Use API key if provided in headers
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      return `apikey:${apiKey}`;
    }

    // Fallback to IP address
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown';

    return `ip:${ip}`;
  }

  /**
   * Clean up expired entries (called periodically)
   */
  _cleanup() {
    const now = Date.now();
    for (const [key, data] of this.requests.entries()) {
      if (now >= data.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  startCleanup() {
    if (this.cleanupInterval) {
      return;
    }

    const interval = setInterval(() => this._cleanup(), this.cleanupIntervalMs);

    if (typeof interval.unref === 'function') {
      interval.unref();
    }

    this.cleanupInterval = interval;
  }

  stopCleanup() {
    if (!this.cleanupInterval) {
      return;
    }

    clearInterval(this.cleanupInterval);
    this.cleanupInterval = null;
  }

  /**
   * Get rate limit middleware function
   */
  middleware() {
    if (!this.cleanupInterval && process.env.NODE_ENV !== 'test') {
      this.startCleanup();
    }

    return (req, res, next) => {
      const clientKey = this._getClientKey(req);
      const now = Date.now();

      // Get or initialize client data
      let clientData = this.requests.get(clientKey);

      if (!clientData || now >= clientData.resetTime) {
        // Reset window
        clientData = {
          count: 0,
          resetTime: now + this.windowMs,
        };
        this.requests.set(clientKey, clientData);
      }

      // Increment request count
      clientData.count++;

      // Set rate limit headers
      const remaining = Math.max(0, this.maxRequests - clientData.count);
      const resetTime = Math.ceil(clientData.resetTime / 1000);

      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetTime);

      // Check if rate limit exceeded
      if (clientData.count > this.maxRequests) {
        const retryAfter = Math.ceil((clientData.resetTime - now) / 1000);
        res.setHeader('Retry-After', retryAfter);

        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
            details: {
              limit: this.maxRequests,
              windowMs: this.windowMs,
              retryAfter: retryAfter,
            },
          },
        });
      }

      next();
    };
  }
}

// Create rate limiters for different endpoints
const balanceRateLimiter = new RateLimiter(60000, 100);
const generalRateLimiter = new RateLimiter(60000, 60);

module.exports = {
  balanceRateLimit: balanceRateLimiter.middleware(),
  generalRateLimit: generalRateLimiter.middleware(),
  RateLimiter, // Export class for custom configurations
  balanceRateLimiter,
  generalRateLimiter,
};
