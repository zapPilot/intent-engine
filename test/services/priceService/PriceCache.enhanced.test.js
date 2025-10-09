/**
 * Enhanced Price Cache Tests
 */

const PriceCache = require('../../../src/services/priceService/PriceCache.enhanced');

describe('PriceCache', () => {
  let cache;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    cache = new PriceCache();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('get/set', () => {
    test('should set and get price data', () => {
      const priceData = { price: 1000, symbol: 'ETH' };
      cache.set('ETH', priceData);

      const result = cache.get('ETH');
      expect(result).toMatchObject(priceData);
      expect(result.timestamp).toBeDefined();
    });

    test('should be case insensitive', () => {
      cache.set('ETH', { price: 1000 });

      const result = cache.get('eth');
      expect(result).toBeTruthy();
      expect(result.price).toBe(1000);
    });

    test('should return null for expired data', () => {
      cache.set('ETH', { price: 1000 }, 1);
      jest.advanceTimersByTime(2000);

      const result = cache.get('ETH');
      expect(result).toBeNull();
    });

    test('should return null for missing symbol', () => {
      const result = cache.get('NONEXISTENT');
      expect(result).toBeNull();
    });
  });

  describe('getBulk', () => {
    test('should get multiple symbols at once', () => {
      cache.set('ETH', { price: 1000 });
      cache.set('BTC', { price: 30000 });

      const result = cache.getBulk(['ETH', 'BTC', 'USDC']);

      expect(result.results.eth).toBeDefined();
      expect(result.results.btc).toBeDefined();
      expect(result.remaining).toContain('usdc');
    });

    test('should mark cached results', () => {
      cache.set('ETH', { price: 1000 });

      const result = cache.getBulk(['ETH']);
      expect(result.results.eth.fromCache).toBe(true);
    });
  });

  describe('clear', () => {
    test('should clear all cache', () => {
      cache.set('ETH', { price: 1000 });
      cache.set('BTC', { price: 30000 });

      cache.clear();

      expect(cache.get('ETH')).toBeNull();
      expect(cache.get('BTC')).toBeNull();
    });
  });

  describe('getStats', () => {
    test('should return cache statistics', () => {
      cache.set('ETH', { price: 1000 });
      cache.get('ETH');
      cache.get('NONEXISTENT');

      const stats = cache.getStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('avgCacheAge');
    });
  });

  describe('monitoring', () => {
    test('should track hits and misses', () => {
      cache.set('ETH', { price: 1000 });
      cache.get('ETH'); // hit
      cache.get('BTC'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    test('should track stale hits', () => {
      // Manually set an old entry (set() would override the timestamp)
      const oldTimestamp = Date.now() - 400000; // 6.6 min old
      cache.cache.set('eth', { price: 1000, timestamp: oldTimestamp });
      cache.cacheTimeouts.set('eth', Date.now() + 180000); // Still valid TTL

      cache.get('ETH');

      const stats = cache.getStats();
      expect(stats.staleHits).toBe(1);
    });

    test('should calculate hit rate', () => {
      cache.set('ETH', { price: 1000 });
      cache.get('ETH'); // hit
      cache.get('ETH'); // hit
      cache.get('BTC'); // miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBe('66.67%');
    });

    test('should track average cache age', () => {
      cache.set('ETH', { price: 1000 });
      jest.advanceTimersByTime(5000);
      cache.get('ETH');

      const stats = cache.getStats();
      expect(stats.avgCacheAge).toContain('s');
    });
  });

  describe('resetStats', () => {
    test('should reset monitoring metrics', () => {
      cache.set('ETH', { price: 1000 });
      cache.get('ETH');

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });
});
