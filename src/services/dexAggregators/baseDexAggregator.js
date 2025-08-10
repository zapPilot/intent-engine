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
}

module.exports = BaseDexAggregator;
