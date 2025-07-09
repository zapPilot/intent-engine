const axios = require('axios');
const { getTokenId } = require('../../config/priceConfig');

/**
 * CoinMarketCap Price Provider
 * Ported from Python implementation in rebalance_backend
 */
class CoinMarketCapProvider {
  constructor() {
    this.name = 'coinmarketcap';
    this.baseUrl = 'https://pro-api.coinmarketcap.com/v2/cryptocurrency';
    this.apiKeys = this.initializeApiKeys();
    this.currentKeyIndex = 0;
  }

  /**
   * Initialize API keys from environment variable
   * @returns {Array<string>} - Array of API keys
   */
  initializeApiKeys() {
    const apiKeyString = process.env.COINMARKETCAP_API_KEY || '';
    if (!apiKeyString) {
      console.warn('COINMARKETCAP_API_KEY not configured');
      return [];
    }
    return apiKeyString
      .split(',')
      .map(key => key.trim())
      .filter(key => key);
  }

  /**
   * Get next API key from the rotation
   * @returns {string|null} - Next API key or null if none available
   */
  getNextApiKey() {
    if (this.apiKeys.length === 0) {
      return null;
    }
    const key = this.apiKeys[this.currentKeyIndex];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    return key;
  }

  /**
   * Get price for a single token
   * @param {string} symbol - Token symbol (e.g., 'btc', 'eth')
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Price response
   */
  async getPrice(symbol, options = {}) {
    const tokenId = getTokenId(this.name, symbol);
    if (!tokenId) {
      throw new Error(`Token ${symbol} not supported by ${this.name}`);
    }

    const apiKey = this.getNextApiKey();
    if (!apiKey) {
      throw new Error('No CoinMarketCap API key available');
    }

    const config = {
      method: 'GET',
      url: `${this.baseUrl}/quotes/latest`,
      params: {
        id: tokenId,
        convert: 'USD',
      },
      headers: {
        'X-CMC_PRO_API_KEY': apiKey,
      },
      timeout: options.timeout || 5000,
    };

    try {
      const response = await axios(config);
      const data = response.data;

      if (data.status.error_code !== 0) {
        throw new Error(
          `CoinMarketCap API error: ${data.status.error_message}`
        );
      }

      const priceData = data.data[tokenId]?.quote?.USD;
      if (!priceData) {
        throw new Error(
          `Price data not found for token ${symbol} (ID: ${tokenId})`
        );
      }

      return {
        success: true,
        price: priceData.price,
        symbol: symbol.toLowerCase(),
        provider: this.name,
        timestamp: new Date().toISOString(),
        metadata: {
          tokenId,
          marketCap: priceData.market_cap,
          volume24h: priceData.volume_24h,
          percentChange24h: priceData.percent_change_24h,
        },
      };
    } catch (error) {
      if (error.response) {
        // API returned an error response
        const errorMessage =
          error.response.data?.status?.error_message || error.message;
        throw new Error(`CoinMarketCap API error: ${errorMessage}`);
      } else if (error.request) {
        // Network error
        throw new Error(`CoinMarketCap network error: ${error.message}`);
      } else {
        // Other error
        throw new Error(`CoinMarketCap error: ${error.message}`);
      }
    }
  }

  /**
   * Get prices for multiple tokens in a single request
   * @param {Array<string>} symbols - Array of token symbols
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Bulk price response
   */
  async getBulkPrices(symbols, options = {}) {
    // Get token IDs for all symbols
    const tokenIds = [];
    const symbolToIdMap = {};
    const unsupportedTokens = [];

    for (const symbol of symbols) {
      const tokenId = getTokenId(this.name, symbol);
      if (tokenId) {
        tokenIds.push(tokenId);
        symbolToIdMap[tokenId] = symbol.toLowerCase();
      } else {
        unsupportedTokens.push(symbol.toLowerCase());
      }
    }

    if (tokenIds.length === 0) {
      throw new Error('No supported tokens found for CoinMarketCap');
    }

    const apiKey = this.getNextApiKey();
    if (!apiKey) {
      throw new Error('No CoinMarketCap API key available');
    }

    const config = {
      method: 'GET',
      url: `${this.baseUrl}/quotes/latest`,
      params: {
        id: tokenIds.join(','),
        convert: 'USD',
      },
      headers: {
        'X-CMC_PRO_API_KEY': apiKey,
      },
      timeout: options.timeout || 5000,
    };

    try {
      const response = await axios(config);
      const data = response.data;

      if (data.status.error_code !== 0) {
        throw new Error(
          `CoinMarketCap API error: ${data.status.error_message}`
        );
      }

      const results = {};
      const errors = [];

      // Process successful responses
      for (const [tokenId, tokenData] of Object.entries(data.data)) {
        const symbol = symbolToIdMap[tokenId];
        const priceData = tokenData.quote?.USD;

        if (priceData && symbol) {
          results[symbol] = {
            success: true,
            price: priceData.price,
            symbol,
            provider: this.name,
            timestamp: new Date().toISOString(),
            metadata: {
              tokenId,
              marketCap: priceData.market_cap,
              volume24h: priceData.volume_24h,
              percentChange24h: priceData.percent_change_24h,
            },
          };
        }
      }

      // Add errors for unsupported tokens
      for (const symbol of unsupportedTokens) {
        errors.push({
          symbol,
          error: `Token ${symbol} not supported by ${this.name}`,
          provider: this.name,
        });
      }

      return {
        results,
        errors,
        provider: this.name,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error.response) {
        const errorMessage =
          error.response.data?.status?.error_message || error.message;
        throw new Error(`CoinMarketCap API error: ${errorMessage}`);
      } else if (error.request) {
        throw new Error(`CoinMarketCap network error: ${error.message}`);
      } else {
        throw new Error(`CoinMarketCap error: ${error.message}`);
      }
    }
  }

  /**
   * Check if provider is available
   * @returns {boolean} - Whether provider is available
   */
  isAvailable() {
    return this.apiKeys.length > 0;
  }

  /**
   * Get provider status
   * @returns {Object} - Provider status information
   */
  getStatus() {
    return {
      name: this.name,
      available: this.isAvailable(),
      apiKeysCount: this.apiKeys.length,
      currentKeyIndex: this.currentKeyIndex,
    };
  }
}

module.exports = CoinMarketCapProvider;
