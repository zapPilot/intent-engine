jest.mock('../src/services/priceProviders/coinmarketcap', () => {
  return jest.fn().mockImplementation(() => ({
    getPrice: jest.fn(async () => {
      throw new Error('CMC down');
    }),
    getBulkPrices: jest.fn(async () => {
      throw new Error('bulk down');
    }),
    isAvailable: jest.fn(() => true),
    getStatus: jest.fn(() => ({ name: 'coinmarketcap', available: true })),
  }));
});

jest.mock('../src/services/priceProviders/coingecko', () => {
  return jest.fn().mockImplementation(() => ({
    getPrice: jest.fn(async symbol => ({
      success: true,
      price: 42,
      symbol,
      provider: 'coingecko',
      timestamp: new Date().toISOString(),
    })),
    getBulkPrices: jest.fn(async symbols => ({
      results: symbols.includes('eth')
        ? { eth: { success: true, price: 1, symbol: 'eth', provider: 'coingecko', timestamp: new Date().toISOString() } }
        : {},
      errors: symbols
        .filter(s => s !== 'eth')
        .map(s => ({ symbol: s, error: 'unsupported', provider: 'coingecko' })),
    })),
    isAvailable: jest.fn(() => true),
    getStatus: jest.fn(() => ({ name: 'coingecko', available: true })),
  }));
});

const PriceService = require('../src/services/priceService');

describe('PriceService advanced scenarios', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to next provider on single getPrice', async () => {
    const service = new PriceService();
    const res = await service.getPrice('btc');
    expect(res.provider).toBe('coingecko');
    expect(res.fromCache).toBe(false);
    expect(res.providersAttempted).toBeGreaterThan(0);
  });

  it('bulk uses provider bulk when available and falls back for others', async () => {
    const service = new PriceService();
    const out = await service.getBulkPrices(['eth', 'unknown'], { useCache: false });
    expect(out.results.eth).toBeDefined();
    expect(out.errors).toEqual(expect.arrayContaining([expect.objectContaining({ symbol: 'unknown' })]));
    expect(out.fromProviders).toBeGreaterThanOrEqual(1);
    expect(out.totalRequested).toBe(2);
  });

  it('getSupportedProviders and getStatus provide info', () => {
    const service = new PriceService();
    const providers = service.getSupportedProviders();
    expect(Array.isArray(providers)).toBe(true);
    const status = service.getStatus();
    expect(status.providers).toBeDefined();
    expect(status.rateLimits).toBeDefined();
    expect(status.cache).toBeDefined();
  });
});