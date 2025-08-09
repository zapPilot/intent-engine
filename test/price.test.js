const mockGetBulkPrices = jest.fn(async symbols => {
  await Promise.resolve();
  return {
    results: symbols.reduce((acc, symbol) => {
      acc[symbol] = {
        success: true,
        price: 100,
        symbol,
        provider: 'mock',
        timestamp: new Date().toISOString(),
      };
      return acc;
    }, {}),
    errors: [],
    totalRequested: symbols.length,
    fromCache: 0,
    fromProviders: symbols.length,
    failed: 0,
    timestamp: new Date().toISOString(),
  };
});

const mockGetPrice = jest.fn(async symbol => {
  await Promise.resolve();
  if (symbol === 'unsupported-token-xyz') {
    throw new Error('Token unsupported');
  }
  return {
    success: true,
    price: 100,
    symbol,
    provider: 'mock',
    timestamp: new Date().toISOString(),
  };
});

jest.mock('../src/services/priceService', () => {
  return jest.fn().mockImplementation(() => ({
    getBulkPrices: mockGetBulkPrices,
    getPrice: mockGetPrice,
    getSupportedProviders: jest.fn(() => ['mock']),
    getStatus: jest.fn(() => ({
      providers: { mock: { available: true } },
      rateLimits: {},
      cache: { size: 0, entries: [] },
    })),
    clearCache: jest.fn(),
  }));
});

const request = require('supertest');
const app = require('../src/app');
const intentRoutes = require('../src/routes/intents');

describe('Price API Endpoints', () => {
  // Clean up timers to prevent Jest hanging
  afterAll(() => {
    if (intentRoutes.intentService) {
      intentRoutes.intentService.cleanup();
    }
    jest.clearAllTimers();
  });

  // Global cleanup for any remaining handlers
  afterAll(() => {
    jest.clearAllTimers();
  });
  describe('GET /tokens/prices', () => {
    it('should return bulk token prices', async () => {
      const tokens = 'btc,eth';
      const response = await request(app)
        .get('/tokens/prices')
        .query({ tokens })
        .expect(200);

      expect(response.body.results).toBeDefined();
      expect(response.body.totalRequested).toBe(2);
      expect(response.body.timestamp).toBeDefined();
    }, 10000);

    it('should handle tokens with spaces', async () => {
      const tokens = 'btc, eth, usdc';
      const response = await request(app)
        .get('/tokens/prices')
        .query({ tokens })
        .expect(200);

      expect(response.body.results).toBeDefined();
      expect(response.body.totalRequested).toBe(3);
    }, 10000);

    it('should return 400 for missing tokens parameter', async () => {
      const response = await request(app).get('/tokens/prices').expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for empty tokens parameter', async () => {
      const response = await request(app)
        .get('/tokens/prices')
        .query({ tokens: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for empty tokens after comma split', async () => {
      const response = await request(app)
        .get('/tokens/prices')
        .query({ tokens: ',,,,' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for too many tokens', async () => {
      const tokens = Array(101).fill('btc').join(',');
      const response = await request(app)
        .get('/tokens/prices')
        .query({ tokens })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid token symbols', async () => {
      const tokens = 'btc,eth,invalid@token';
      const response = await request(app)
        .get('/tokens/prices')
        .query({ tokens })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      if (response.body.error.details && response.body.error.details[0]) {
        expect(response.body.error.details[0].msg).toContain('invalid token symbol');
      }
    });

    it('should handle cache parameter', async () => {
      const tokens = 'btc';
      const response = await request(app)
        .get('/tokens/prices')
        .query({ tokens, useCache: 'false' })
        .expect(200);

      expect(response.body.results).toBeDefined();
    }, 10000);
  });

  describe('GET /tokens/price/:symbol', () => {
    it('should return single token price', async () => {
      const response = await request(app).get('/tokens/price/btc').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.price).toBeDefined();
      expect(response.body.symbol).toBe('btc');
      expect(response.body.provider).toBeDefined();
    }, 10000);

    it('should handle cache parameter', async () => {
      const response = await request(app)
        .get('/tokens/price/eth')
        .query({ useCache: 'false' })
        .expect(200);

      expect(response.body.success).toBe(true);
    }, 10000);

    it('should return error for unsupported token', async () => {
      const response = await request(app)
        .get('/tokens/price/unsupported-token-xyz')
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /tokens/providers', () => {
    it('should return list of supported price providers', async () => {
      const response = await request(app).get('/tokens/providers').expect(200);

      expect(response.body.providers).toBeDefined();
      expect(Array.isArray(response.body.providers)).toBe(true);
      expect(response.body.status).toBeDefined();
      expect(response.body.rateLimits).toBeDefined();
    });
  });
});

describe('Price Service Unit Tests', () => {
  describe('Token Bucket Rate Limiting', () => {
    it('should create token bucket with correct parameters', () => {
      const TokenBucket = require('../src/services/rateLimiting/tokenBucket');
      const bucket = new TokenBucket(1, 10); // 1 token per second, 10 capacity

      expect(bucket.rate).toBe(1);
      expect(bucket.capacity).toBe(10);
      expect(bucket.tokens).toBeCloseTo(10);
    });

    it('should consume tokens correctly', () => {
      const TokenBucket = require('../src/services/rateLimiting/tokenBucket');
      const bucket = new TokenBucket(1, 10);

      expect(bucket.consume(5)).toBe(true);
      expect(bucket.getTokens()).toBeCloseTo(5);
      expect(bucket.consume(6)).toBe(false);
      expect(bucket.getTokens()).toBeCloseTo(5);
    });
  });

  describe('Price Configuration', () => {
    it('should return providers by priority', () => {
      const { getProvidersByPriority } = require('../src/config/priceConfig');
      const providers = getProvidersByPriority();

      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
      expect(providers[0]).toBe('coinmarketcap'); // Should be first priority
    });

    it('should get token ID for provider', () => {
      const { getTokenId } = require('../src/config/priceConfig');

      expect(getTokenId('coinmarketcap', 'btc')).toBe('1');
      expect(getTokenId('coingecko', 'btc')).toBe('bitcoin');
      expect(getTokenId('coinmarketcap', 'nonexistent')).toBe(null);
    });
  });
});
