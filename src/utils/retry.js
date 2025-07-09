const retry = require('retry');

/**
 * Retry function with configurable options
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} - Promise that resolves to the function result
 */
function retryWithBackoff(fn, options = {}) {
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
        if (operation.retry(error)) {
          console.warn(
            `Retry attempt ${currentAttempt} failed:`,
            error.message
          );
          return;
        }
        reject(operation.mainError());
      }
    });
  });
}

module.exports = { retryWithBackoff };
