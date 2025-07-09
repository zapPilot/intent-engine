const TokenBucket = require('./tokenBucket');

/**
 * Rate Limit Manager for multiple providers
 */
class RateLimitManager {
  constructor() {
    this.buckets = new Map();
  }

  /**
   * Initialize a rate limiter for a provider
   * @param {string} provider - Provider name
   * @param {number} rate - Requests per second
   * @param {number} capacity - Maximum requests
   */
  initProvider(provider, rate, capacity) {
    this.buckets.set(provider, new TokenBucket(rate, capacity));
  }

  /**
   * Check if a provider can make a request
   * @param {string} provider - Provider name
   * @param {number} tokens - Number of tokens needed (default: 1)
   * @returns {boolean} - Whether the request can be made
   */
  canRequest(provider, tokens = 1) {
    const bucket = this.buckets.get(provider);
    if (!bucket) {
      console.warn(`No rate limiter configured for provider: ${provider}`);
      return true; // Allow if no rate limiter configured
    }
    return bucket.canConsume(tokens);
  }

  /**
   * Consume tokens for a provider request
   * @param {string} provider - Provider name
   * @param {number} tokens - Number of tokens to consume (default: 1)
   * @returns {boolean} - Whether tokens were successfully consumed
   */
  consumeTokens(provider, tokens = 1) {
    const bucket = this.buckets.get(provider);
    if (!bucket) {
      console.warn(`No rate limiter configured for provider: ${provider}`);
      return true; // Allow if no rate limiter configured
    }
    return bucket.consume(tokens);
  }

  /**
   * Get current token count for a provider
   * @param {string} provider - Provider name
   * @returns {number} - Current token count
   */
  getTokenCount(provider) {
    const bucket = this.buckets.get(provider);
    return bucket ? bucket.getTokens() : Infinity;
  }

  /**
   * Get all rate limiter statuses
   * @returns {Object} - Status of all rate limiters
   */
  getStatus() {
    const status = {};
    for (const [provider, bucket] of this.buckets) {
      status[provider] = {
        tokens: bucket.getTokens(),
        capacity: bucket.capacity,
        rate: bucket.rate,
      };
    }
    return status;
  }
}

module.exports = RateLimitManager;
