/**
 * Token Bucket Rate Limiter
 * Ported from Python implementation in rebalance_backend
 */
class TokenBucket {
  constructor(rate, capacity) {
    this.rate = rate; // tokens per second
    this.capacity = capacity; // maximum tokens
    this.tokens = capacity; // current tokens
    this.lastRefill = Date.now();
  }

  /**
   * Consume tokens from the bucket
   * @param {number} tokens - Number of tokens to consume (default: 1)
   * @returns {boolean} - Whether tokens were successfully consumed
   */
  consume(tokens = 1) {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  /**
   * Refill tokens based on elapsed time
   */
  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // convert to seconds
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.rate);
    this.lastRefill = now;
  }

  /**
   * Get current token count
   * @returns {number} - Current number of tokens
   */
  getTokens() {
    this.refill();
    return this.tokens;
  }

  /**
   * Check if tokens are available without consuming
   * @param {number} tokens - Number of tokens to check (default: 1)
   * @returns {boolean} - Whether enough tokens are available
   */
  canConsume(tokens = 1) {
    this.refill();
    return this.tokens >= tokens;
  }
}

module.exports = TokenBucket;
