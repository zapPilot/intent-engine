jest.mock('../src/services/priceProviders/coinmarketcap', () => {
  return jest.fn().mockImplementation(() => ({
    getPrice: jest.fn(async symbol => {
      await Promise.resolve();
      return {
        success: true,
        price: 100,
        symbol,
        provider: 'coinmarketcap',
        timestamp: new Date().toISOString(),
      };
    }),
    getBulkPrices: jest.fn(),
    isAvailable: jest.fn(() => true),
    getStatus: jest.fn(() => ({ name: 'coinmarketcap', available: true })),
  }));
});

jest.mock('../src/services/priceProviders/coingecko', () => {
  return jest.fn().mockImplementation(() => ({
    getPrice: jest.fn(async symbol => {
      await Promise.resolve();
      return {
        success: true,
        price: 101,
        symbol,
        provider: 'coingecko',
        timestamp: new Date().toISOString(),
      };
    }),
    getBulkPrices: jest.fn(),
    isAvailable: jest.fn(() => true),
    getStatus: jest.fn(() => ({ name: 'coingecko', available: true })),
  }));
});

const PriceService = require('../src/services/priceService');

describe('PriceService caching', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns cached price on subsequent calls', async () => {
    const service = new PriceService();
    const first = await service.getPrice('btc');
    const second = await service.getPrice('btc');
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(service.providers.coinmarketcap.getPrice).toHaveBeenCalledTimes(1);
  });

  it('bypasses cache when useCache is false', async () => {
    const service = new PriceService();
    await service.getPrice('eth');
    await service.getPrice('eth', { useCache: false });
    expect(service.providers.coinmarketcap.getPrice).toHaveBeenCalledTimes(2);
  });
});
