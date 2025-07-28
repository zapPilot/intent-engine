const retry = require('retry');

/**
 * Retry function with configurable options and custom retry logic
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @param {Function} shouldRetryFn - Custom function to determine if retry should happen
 * @returns {Promise} - Promise that resolves to the function result
 */
function retryWithBackoff(fn, options = {}, shouldRetryFn = null) {
  const defaultOptions = {
    retries: parseInt(process.env.MAX_RETRIES) || 3,
    factor: 2,
    minTimeout: parseInt(process.env.RETRY_DELAY) || 3000,
    maxTimeout: 10000,
    randomize: true,
  };

  const retryOptions = { ...defaultOptions, ...options };
  const operation = retry.operation(retryOptions);

  return new Promise((resolve, reject) => {
    operation.attempt(async currentAttempt => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        // Use custom retry logic if provided
        let shouldRetry = true;
        if (shouldRetryFn) {
          shouldRetry = shouldRetryFn(error, currentAttempt, retryOptions);
        }

        // If custom function says not to retry, reject immediately
        if (!shouldRetry) {
          reject(error);
          return;
        }

        // Otherwise use standard retry logic
        if (operation.retry(error)) {
          console.warn(
            `Retry attempt ${currentAttempt} failed. ${retryOptions.context}:`,
            error.message
          );
          return;
        }
        reject(operation.mainError());
      }
    });
  });
}

/**
 * Provider-specific retry strategies
 * Note: Console logs are intentionally used for retry debugging/monitoring
 */
/* eslint-disable no-console */
const RetryStrategies = {
  /**
   * 1inch retry strategy
   * @param {Error} error - The error that occurred
   * @param {number} attempt - Current attempt number
   * @param {Object} options - Retry options
   * @returns {boolean} - Whether to retry
   */
  oneInch: (error, _attempt, _options) => {
    // Don't retry on these conditions
    if (error.response) {
      const { status, data } = error.response;

      // HTTP 400: Bad request - usually unsupported token or invalid params
      // HTTP 429: Rate limit exceeded
      if (status === 400 || status === 429) {
        console.log(
          `1inch: Not retrying HTTP ${status} error: ${error.message}`
        );
        return false;
      }

      // Check for specific error messages indicating non-retryable issues
      const errorMessage = data?.message || data?.error || error.message || '';
      const nonRetryablePatterns = [
        'token not found',
        'insufficient liquidity',
        'unsupported token',
        'invalid token address',
        'pair not found',
      ];

      if (
        nonRetryablePatterns.some(pattern =>
          errorMessage.toLowerCase().includes(pattern)
        )
      ) {
        console.log(
          `1inch: Not retrying due to error pattern: ${errorMessage}`
        );
        return false;
      }

      // HTTP 401/403: Authentication issues
      if (status === 401 || status === 403) {
        console.log(`1inch: Not retrying authentication error: ${status}`);
        return false;
      }
    }

    // Retry on network errors, timeouts, and 5xx errors
    return true;
  },

  /**
   * Paraswap retry strategy
   * @param {Error} error - The error that occurred
   * @param {number} attempt - Current attempt number
   * @param {Object} options - Retry options
   * @returns {boolean} - Whether to retry
   */
  paraswap: (error, _attempt, _options) => {
    if (error.response) {
      const { status, data } = error.response;

      // HTTP 404: means no liquidity
      // HTTP 500: means internal server error
      // HTTP 400: means huge price impact
      if (status === 404 || status === 500 || status === 400) {
        console.log(
          `Paraswap: Not retrying HTTP ${status} error: ${error.message}`
        );
        return false;
      }

      // Check for Paraswap-specific error patterns
      const errorMessage = data?.message || data?.error || error.message || '';
      const nonRetryablePatterns = [
        'no route found',
        'token not supported',
        'insufficient liquidity',
        'invalid pair',
        'token not found',
      ];

      if (
        nonRetryablePatterns.some(pattern =>
          errorMessage.toLowerCase().includes(pattern)
        )
      ) {
        console.log(
          `Paraswap: Not retrying due to error pattern: ${errorMessage}`
        );
        return false;
      }

      // Authentication errors
      if (status === 401 || status === 403) {
        console.log(`Paraswap: Not retrying authentication error: ${status}`);
        return false;
      }
    }

    return true;
  },

  /**
   * 0x Protocol retry strategy
   * @param {Error} error - The error that occurred
   * @param {number} attempt - Current attempt number
   * @param {Object} options - Retry options
   * @returns {boolean} - Whether to retry
   */
  zeroX: (error, _attempt, _options) => {
    if (error.response) {
      const { status } = error.response;
      if (status === 400 || status === 404) {
        // means no liquidity
        console.log(`0x: Not retrying HTTP ${status} error: ${error.message}`);
        return false;
      }
    } else if (error.liquidityAvailable === false) {
      console.log('0x: Not retrying due to no liquidity');
      return false;
    }
    return true;
  },
};

module.exports = { retryWithBackoff, RetryStrategies };
