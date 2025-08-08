const BasePriceProvider = require('./BasePriceProvider');
const { getTokenId } = require('../../config/priceConfig');
const { TokenNotSupportedError } = require('../../utils/errorHandler');

/**
 * CoinGecko Price Provider
 * Uses CoinGecko API for token price data
 */
class CoinGeckoProvider extends BasePriceProvider {
  constructor() {
    super({
      name: 'coingecko',
      baseUrl: 'https://api.coingecko.com/api/v3',
      apiKey: process.env.COINGECKO_API_KEY,
      additionalUrls: {
        terminal: 'https://api.geckoterminal.com/api/v2/simple'
      }
    });
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
      throw new TokenNotSupportedError(symbol, this.name);
    }

    const config = this.buildRequestConfig({
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
    });

    const data = await this.makeRequest(config);

    const priceData = data[coinId];
    if (!priceData) {
      throw new Error(
        `Price data not found for token ${symbol} (ID: ${coinId})`
      );
    }

    return this.formatPriceResponse(
      { price: priceData.usd },
      symbol,
      {
        coinId,
        marketCap: priceData.usd_market_cap,
        volume24h: priceData.usd_24h_vol,
        percentChange24h: priceData.usd_24h_change,
      }
    );
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

    const config = this.buildRequestConfig({
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
    });

    const data = await this.makeRequest(config);

    const prices = {};
    const errors = [];

    // Process successful responses
    for (const [coinId, priceData] of Object.entries(data)) {
      const symbol = idToSymbolMap[coinId];
      if (symbol && priceData) {
        prices[symbol] = {
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
      errors.push(this.createTokenError(symbol, 'Token not supported'));
    }

    // Check for missing prices
    for (const symbol of symbols) {
      const normalizedSymbol = symbol.toLowerCase();
      if (!prices[normalizedSymbol] && !errors.find(e => e.symbol === normalizedSymbol)) {
        errors.push(this.createTokenError(symbol, 'Price data not found'));
      }
    }

    return this.formatBulkResponse(prices, errors);
  }

  /**
   * Get price by token address using GeckoTerminal
   * @param {string} chain - Chain name (e.g., 'eth', 'bsc')
   * @param {string} address - Token contract address
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Price response
   */
  async getPriceByAddress(chain, address, options = {}) {
    const config = this.buildRequestConfig({
      method: 'GET',
      url: `${this.additionalUrls.terminal}/networks/${chain}/token_price/${address}`,
      timeout: options.timeout || 5000,
    });

    const data = await this.makeRequest(config);

    const attributes = data?.data?.attributes;
    if (!attributes || !attributes.token_prices) {
      throw new Error(
        `No price data found for address ${address} on ${chain}`
      );
    }

    const price = parseFloat(attributes.token_prices[address]);
    if (isNaN(price)) {
      throw new Error(
        `Invalid price data for address ${address} on ${chain}`
      );
    }

    return this.formatPriceResponse(
      { price },
      address,
      {
        chain,
        address,
        source: 'geckoterminal',
      }
    );
  }

  /**
   * Extract error message from CoinGecko response
   * @param {Object} response - API error response
   * @returns {string} - Error message
   */
  extractErrorMessage(response) {
    const { data } = response;
    
    // CoinGecko specific error patterns
    if (data?.error) {
      return data.error;
    }
    
    // GeckoTerminal specific error patterns
    if (data?.message) {
      return data.message;
    }
    
    // Fall back to base implementation
    return super.extractErrorMessage(response);
  }
}

module.exports = CoinGeckoProvider;
