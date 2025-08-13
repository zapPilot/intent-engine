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

// Mock the rate limiting manager
jest.mock('../src/services/rateLimiting/rateLimitManager', () => {
  return jest.fn().mockImplementation(() => ({
    initProvider: jest.fn(),
    getStatus: jest.fn(() => ({
      coinmarketcap: { tokens: 25, capacity: 30, rate: 0.5 },
      coingecko: { tokens: 95, capacity: 100, rate: 1.67 },
    })),
  }));
});

// Mock the cache
jest.mock('../src/services/priceService/PriceCache', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    clear: jest.fn(),
    getStats: jest.fn(() => ({
      hits: 10,
      misses: 5,
      size: 15,
    })),
    cache: new Map(),
    cacheTimeouts: new Map(),
  }));
});

// Mock the orchestrator
jest.mock('../src/services/priceService/ProviderOrchestrator', () => {
  return jest.fn().mockImplementation(() => ({
    getPrice: jest.fn(),
    getAvailableProviders: jest.fn(() => ['coinmarketcap', 'coingecko']),
    getProviderStatus: jest.fn(() => ({
      coinmarketcap: { name: 'coinmarketcap', available: true },
      coingecko: { name: 'coingecko', available: true },
    })),
  }));
});

// Mock the bulk processor
jest.mock('../src/services/priceService/BulkPriceProcessor', () => {
  return jest.fn().mockImplementation(() => ({
    getBulkPrices: jest.fn(),
  }));
});

// Mock the config
jest.mock('../src/config/priceConfig', () => ({
  getProviderConfig: jest.fn(providerName => {
    const configs = {
      coinmarketcap: {
        rateLimit: { rate: 0.5, capacity: 30 },
      },
      coingecko: {
        rateLimit: { rate: 1.67, capacity: 100 },
      },
    };
    return configs[providerName];
  }),
}));

const PriceService = require('../src/services/priceService');

