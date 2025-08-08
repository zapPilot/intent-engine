const BasePriceProvider = require('./BasePriceProvider');
const { getTokenId } = require('../../config/priceConfig');
const { TokenNotSupportedError } = require('../../utils/errorHandler');

/**
 * CoinMarketCap Price Provider
 * Uses CoinMarketCap API for token price data
 */
class CoinMarketCapProvider extends BasePriceProvider {
  constructor() {
    super({
      name: 'coinmarketcap',
      baseUrl: 'https://pro-api.coinmarketcap.com/v2',
      apiKey: process.env.COINMARKETCAP_API_KEY,
    });

    // Check if API key is configured
    if (!this.apiKey) {
      console.warn('COINMARKETCAP_API_KEY not configured');
    }
  }

  /**
   * Check if provider is available
   * @returns {boolean} - Whether provider is available
   */
  isAvailable() {
    return !!this.apiKey;
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
      throw new TokenNotSupportedError(symbol, this.name);
    }

    const config = this.buildRequestConfig({
      method: 'GET',
      url: `${this.baseUrl}/cryptocurrency/quotes/latest`,
      params: {
        id: tokenId,
        convert: 'USD',
      },
      timeout: options.timeout || 5000,
    });

    const response = await this.makeRequest(config);

    const tokenData = response.data?.[tokenId];
    if (!tokenData) {
      throw new Error(
        `Price data not found for token ${symbol} (ID: ${tokenId})`
      );
    }

    const quote = tokenData.quote?.USD;
    if (!quote) {
      throw new Error(`USD quote not found for token ${symbol}`);
    }

    return this.formatPriceResponse(
      { price: quote.price },
      symbol,
      {
        tokenId,
        name: tokenData.name,
        slug: tokenData.slug,
        marketCap: quote.market_cap,
        volume24h: quote.volume_24h,
        percentChange24h: quote.percent_change_24h,
        percentChange7d: quote.percent_change_7d,
        lastUpdated: quote.last_updated,
      }
    );
  }

  /**
   * Get prices for multiple tokens
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
        symbolToIdMap[symbol.toLowerCase()] = tokenId;
      } else {
        unsupportedTokens.push(symbol.toLowerCase());
      }
    }

    if (tokenIds.length === 0) {
      throw new Error('No supported tokens found for CoinMarketCap');
    }

    const config = this.buildRequestConfig({
      method: 'GET',
      url: `${this.baseUrl}/cryptocurrency/quotes/latest`,
      params: {
        id: tokenIds.join(','),
        convert: 'USD',
      },
      timeout: options.timeout || 5000,
    });

    const response = await this.makeRequest(config);

    const prices = {};
    const errors = [];

    // Process successful responses
    for (const symbol of symbols) {
      const normalizedSymbol = symbol.toLowerCase();
      const tokenId = symbolToIdMap[normalizedSymbol];
      
      if (!tokenId) {
        if (!unsupportedTokens.includes(normalizedSymbol)) {
          errors.push(this.createTokenError(symbol, 'Token not supported'));
        }
        continue;
      }

      const tokenData = response.data?.[tokenId];
      if (!tokenData) {
        errors.push(this.createTokenError(symbol, 'Price data not found'));
        continue;
      }

      const quote = tokenData.quote?.USD;
      if (!quote) {
        errors.push(this.createTokenError(symbol, 'USD quote not found'));
        continue;
      }

      prices[normalizedSymbol] = {
        price: quote.price,
        symbol: normalizedSymbol,
        provider: this.name,
        timestamp: new Date().toISOString(),
        metadata: {
          tokenId,
          name: tokenData.name,
          slug: tokenData.slug,
          marketCap: quote.market_cap,
          volume24h: quote.volume_24h,
          percentChange24h: quote.percent_change_24h,
          percentChange7d: quote.percent_change_7d,
          lastUpdated: quote.last_updated,
        },
      };
    }

    // Add errors for unsupported tokens
    for (const symbol of unsupportedTokens) {
      errors.push(this.createTokenError(symbol, 'Token not supported'));
    }

    return this.formatBulkResponse(prices, errors);
  }

  /**
   * Extract error message from CoinMarketCap response
   * @param {Object} response - API error response
   * @returns {string} - Error message
   */
  extractErrorMessage(response) {
    const { data } = response;
    
    // CoinMarketCap specific error patterns
    if (data?.status?.error_message) {
      return data.status.error_message;
    }
    
    // Fall back to base implementation
    return super.extractErrorMessage(response);
  }

  /**
   * Get provider status
   * @returns {Object} - Provider status information
   */
  getStatus() {
    return {
      name: this.name,
      available: this.isAvailable(),
      requiresApiKey: true,
      hasApiKey: !!this.apiKey,
    };
  }
}

module.exports = CoinMarketCapProvider;
