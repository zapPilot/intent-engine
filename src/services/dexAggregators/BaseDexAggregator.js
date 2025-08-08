const axios = require('axios');
const {
  InsufficientLiquidityError,
  createExternalServiceError,
} = require('../../utils/errorHandler');

/**
 * Base class for DEX Aggregator Services
 * Provides common functionality for all DEX aggregators
 */
class BaseDexAggregator {
  constructor(config) {
    this.name = config.name;
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;

    // Optional chain-specific configurations
    this.chainConfig = config.chainConfig || {};
  }

  /**
   * Get swap data from DEX API - must be implemented by subclasses
   * @param {Object} _params - Swap parameters
   * @returns {Promise<Object>} - Swap data response
   */
  getSwapData(_params) {
    throw new Error('getSwapData must be implemented by subclass');
  }

  /**
   * Make API request with common error handling
   * @param {Object} config - Axios config
   * @returns {Promise<Object>} - API response
   */
  async makeRequest(config) {
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Handle API errors in a consistent way
   * @param {Error} error - The error to handle
   */
  handleApiError(error) {
    if (error.response) {
      const { data } = error.response;

      // Check for specific error patterns that indicate insufficient liquidity
      const errorMessage = data?.message || data?.error || error.message || '';
      const liquidityPatterns = [
        'insufficient liquidity',
        'no liquidity',
        'liquidity not available',
        'no route found',
        'pair not found',
      ];

      if (
        liquidityPatterns.some(pattern =>
          errorMessage.toLowerCase().includes(pattern)
        )
      ) {
        throw new InsufficientLiquidityError(this.name, errorMessage);
      }

      // Check for 0x specific liquidity flag
      if (this.name === 'zerox' && data?.liquidityAvailable === false) {
        throw new InsufficientLiquidityError(
          this.name,
          'liquidityAvailable: false'
        );
      }

      // For other errors, throw external service error
      throw createExternalServiceError(this.name, error);
    } else {
      // Network or other errors
      throw createExternalServiceError(this.name, error);
    }
  }

  /**
   * Calculate minimum amount considering slippage
   * @param {string} toAmount - Output amount
   * @param {number} slippage - Slippage percentage
   * @returns {number} - Minimum amount
   */
  getMinToAmount(toAmount, slippage) {
    return Math.floor(
      (parseInt(toAmount) * (100 - parseFloat(slippage))) / 100
    );
  }

  /**
   * Convert slippage percentage to basis points
   * @param {number} slippage - Slippage percentage (e.g., 1.5 for 1.5%)
   * @returns {number} - Slippage in basis points
   */
  slippageToBasisPoints(slippage) {
    return parseInt(parseFloat(slippage) * 100);
  }

  /**
   * Calculate gas cost in USD
   * @param {number} gas - Gas amount
   * @param {number} gasPrice - Gas price in wei
   * @param {number} ethPrice - ETH price in USD
   * @returns {number} - Gas cost in USD
   */
  calculateGasCostUSD(gas, gasPrice, ethPrice) {
    return ((parseInt(gas) * parseInt(gasPrice)) / Math.pow(10, 18)) * ethPrice;
  }

  /**
   * Calculate output value in USD
   * @param {string} amount - Token amount
   * @param {number} tokenPrice - Token price in USD
   * @param {number} tokenDecimals - Token decimals
   * @returns {number} - Value in USD
   */
  calculateTokenValueUSD(amount, tokenPrice, tokenDecimals) {
    return (parseInt(amount) * tokenPrice) / Math.pow(10, tokenDecimals);
  }

  /**
   * Format swap response in a consistent structure
   * @param {Object} data - Raw API response data
   * @param {Object} _params - Original request parameters
   * @returns {Object} - Formatted swap data
   */
  formatSwapResponse(data, _params) {
    // This provides a base implementation that can be overridden
    return {
      provider: this.name,
      ...data,
    };
  }
}

module.exports = BaseDexAggregator;
