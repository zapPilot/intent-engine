const axios = require('axios');
const { createExternalServiceError } = require('../../utils/errorHandler');

/**
 * Base class for Price Provider Services
 * Provides common functionality for all price providers
 */
class BasePriceProvider {
  constructor(config) {
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.headers = config.headers || {};

    // Optional additional URLs (e.g., for terminal endpoints)
    this.additionalUrls = config.additionalUrls || {};
  }

  /**
   * Indicates whether this provider is available for use.
   * Subclasses can override to add stricter checks (e.g., API key required).
   * @returns {boolean}
   */
  isAvailable() {
    return true;
  }

  /**
   * Get price for a single token - must be implemented by subclasses
   * @param {string} symbol - Token symbol
   * @param {Object} _options - Request options
   * @returns {Promise<Object>} - Price response
   */
  getPrice(symbol, _options = {}) {
    throw new Error('getPrice must be implemented by subclass');
  }

  /**
   * Get prices for multiple tokens - must be implemented by subclasses
   * @param {Array<string>} symbols - Array of token symbols
   * @param {Object} _options - Request options
   * @returns {Promise<Object>} - Bulk price response
   */
  getBulkPrices(symbols, _options = {}) {
    throw new Error('getBulkPrices must be implemented by subclass');
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
    throw createExternalServiceError(this.name, error);
  }

  /**
   * Extract error message from API response
   * @param {Object} response - API error response
   * @returns {string} - Error message
   */
  extractErrorMessage(response) {
    const { data } = response;

    // Common patterns for error messages in API responses
    return (
      data?.error ||
      data?.message ||
      data?.error_message ||
      data?.status?.error_message ||
      response.statusText ||
      'Unknown error'
    );
  }

  /**
   * Format single price response in a consistent structure
   * @param {Object} data - Raw price data
   * @param {string} symbol - Token symbol
   * @param {Object} metadata - Additional metadata
   * @returns {Object} - Formatted price response
   */
  formatPriceResponse(data, symbol, metadata = {}) {
    return {
      success: true,
      price: data.price,
      symbol: symbol.toLowerCase(),
      provider: this.name,
      timestamp: new Date().toISOString(),
      metadata: {
        ...metadata,
        ...data.metadata,
      },
    };
  }

  /**
   * Format bulk price response in a consistent structure
   * @param {Object} prices - Map of symbol to price data
   * @param {Array} errors - Array of errors for failed tokens
   * @returns {Object} - Formatted bulk response
   */
  formatBulkResponse(prices, errors = []) {
    return {
      success: true,
      provider: this.name,
      timestamp: new Date().toISOString(),
      prices,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        total: Object.keys(prices).length + errors.length,
        successful: Object.keys(prices).length,
        failed: errors.length,
      },
    };
  }

  /**
   * Create error object for bulk responses
   * @param {string} symbol - Token symbol
   * @param {string} message - Error message
   * @returns {Object} - Error object
   */
  createTokenError(symbol, message) {
    return {
      symbol: symbol.toLowerCase(),
      error: message,
      provider: this.name,
    };
  }

  /**
   * Build request config with common headers
   * @param {Object} config - Base config
   * @returns {Object} - Config with headers
   */
  buildRequestConfig(config) {
    const headers = { ...this.headers };

    if (this.apiKey) {
      // Different providers use different header names for API keys
      if (this.name === 'coinmarketcap') {
        headers['X-CMC_PRO_API_KEY'] = this.apiKey;
      } else if (this.name === 'coingecko') {
        headers['x-cg-pro-api-key'] = this.apiKey;
      }
    }

    return {
      ...config,
      headers: {
        ...headers,
        ...config.headers,
      },
    };
  }

  /**
   * Basic status information. Subclasses may override/extend.
   * @returns {Object}
   */
  getStatus() {
    return {
      name: this.name,
      available: this.isAvailable(),
      requiresApiKey: false,
      hasApiKey: !!this.apiKey,
    };
  }
}

module.exports = BasePriceProvider;
