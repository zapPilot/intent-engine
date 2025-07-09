const axios = require('axios');
const { getTokenId } = require('../../config/priceConfig');

/**
 * CoinGecko Price Provider
 * Uses CoinGecko API for token price data
 */
class CoinGeckoProvider {
  constructor() {
    this.name = 'coingecko';
    this.baseUrl = 'https://api.coingecko.com/api/v3';
    this.terminalBaseUrl = 'https://api.geckoterminal.com/api/v2/simple';
  }

  /**
   * Get price for a single token using coin ID
   * @param {string} symbol - Token symbol (e.g., 'btc', 'eth')
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Price response
   */
  async getPrice(symbol, options = {}) {
    const coinId = getTokenId(this.name, symbol);
    if (!coinId) {
      throw new Error(`Token ${symbol} not supported by ${this.name}`);
    }

    const config = {
      method: 'GET',
      url: `${this.baseUrl}/simple/price`,
      params: {
        ids: coinId,
        vs_currencies: 'usd',
        include_market_cap: true,
        include_24hr_vol: true,
        include_24hr_change: true,
      },
      timeout: options.timeout || 5000,
    };

    try {
      const response = await axios(config);
      const data = response.data;

      const priceData = data[coinId];
      if (!priceData) {
        throw new Error(
          `Price data not found for token ${symbol} (ID: ${coinId})`
        );
      }

      return {
        success: true,
        price: priceData.usd,
        symbol: symbol.toLowerCase(),
        provider: this.name,
        timestamp: new Date().toISOString(),
        metadata: {
          coinId,
          marketCap: priceData.usd_market_cap,
          volume24h: priceData.usd_24h_vol,
          percentChange24h: priceData.usd_24h_change,
        },
      };
    } catch (error) {
      if (error.response) {
        throw new Error(
          `CoinGecko API error: ${error.response.data?.error || error.message}`
        );
      } else if (error.request) {
        throw new Error(`CoinGecko network error: ${error.message}`);
      } else {
        throw new Error(`CoinGecko error: ${error.message}`);
      }
    }
  }

  /**
   * Get prices for multiple tokens using coin IDs
   * @param {Array<string>} symbols - Array of token symbols
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Bulk price response
   */
  async getBulkPrices(symbols, options = {}) {
    const coinIds = [];
    const idToSymbolMap = {};
    const unsupportedTokens = [];

    for (const symbol of symbols) {
      const coinId = getTokenId(this.name, symbol);
      if (coinId) {
        coinIds.push(coinId);
        idToSymbolMap[coinId] = symbol.toLowerCase();
      } else {
        unsupportedTokens.push(symbol.toLowerCase());
      }
    }

    if (coinIds.length === 0) {
      throw new Error('No supported tokens found for CoinGecko');
    }

    const config = {
      method: 'GET',
      url: `${this.baseUrl}/simple/price`,
      params: {
        ids: coinIds.join(','),
        vs_currencies: 'usd',
        include_market_cap: true,
        include_24hr_vol: true,
        include_24hr_change: true,
      },
      timeout: options.timeout || 5000,
    };

    try {
      const response = await axios(config);
      const data = response.data;

      const results = {};
      const errors = [];

      // Process successful responses
      for (const [coinId, priceData] of Object.entries(data)) {
        const symbol = idToSymbolMap[coinId];
        if (priceData && priceData.usd && symbol) {
          results[symbol] = {
            success: true,
            price: priceData.usd,
            symbol,
            provider: this.name,
            timestamp: new Date().toISOString(),
            metadata: {
              coinId,
              marketCap: priceData.usd_market_cap,
              volume24h: priceData.usd_24h_vol,
              percentChange24h: priceData.usd_24h_change,
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
        throw new Error(
          `CoinGecko API error: ${error.response.data?.error || error.message}`
        );
      } else if (error.request) {
        throw new Error(`CoinGecko network error: ${error.message}`);
      } else {
        throw new Error(`CoinGecko error: ${error.message}`);
      }
    }
  }

  /**
   * Get price by token address (alternative method for tokens not in coin list)
   * @param {string} chain - Chain name (e.g., 'ethereum', 'polygon')
   * @param {string} address - Token contract address
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Price response
   */
  async getPriceByAddress(chain, address, options = {}) {
    const config = {
      method: 'GET',
      url: `${this.terminalBaseUrl}/networks/${chain}/token_price/${address}`,
      timeout: options.timeout || 5000,
    };

    try {
      const response = await axios(config);
      const data = response.data;

      const priceData =
        data.data?.attributes?.token_prices?.[address.toLowerCase()];
      if (!priceData) {
        throw new Error(
          `Price data not found for token at address ${address} on ${chain}`
        );
      }

      return {
        success: true,
        price: parseFloat(priceData),
        symbol: `${chain}:${address}`,
        provider: this.name,
        timestamp: new Date().toISOString(),
        metadata: {
          chain,
          address: address.toLowerCase(),
        },
      };
    } catch (error) {
      if (error.response) {
        const errorMessage = error.response.data?.message || error.message;
        throw new Error(`CoinGecko Terminal API error: ${errorMessage}`);
      } else if (error.request) {
        throw new Error(`CoinGecko Terminal network error: ${error.message}`);
      } else {
        throw new Error(`CoinGecko Terminal error: ${error.message}`);
      }
    }
  }

  /**
   * Check if provider is available
   * @returns {boolean} - Whether provider is available
   */
  isAvailable() {
    return true; // CoinGecko doesn't require API key for basic usage
  }

  /**
   * Get provider status
   * @returns {Object} - Provider status information
   */
  getStatus() {
    return {
      name: this.name,
      available: this.isAvailable(),
      requiresApiKey: false,
    };
  }
}

module.exports = CoinGeckoProvider;
