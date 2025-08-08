class StaticPriceProvider {
  constructor() {
    this.name = 'static';
    this.prices = {
      btc: 50000,
      eth: 3000,
      usdc: 1,
    };
  }

  getPrice(symbol) {
    const price = this.prices[symbol.toLowerCase()];
    if (price === undefined) {
      throw new Error(`Token ${symbol} not supported by ${this.name}`);
    }
    return {
      success: true,
      price,
      symbol: symbol.toLowerCase(),
      provider: this.name,
      timestamp: new Date().toISOString(),
    };
  }

  getBulkPrices(symbols) {
    const results = {};
    const errors = [];
    for (const s of symbols) {
      const symbol = s.toLowerCase();
      const price = this.prices[symbol];
      if (price === undefined) {
        errors.push({
          symbol,
          error: `Token ${symbol} not supported by ${this.name}`,
          provider: this.name,
        });
      } else {
        results[symbol] = {
          success: true,
          price,
          symbol,
          provider: this.name,
          timestamp: new Date().toISOString(),
        };
      }
    }
    return {
      results,
      errors,
      provider: this.name,
      timestamp: new Date().toISOString(),
    };
  }

  isAvailable() {
    return true;
  }

  getStatus() {
    return { name: this.name, available: true, requiresApiKey: false };
  }
}

module.exports = StaticPriceProvider;
