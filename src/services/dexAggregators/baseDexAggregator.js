/**
 * Base class for DEX Aggregator services providing shared helpers.
 */
class BaseDexAggregator {
  /**
   * Calculate minimum amount considering slippage percent.
   * @param {string|number} toAmount - Output amount in smallest units
   * @param {number|string} slippage - Slippage percentage (e.g., 1 for 1%)
   * @returns {number} - Minimum amount as integer
   */
  getMinToAmount(toAmount, slippage) {
    const amount = parseInt(toAmount, 10);
    const slip = parseFloat(slippage);
    if (!Number.isFinite(amount) || !Number.isFinite(slip)) {
      return 0;
    }
    return Math.floor((amount * (100 - slip)) / 100);
  }

  /**
   * Convert slippage percent to basis points.
   * @param {number|string} slippage - Percent (e.g., 0.5 or 1)
   * @returns {number} - Basis points integer
   */
  slippageToBps(slippage) {
    const slip = parseFloat(slippage);
    if (!Number.isFinite(slip)) {
      return 0;
    }
    return parseInt(slip * 100, 10);
  }

  /**
   * Compute gas cost in USD from a transaction object with gas and gasPrice.
   * @param {{gas:string|number, gasPrice:string|number}} tx - Transaction-like object
   * @param {number} ethPrice - ETH price in USD
   * @returns {number}
   */
  calcGasCostUSDFromTx(tx, ethPrice) {
    if (!tx) {
      return 0;
    }
    const gas = parseInt(tx.gas, 10);
    const gasPrice = parseInt(tx.gasPrice, 10);
    if (!Number.isFinite(gas) || !Number.isFinite(gasPrice)) {
      return 0;
    }
    return ((gas * gasPrice) / Math.pow(10, 18)) * (ethPrice || 0);
  }

  /**
   * Compute USD value of an on-chain amount.
   * @param {string|number} amount - Amount in smallest units
   * @param {number} price - Token price in USD
   * @param {number} decimals - Token decimals
   * @returns {number}
   */
  toUsd(amount, price, decimals) {
    const amt = parseInt(amount, 10);
    const pr = Number(price);
    const dec = Number(decimals);
    if (
      !Number.isFinite(amt) ||
      !Number.isFinite(pr) ||
      !Number.isFinite(dec)
    ) {
      return 0;
    }
    return (amt * pr) / Math.pow(10, dec);
  }

  /**
   * Basic error normalization for HTTP/API errors.
   * Returns an Error with a normalized message and code property.
   * @param {any} error - Raw error from axios or other sources
   * @param {string} provider - Provider name for context
   * @returns {Error}
   */
  normalizeError(error, provider = 'aggregator') {
    const status = error?.response?.status;
    const originalMsg = error?.message || String(error);

    let code = 'UNKNOWN_ERROR';
    if (status === 429 || /rate limit|quota/i.test(originalMsg)) {
      code = 'RATE_LIMITED';
    } else if (status && status >= 500) {
      code = 'UPSTREAM_ERROR';
    } else if (/liquidity|insufficient/i.test(originalMsg)) {
      code = 'NO_LIQUIDITY';
    } else if (/timeout|network|ECONN/i.test(originalMsg)) {
      code = 'NETWORK_ERROR';
    } else if (/unsupported|not found|invalid token/i.test(originalMsg)) {
      code = 'UNSUPPORTED_TOKEN';
    }

    const err = new Error(originalMsg);
    err.code = code;
    err.provider = provider;
    err.status = status;
    // Preserve important original fields for compatibility with retry strategies
    if (error && typeof error === 'object') {
      if (error.response) {
        err.response = error.response;
      }
      if (Object.prototype.hasOwnProperty.call(error, 'liquidityAvailable')) {
        err.liquidityAvailable = error.liquidityAvailable;
      }
      // keep original as cause-like field for debugging
      err.original = error;
    }
    return err;
  }

  /**
   * Shared axios client with sane defaults.
   * Note: Individual services can still pass custom headers/params per request.
   */
  get http() {
    if (!this._http) {
      const axios = require('axios');
      this._http = axios.create({
        timeout: 15000,
        maxContentLength: 2 * 1024 * 1024,
        maxBodyLength: 2 * 1024 * 1024,
      });
    }
    return this._http;
  }
}

module.exports = BaseDexAggregator;