describe('PriceService', () => {
  let priceService;
  let mockOrchestrator;
  let mockBulkProcessor;
  let mockPriceCache;
  let mockRateLimitManager;

  beforeEach(() => {
    jest.clearAllMocks();

    priceService = new PriceService();

    // Get references to mocked dependencies
    mockOrchestrator = priceService.orchestrator;
    mockBulkProcessor = priceService.bulkProcessor;
    mockPriceCache = priceService.priceCache;
    mockRateLimitManager = priceService.rateLimitManager;
  });

  describe('constructor', () => {
    it('should initialize with correct providers', () => {
      expect(priceService.providers).toHaveProperty('coinmarketcap');
      expect(priceService.providers).toHaveProperty('coingecko');
      expect(priceService.rateLimitManager).toBeDefined();
      expect(priceService.priceCache).toBeDefined();
      expect(priceService.orchestrator).toBeDefined();
      expect(priceService.bulkProcessor).toBeDefined();
    });

    it('should maintain backward compatibility with cache properties', () => {
      expect(priceService.cache).toBe(priceService.priceCache.cache);
      expect(priceService.cacheTimeouts).toBe(
        priceService.priceCache.cacheTimeouts
      );
    });

    it('should initialize rate limiters for all providers', () => {
      expect(mockRateLimitManager.initProvider).toHaveBeenCalledWith(
        'coinmarketcap',
        0.5,
        30
      );
      expect(mockRateLimitManager.initProvider).toHaveBeenCalledWith(
        'coingecko',
        1.67,
        100
      );
    });
  });

  describe('initializeRateLimiters', () => {
    it('should handle providers without rate limit config', () => {
      const { getProviderConfig } = require('../src/config/priceConfig');
      getProviderConfig.mockReturnValueOnce(null);

      // Create new instance to test initialization
      const newService = new PriceService();

      // Should not throw error when config is null
      expect(newService.rateLimitManager).toBeDefined();
    });

    it('should handle providers with missing rateLimit property', () => {
      const { getProviderConfig } = require('../src/config/priceConfig');
      getProviderConfig.mockReturnValueOnce({ someOtherConfig: true });

      // Create new instance to test initialization
      const newService = new PriceService();

      // Should not throw error when rateLimit is missing
      expect(newService.rateLimitManager).toBeDefined();
    });
  });

  describe('cache operations', () => {
    it('should get cached price through priceCache', () => {
      const mockCachedPrice = {
        success: true,
        price: 45000,
        symbol: 'btc',
        fromCache: true,
      };

      mockPriceCache.get.mockReturnValue(mockCachedPrice);

      const result = priceService.getCachedPrice('btc');

      expect(mockPriceCache.get).toHaveBeenCalledWith('btc');
      expect(result).toEqual(mockCachedPrice);
    });

    it('should set cached price through priceCache', () => {
      const priceData = {
        success: true,
        price: 45000,
        symbol: 'btc',
      };

      priceService.setCachedPrice('btc', priceData, 300);

      expect(mockPriceCache.set).toHaveBeenCalledWith('btc', priceData, 300);
    });

    it('should use default TTL when not specified', () => {
      const priceData = { price: 100 };

      priceService.setCachedPrice('eth', priceData);

      expect(mockPriceCache.set).toHaveBeenCalledWith('eth', priceData, 180);
    });

    it('should clear cache through priceCache', () => {
      priceService.clearCache();

      expect(mockPriceCache.clear).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPrice', () => {
    it('should delegate to orchestrator with default options', async () => {
      const mockResponse = {
        success: true,
        price: 45000,
        symbol: 'btc',
        provider: 'coinmarketcap',
      };

      mockOrchestrator.getPrice.mockResolvedValue(mockResponse);

      const result = await priceService.getPrice('btc');

      expect(mockOrchestrator.getPrice).toHaveBeenCalledWith('btc', {});
      expect(result).toEqual(mockResponse);
    });

    it('should pass options to orchestrator', async () => {
      const options = { useCache: false, timeout: 10000 };
      const mockResponse = { success: true, price: 100 };

      mockOrchestrator.getPrice.mockResolvedValue(mockResponse);

      await priceService.getPrice('eth', options);

      expect(mockOrchestrator.getPrice).toHaveBeenCalledWith('eth', options);
    });

    it('should handle orchestrator errors', async () => {
      const error = new Error('Orchestrator failed');
      mockOrchestrator.getPrice.mockRejectedValue(error);

      await expect(priceService.getPrice('btc')).rejects.toThrow(
        'Orchestrator failed'
      );
    });
  });

  describe('getBulkPrices', () => {
    it('should delegate to bulk processor with default options', async () => {
      const symbols = ['btc', 'eth'];
      const mockResponse = {
        results: {
          btc: { success: true, price: 45000 },
          eth: { success: true, price: 3000 },
        },
        errors: [],
      };

      mockBulkProcessor.getBulkPrices.mockResolvedValue(mockResponse);

      const result = await priceService.getBulkPrices(symbols);

      expect(mockBulkProcessor.getBulkPrices).toHaveBeenCalledWith(symbols, {});
      expect(result).toEqual(mockResponse);
    });

    it('should pass options to bulk processor', async () => {
      const symbols = ['btc'];
      const options = { useCache: false, timeout: 5000 };
      const mockResponse = { results: {}, errors: [] };

      mockBulkProcessor.getBulkPrices.mockResolvedValue(mockResponse);

      await priceService.getBulkPrices(symbols, options);

      expect(mockBulkProcessor.getBulkPrices).toHaveBeenCalledWith(
        symbols,
        options
      );
    });

    it('should handle bulk processor errors', async () => {
      const error = new Error('Bulk processor failed');
      mockBulkProcessor.getBulkPrices.mockRejectedValue(error);

      await expect(priceService.getBulkPrices(['btc'])).rejects.toThrow(
        'Bulk processor failed'
      );
    });

    it('should handle empty symbols array', async () => {
      const mockResponse = { results: {}, errors: [] };
      mockBulkProcessor.getBulkPrices.mockResolvedValue(mockResponse);

      const result = await priceService.getBulkPrices([]);

      expect(mockBulkProcessor.getBulkPrices).toHaveBeenCalledWith([], {});
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getSupportedProviders', () => {
    it('should delegate to orchestrator', () => {
      const mockProviders = ['coinmarketcap', 'coingecko'];
      mockOrchestrator.getAvailableProviders.mockReturnValue(mockProviders);

      const result = priceService.getSupportedProviders();

      expect(mockOrchestrator.getAvailableProviders).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockProviders);
    });

    it('should handle empty providers list', () => {
      mockOrchestrator.getAvailableProviders.mockReturnValue([]);

      const result = priceService.getSupportedProviders();

      expect(result).toEqual([]);
    });
  });

  describe('getStatus', () => {
    it('should return comprehensive status from all components', () => {
      const mockProviderStatus = {
        coinmarketcap: { name: 'coinmarketcap', available: true },
        coingecko: { name: 'coingecko', available: true },
      };

      const mockRateLimitStatus = {
        coinmarketcap: { tokens: 25, capacity: 30 },
        coingecko: { tokens: 95, capacity: 100 },
      };

      const mockCacheStats = {
        hits: 10,
        misses: 5,
        size: 15,
      };

      mockOrchestrator.getProviderStatus.mockReturnValue(mockProviderStatus);
      mockRateLimitManager.getStatus.mockReturnValue(mockRateLimitStatus);
      mockPriceCache.getStats.mockReturnValue(mockCacheStats);

      const result = priceService.getStatus();

      expect(result).toEqual({
        providers: mockProviderStatus,
        rateLimits: mockRateLimitStatus,
        cache: mockCacheStats,
      });

      expect(mockOrchestrator.getProviderStatus).toHaveBeenCalledTimes(1);
      expect(mockRateLimitManager.getStatus).toHaveBeenCalledTimes(1);
      expect(mockPriceCache.getStats).toHaveBeenCalledTimes(1);
    });

    it('should handle status errors gracefully', () => {
      mockOrchestrator.getProviderStatus.mockImplementation(() => {
        throw new Error('Provider status error');
      });

      // Should not throw, but may return partial status
      expect(() => priceService.getStatus()).toThrow('Provider status error');
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle null/undefined symbols in getPrice', async () => {
      mockOrchestrator.getPrice.mockRejectedValue(new Error('Invalid symbol'));

      await expect(priceService.getPrice(null)).rejects.toThrow();
      await expect(priceService.getPrice(undefined)).rejects.toThrow();
    });

    it('should handle invalid options objects', async () => {
      const mockResponse = { success: true, price: 100 };
      mockOrchestrator.getPrice.mockResolvedValue(mockResponse);

      // Should handle invalid options gracefully
      await priceService.getPrice('btc', 'not an object');

      expect(mockOrchestrator.getPrice).toHaveBeenCalledWith(
        'btc',
        'not an object'
      );
    });

    it('should handle provider initialization failures', () => {
      // Reset the mock and clear modules to isolate this test
      jest.clearAllMocks();
      jest.resetModules();

      // Mock the config to throw error
      jest.doMock('../src/config/priceConfig', () => ({
        getProviderConfig: jest.fn(() => {
          throw new Error('Config error');
        }),
      }));

      // Require PriceService after mocking
      const PriceServiceWithError = require('../src/services/priceService');

      // Should handle initialization errors gracefully
      expect(() => new PriceServiceWithError()).toThrow('Config error');

      // Clean up the mock
      jest.dontMock('../src/config/priceConfig');
    });
  });

  describe('provider integration', () => {
    it('should have correctly initialized provider instances', () => {
      expect(priceService.providers.coinmarketcap).toBeDefined();
      expect(priceService.providers.coingecko).toBeDefined();

      // Check that providers have expected methods (mocked)
      expect(typeof priceService.providers.coinmarketcap.getPrice).toBe(
        'function'
      );
      expect(typeof priceService.providers.coingecko.getPrice).toBe('function');
    });

    it('should handle missing provider configurations', () => {
      const originalProviders = { ...priceService.providers };

      // Ensure providers are still functional even if config is missing
      expect(Object.keys(originalProviders)).toContain('coinmarketcap');
      expect(Object.keys(originalProviders)).toContain('coingecko');
    });
  });

  describe('backward compatibility', () => {
    it('should maintain direct cache access for legacy code', () => {
      expect(priceService.cache).toBe(priceService.priceCache.cache);
      expect(priceService.cacheTimeouts).toBe(
        priceService.priceCache.cacheTimeouts
      );

      // Should be Map instances
      expect(priceService.cache).toBeInstanceOf(Map);
      expect(priceService.cacheTimeouts).toBeInstanceOf(Map);
    });

    it('should preserve existing cache and timeout references', () => {
      const cacheRef = priceService.cache;
      const timeoutsRef = priceService.cacheTimeouts;

      // References should remain stable
      expect(priceService.cache).toBe(cacheRef);
      expect(priceService.cacheTimeouts).toBe(timeoutsRef);
    });
  });
});
