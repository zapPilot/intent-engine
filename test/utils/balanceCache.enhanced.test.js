/**
 * Unit Tests for Enhanced Balance Cache (balanceCache.enhanced.js)
 *
 * Tests cover:
 * - BalanceCacheMonitor: metric tracking, stale detection, statistics
 * - BalanceCache: CRUD operations, TTL expiration, partial updates, async refresh,
 *   invalidation methods, cleanup intervals, monitoring integration
 *
 * Uses Jest fake timers for TTL testing and achieves 90%+ code coverage
 */

const BalanceCache = require('../../src/utils/balanceCache.enhanced');

describe('BalanceCacheMonitor', () => {
  let cache;
  let monitor;

  beforeEach(() => {
    cache = new BalanceCache();
    monitor = cache.monitor;
  });

  afterEach(() => {
    cache.stopCleanup();
  });

  describe('Initial State', () => {
    it('should initialize with zero metrics', () => {
      expect(monitor.metrics.hits).toBe(0);
      expect(monitor.metrics.misses).toBe(0);
      expect(monitor.metrics.staleHits).toBe(0);
      expect(monitor.metrics.sets).toBe(0);
      expect(monitor.metrics.evictions).toBe(0);
      expect(monitor.metrics.invalidations).toBe(0);
      expect(monitor.metrics.partialUpdates).toBe(0);
      expect(monitor.metrics.totalCacheAge).toBe(0);
    });

    it('should have staleThreshold of 300000ms (5 minutes)', () => {
      expect(monitor.staleThreshold).toBe(300000);
    });
  });

  describe('recordHit', () => {
    it('should increment hits counter', () => {
      monitor.recordHit(1000);
      expect(monitor.metrics.hits).toBe(1);
      monitor.recordHit(2000);
      expect(monitor.metrics.hits).toBe(2);
    });

    it('should track total cache age', () => {
      monitor.recordHit(1000);
      monitor.recordHit(2000);
      expect(monitor.metrics.totalCacheAge).toBe(3000);
    });

    it('should not record stale hit for fresh cache', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      monitor.recordHit(100000); // 100 seconds - not stale
      expect(monitor.metrics.staleHits).toBe(0);
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should record stale hit when cache age exceeds threshold', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      monitor.recordHit(350000); // 350 seconds - stale
      expect(monitor.metrics.staleHits).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[BalanceCache] Stale cache hit: 350.0s old')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('recordMiss', () => {
    it('should increment misses counter', () => {
      monitor.recordMiss();
      expect(monitor.metrics.misses).toBe(1);
      monitor.recordMiss();
      expect(monitor.metrics.misses).toBe(2);
    });
  });

  describe('recordSet', () => {
    it('should increment sets counter', () => {
      monitor.recordSet();
      expect(monitor.metrics.sets).toBe(1);
    });
  });

  describe('recordEviction', () => {
    it('should increment evictions counter', () => {
      monitor.recordEviction();
      expect(monitor.metrics.evictions).toBe(1);
    });
  });

  describe('recordInvalidation', () => {
    it('should increment invalidations counter', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      monitor.recordInvalidation('test reason');
      expect(monitor.metrics.invalidations).toBe(1);
      consoleSpy.mockRestore();
    });

    it('should log invalidation reason', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      monitor.recordInvalidation('manual clear');
      expect(consoleSpy).toHaveBeenCalledWith(
        '[BalanceCache] Invalidated: manual clear'
      );
      consoleSpy.mockRestore();
    });
  });

  describe('recordPartialUpdate', () => {
    it('should increment partialUpdates counter', () => {
      monitor.recordPartialUpdate();
      expect(monitor.metrics.partialUpdates).toBe(1);
    });
  });

  describe('getHitRate', () => {
    it('should return 0.00% when no requests', () => {
      expect(monitor.getHitRate()).toBe('0.00');
    });

    it('should calculate 100% hit rate', () => {
      monitor.recordHit(1000);
      monitor.recordHit(2000);
      expect(monitor.getHitRate()).toBe('100.00');
    });

    it('should calculate 50% hit rate', () => {
      monitor.recordHit(1000);
      monitor.recordMiss();
      expect(monitor.getHitRate()).toBe('50.00');
    });

    it('should calculate 33.33% hit rate', () => {
      monitor.recordHit(1000);
      monitor.recordMiss();
      monitor.recordMiss();
      expect(monitor.getHitRate()).toBe('33.33');
    });
  });

  describe('getAvgCacheAge', () => {
    it('should return 0 when no hits', () => {
      expect(monitor.getAvgCacheAge()).toBe(0);
    });

    it('should calculate average cache age', () => {
      monitor.recordHit(1000);
      monitor.recordHit(3000);
      expect(monitor.getAvgCacheAge()).toBe(2000);
    });
  });

  describe('getStats', () => {
    it('should return comprehensive stats object', () => {
      monitor.recordHit(1000);
      monitor.recordMiss();
      monitor.recordSet();

      const stats = monitor.getStats();

      expect(stats).toMatchObject({
        hits: 1,
        misses: 1,
        staleHits: 0,
        sets: 1,
        evictions: 0,
        invalidations: 0,
        partialUpdates: 0,
        totalCacheAge: 1000,
      });
      expect(stats.hitRate).toBe('50.00%');
      expect(stats.avgCacheAge).toBe('1.0s');
      expect(stats.staleHitRate).toBe('0.00%');
    });

    it('should calculate stale hit rate correctly', () => {
      monitor.recordHit(100000);
      jest.spyOn(console, 'warn').mockImplementation();
      monitor.recordHit(350000); // stale
      console.warn.mockRestore();

      const stats = monitor.getStats();
      expect(stats.staleHitRate).toBe('50.00%');
    });
  });

  describe('reset', () => {
    it('should reset all metrics to zero', () => {
      monitor.recordHit(1000);
      monitor.recordMiss();
      monitor.recordSet();
      monitor.recordEviction();
      jest.spyOn(console, 'warn').mockImplementation();
      monitor.recordInvalidation('test');
      console.warn.mockRestore();
      monitor.recordPartialUpdate();

      monitor.reset();

      expect(monitor.metrics).toEqual({
        hits: 0,
        misses: 0,
        staleHits: 0,
        sets: 0,
        evictions: 0,
        invalidations: 0,
        partialUpdates: 0,
        totalCacheAge: 0,
      });
    });
  });
});

describe('BalanceCache', () => {
  let cache;

  beforeEach(() => {
    cache = new BalanceCache();
  });

  afterEach(() => {
    cache.stopCleanup();
  });

  describe('Constructor', () => {
    it('should initialize with default TTL of 180000ms (3 minutes)', () => {
      expect(cache.defaultTTL).toBe(180000);
    });

    it('should accept custom TTL', () => {
      const customCache = new BalanceCache(60000);
      expect(customCache.defaultTTL).toBe(60000);
      customCache.stopCleanup();
    });

    it('should create empty cache and expirations maps', () => {
      expect(cache.cache.size).toBe(0);
      expect(cache.expirations.size).toBe(0);
    });

    it('should create monitor instance', () => {
      expect(cache.monitor).toBeDefined();
      expect(cache.monitor.metrics).toBeDefined();
    });

    it('should start cleanup interval automatically', () => {
      expect(cache.cleanupInterval).not.toBeNull();
    });
  });

  describe('generateKey (static)', () => {
    it('should generate key with chainId and address only', () => {
      const key = BalanceCache.generateKey(1, '0xABCD');
      expect(key).toBe('balance:1:0xabcd:all');
    });

    it('should normalize chainId to lowercase string', () => {
      const key1 = BalanceCache.generateKey(1, '0xAddress');
      const key2 = BalanceCache.generateKey('1', '0xAddress');
      expect(key1).toBe(key2);
    });

    it('should normalize address to lowercase', () => {
      const key = BalanceCache.generateKey(1, '0xABCDEF');
      expect(key).toBe('balance:1:0xabcdef:all');
    });

    it('should include sorted token addresses', () => {
      const tokens = ['0xToken2', '0xToken1', '0xToken3'];
      const key = BalanceCache.generateKey(1, '0xAddr', tokens);
      expect(key).toBe('balance:1:0xaddr:0xtoken1,0xtoken2,0xtoken3');
    });

    it('should normalize and sort token addresses', () => {
      const tokens = ['0xBBB', '0xAAA', '0xCCC'];
      const key = BalanceCache.generateKey(1, '0xAddr', tokens);
      expect(key).toContain('0xaaa,0xbbb,0xccc');
    });

    it('should handle empty token array as "all"', () => {
      const key = BalanceCache.generateKey(1, '0xAddr', []);
      expect(key).toBe('balance:1:0xaddr:all');
    });

    it('should handle null token array as "all"', () => {
      const key = BalanceCache.generateKey(1, '0xAddr', null);
      expect(key).toBe('balance:1:0xaddr:all');
    });
  });

  describe('set and get', () => {
    it('should store and retrieve data', () => {
      const key = 'test:key';
      const data = { balances: [], value: 100 };

      cache.set(key, data);
      const retrieved = cache.get(key);

      expect(retrieved).toMatchObject(data);
      expect(retrieved.timestamp).toBeDefined();
    });

    it('should add timestamp to data if not present', () => {
      const key = 'test:key';
      const data = { value: 100 };

      cache.set(key, data);
      const retrieved = cache.get(key);

      expect(retrieved.timestamp).toBeDefined();
      expect(typeof retrieved.timestamp).toBe('number');
    });

    it('should preserve existing timestamp', () => {
      const key = 'test:key';
      const timestamp = 1234567890;
      const data = { value: 100, timestamp };

      cache.set(key, data);
      const retrieved = cache.get(key);

      expect(retrieved.timestamp).toBe(timestamp);
    });

    it('should use custom TTL when provided', () => {
      const key = 'test:key';
      const data = { value: 100 };
      const customTTL = 60000;

      cache.set(key, data, customTTL);
      const expiresAt = cache.expirations.get(key);

      expect(expiresAt - Date.now()).toBeGreaterThan(55000);
      expect(expiresAt - Date.now()).toBeLessThanOrEqual(customTTL);
    });

    it('should return null for non-existent key', () => {
      const retrieved = cache.get('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should record set metric', () => {
      cache.set('test:key', { value: 100 });
      expect(cache.monitor.metrics.sets).toBe(1);
    });

    it('should record hit metric on successful get', () => {
      cache.set('test:key', { value: 100 });
      cache.get('test:key');
      expect(cache.monitor.metrics.hits).toBe(1);
    });

    it('should record miss metric on failed get', () => {
      cache.get('non-existent');
      expect(cache.monitor.metrics.misses).toBe(1);
    });

    it('should handle edge case where expiration exists but cache data is missing', () => {
      const key = 'test:key';

      // Manually create expiration without cache data (edge case)
      cache.expirations.set(key, Date.now() + 60000);

      const retrieved = cache.get(key);
      expect(retrieved).toBeNull();
      expect(cache.monitor.metrics.misses).toBe(1);
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should expire data after default TTL', () => {
      const key = 'test:key';
      const data = { value: 100 };

      cache.set(key, data);
      expect(cache.get(key)).not.toBeNull();

      // Advance time past TTL
      jest.advanceTimersByTime(180001);

      const retrieved = cache.get(key);
      expect(retrieved).toBeNull();
    });

    it('should expire data after custom TTL', () => {
      const key = 'test:key';
      const data = { value: 100 };
      const customTTL = 60000;

      cache.set(key, data, customTTL);
      expect(cache.get(key)).not.toBeNull();

      // Advance time past custom TTL
      jest.advanceTimersByTime(60001);

      expect(cache.get(key)).toBeNull();
    });

    it('should not expire data before TTL', () => {
      const key = 'test:key';
      const data = { value: 100 };

      cache.set(key, data);

      // Advance time but stay within TTL
      jest.advanceTimersByTime(179000);

      const retrieved = cache.get(key);
      expect(retrieved).not.toBeNull();
    });

    it('should delete expired entry when accessed', () => {
      const key = 'test:key';
      cache.set(key, { value: 100 });

      jest.advanceTimersByTime(180001);
      cache.get(key);

      expect(cache.cache.has(key)).toBe(false);
      expect(cache.expirations.has(key)).toBe(false);
    });

    it('should record eviction when expired entry is accessed', () => {
      const key = 'test:key';
      cache.set(key, { value: 100 });

      jest.advanceTimersByTime(180001);
      cache.get(key);

      expect(cache.monitor.metrics.evictions).toBe(1);
    });
  });

  describe('delete', () => {
    it('should remove cache entry', () => {
      const key = 'test:key';
      cache.set(key, { value: 100 });

      const deleted = cache.delete(key);

      expect(deleted).toBe(true);
      expect(cache.cache.has(key)).toBe(false);
      expect(cache.expirations.has(key)).toBe(false);
    });

    it('should return false when deleting non-existent key', () => {
      const deleted = cache.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all cache entries', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      cache.set('key1', { value: 1 });
      cache.set('key2', { value: 2 });
      cache.set('key3', { value: 3 });

      cache.clear();

      expect(cache.cache.size).toBe(0);
      expect(cache.expirations.size).toBe(0);

      consoleSpy.mockRestore();
    });

    it('should record invalidation with entry count', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      cache.set('key1', { value: 1 });
      cache.set('key2', { value: 2 });

      cache.clear();

      expect(cache.monitor.metrics.invalidations).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('full clear (2 entries)')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('updateTokenBalance', () => {
    it('should update specific token balance', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const key = BalanceCache.generateKey(1, '0xAddress', null);
      const data = {
        balances: [
          { tokenAddress: '0xToken1', balance: '100' },
          { tokenAddress: '0xToken2', balance: '200' },
        ],
      };

      cache.set(key, data);
      const updated = cache.updateTokenBalance(1, '0xAddress', '0xToken1', '150');

      expect(updated).toBe(true);

      const cached = cache.get(key);
      expect(cached.balances[0].balance).toBe('150');
      expect(cached.balances[1].balance).toBe('200');
      expect(cached.partialUpdate).toBe(true);
      expect(cached.lastPartialUpdate).toBeDefined();

      consoleSpy.mockRestore();
    });

    it('should add lastUpdated timestamp to updated token', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const key = BalanceCache.generateKey(1, '0xAddress', null);
      const data = {
        balances: [{ tokenAddress: '0xToken1', balance: '100' }],
      };

      cache.set(key, data);
      cache.updateTokenBalance(1, '0xAddress', '0xToken1', '150');

      const cached = cache.get(key);
      expect(cached.balances[0].lastUpdated).toBeDefined();

      consoleSpy.mockRestore();
    });

    it('should be case-insensitive for token address', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const key = BalanceCache.generateKey(1, '0xAddress', null);
      const data = {
        balances: [{ tokenAddress: '0xToken1', balance: '100' }],
      };

      cache.set(key, data);
      const updated = cache.updateTokenBalance(1, '0xAddress', '0xTOKEN1', '150');

      expect(updated).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should return false when cache miss', () => {
      const updated = cache.updateTokenBalance(1, '0xAddress', '0xToken1', '150');
      expect(updated).toBe(false);
    });

    it('should return false when token not found in balances', () => {
      const key = BalanceCache.generateKey(1, '0xAddress', null);
      const data = {
        balances: [{ tokenAddress: '0xToken1', balance: '100' }],
      };

      cache.set(key, data);
      const updated = cache.updateTokenBalance(1, '0xAddress', '0xToken2', '150');

      expect(updated).toBe(false);
    });

    it('should return false when cached data has no balances', () => {
      const key = BalanceCache.generateKey(1, '0xAddress', null);
      cache.set(key, { value: 100 });

      const updated = cache.updateTokenBalance(1, '0xAddress', '0xToken1', '150');
      expect(updated).toBe(false);
    });

    it('should record partial update metric', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const key = BalanceCache.generateKey(1, '0xAddress', null);
      const data = {
        balances: [{ tokenAddress: '0xToken1', balance: '100' }],
      };

      cache.set(key, data);
      cache.updateTokenBalance(1, '0xAddress', '0xToken1', '150');

      expect(cache.monitor.metrics.partialUpdates).toBe(1);

      consoleSpy.mockRestore();
    });
  });

  describe('refreshTokens', () => {
    it('should fetch and set fresh data when no existing cache', async () => {
      const fetchFn = jest.fn().mockResolvedValue({
        balances: [
          { tokenAddress: '0xToken1', balance: '100' },
          { tokenAddress: '0xToken2', balance: '200' },
        ],
      });

      const result = await cache.refreshTokens(
        1,
        '0xAddress',
        ['0xToken1', '0xToken2'],
        fetchFn
      );

      expect(fetchFn).toHaveBeenCalledWith(1, '0xAddress', [
        '0xToken1',
        '0xToken2',
      ]);
      expect(result.balances).toHaveLength(2);

      const key = BalanceCache.generateKey(1, '0xAddress', null);
      const cached = cache.get(key);
      expect(cached.balances).toHaveLength(2);
    });

    it('should merge fresh data with existing cache', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const key = BalanceCache.generateKey(1, '0xAddress', null);
      const existingData = {
        balances: [
          { tokenAddress: '0xToken1', balance: '100' },
          { tokenAddress: '0xToken2', balance: '200' },
          { tokenAddress: '0xToken3', balance: '300' },
        ],
      };

      cache.set(key, existingData);

      const fetchFn = jest.fn().mockResolvedValue({
        balances: [{ tokenAddress: '0xToken1', balance: '150' }],
      });

      const result = await cache.refreshTokens(
        1,
        '0xAddress',
        ['0xToken1'],
        fetchFn
      );

      // Should have all 3 tokens, with Token1 updated
      expect(result.balances).toHaveLength(3);

      const updatedToken = result.balances.find(
        b => b.tokenAddress === '0xToken1'
      );
      expect(updatedToken.balance).toBe('150');

      const preservedToken2 = result.balances.find(
        b => b.tokenAddress === '0xToken2'
      );
      expect(preservedToken2.balance).toBe('200');

      consoleSpy.mockRestore();
    });

    it('should preserve non-refreshed tokens', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const key = BalanceCache.generateKey(1, '0xAddress', null);
      const existingData = {
        balances: [
          { tokenAddress: '0xToken1', balance: '100' },
          { tokenAddress: '0xToken2', balance: '200' },
        ],
      };

      cache.set(key, existingData);

      const fetchFn = jest.fn().mockResolvedValue({
        balances: [{ tokenAddress: '0xToken1', balance: '150' }],
      });

      await cache.refreshTokens(1, '0xAddress', ['0xToken1'], fetchFn);

      const cached = cache.get(key);
      const token2 = cached.balances.find(b => b.tokenAddress === '0xToken2');
      expect(token2.balance).toBe('200');

      consoleSpy.mockRestore();
    });

    it('should mark as partial update', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const key = BalanceCache.generateKey(1, '0xAddress', null);
      cache.set(key, {
        balances: [{ tokenAddress: '0xToken1', balance: '100' }],
      });

      const fetchFn = jest.fn().mockResolvedValue({
        balances: [{ tokenAddress: '0xToken1', balance: '150' }],
      });

      await cache.refreshTokens(1, '0xAddress', ['0xToken1'], fetchFn);

      const cached = cache.get(key);
      expect(cached.partialUpdate).toBe(true);
      expect(cached.lastPartialUpdate).toBeDefined();

      consoleSpy.mockRestore();
    });

    it('should update timestamp', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const key = BalanceCache.generateKey(1, '0xAddress', null);
      const oldTimestamp = Date.now() - 10000;
      cache.set(key, {
        balances: [{ tokenAddress: '0xToken1', balance: '100' }],
        timestamp: oldTimestamp,
      });

      const fetchFn = jest.fn().mockResolvedValue({
        balances: [{ tokenAddress: '0xToken1', balance: '150' }],
      });

      await cache.refreshTokens(1, '0xAddress', ['0xToken1'], fetchFn);

      const cached = cache.get(key);
      expect(cached.timestamp).toBeGreaterThan(oldTimestamp);

      consoleSpy.mockRestore();
    });

    it('should record partial update metric when merging with existing cache', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const key = BalanceCache.generateKey(1, '0xAddress', null);
      cache.set(key, {
        balances: [{ tokenAddress: '0xToken1', balance: '100' }],
      });

      const fetchFn = jest.fn().mockResolvedValue({
        balances: [{ tokenAddress: '0xToken1', balance: '150' }],
      });

      await cache.refreshTokens(1, '0xAddress', ['0xToken1'], fetchFn);

      expect(cache.monitor.metrics.partialUpdates).toBe(1);

      consoleSpy.mockRestore();
    });

    it('should not record partial update metric when no existing cache', async () => {
      const fetchFn = jest.fn().mockResolvedValue({
        balances: [{ tokenAddress: '0xToken1', balance: '100' }],
      });

      await cache.refreshTokens(1, '0xAddress', ['0xToken1'], fetchFn);

      expect(cache.monitor.metrics.partialUpdates).toBe(0);
    });

    it('should handle case-insensitive token matching', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const key = BalanceCache.generateKey(1, '0xAddress', null);
      cache.set(key, {
        balances: [
          { tokenAddress: '0xToken1', balance: '100' },
          { tokenAddress: '0xToken2', balance: '200' },
        ],
      });

      const fetchFn = jest.fn().mockResolvedValue({
        balances: [{ tokenAddress: '0xTOKEN1', balance: '150' }],
      });

      await cache.refreshTokens(1, '0xAddress', ['0xTOKEN1'], fetchFn);

      const cached = cache.get(key);
      // Should only have Token2 from old cache + Token1 from fresh data
      expect(cached.balances).toHaveLength(2);

      consoleSpy.mockRestore();
    });
  });

  describe('clearAddress', () => {
    it('should clear all entries for an address', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      cache.set('balance:1:0xaddr1:all', { value: 1 });
      cache.set('balance:1:0xaddr2:all', { value: 2 });
      cache.set('balance:2:0xaddr1:all', { value: 3 });

      const cleared = cache.clearAddress('0xAddr1');

      expect(cleared).toBe(2);
      expect(cache.get('balance:1:0xaddr1:all')).toBeNull();
      expect(cache.get('balance:2:0xaddr1:all')).toBeNull();
      expect(cache.get('balance:1:0xaddr2:all')).not.toBeNull();

      consoleSpy.mockRestore();
    });

    it('should be case-insensitive', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      cache.set('balance:1:0xaddr1:all', { value: 1 });

      const cleared = cache.clearAddress('0xADDR1');
      expect(cleared).toBe(1);

      consoleSpy.mockRestore();
    });

    it('should record invalidation with reason', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      cache.set('balance:1:0xaddr1:all', { value: 1 });
      cache.clearAddress('0xAddr1', 'transaction');

      expect(cache.monitor.metrics.invalidations).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('address 0xAddr1 (transaction)')
      );

      consoleSpy.mockRestore();
    });

    it('should return 0 when no entries cleared', () => {
      const cleared = cache.clearAddress('0xNonExistent');
      expect(cleared).toBe(0);
    });

    it('should not record invalidation when no entries cleared', () => {
      cache.clearAddress('0xNonExistent');
      expect(cache.monitor.metrics.invalidations).toBe(0);
    });
  });

  describe('clearChain', () => {
    it('should clear all entries for a chain', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      cache.set('balance:1:0xaddr1:all', { value: 1 });
      cache.set('balance:1:0xaddr2:all', { value: 2 });
      cache.set('balance:2:0xaddr1:all', { value: 3 });

      const cleared = cache.clearChain(1);

      expect(cleared).toBe(2);
      expect(cache.get('balance:1:0xaddr1:all')).toBeNull();
      expect(cache.get('balance:1:0xaddr2:all')).toBeNull();
      expect(cache.get('balance:2:0xaddr1:all')).not.toBeNull();

      consoleSpy.mockRestore();
    });

    it('should normalize chainId to string', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      cache.set('balance:1:0xaddr1:all', { value: 1 });

      const cleared = cache.clearChain('1');
      expect(cleared).toBe(1);

      consoleSpy.mockRestore();
    });

    it('should record invalidation with reason', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      cache.set('balance:1:0xaddr1:all', { value: 1 });
      cache.clearChain(1, 'reorg');

      expect(cache.monitor.metrics.invalidations).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('chain 1 (reorg)')
      );

      consoleSpy.mockRestore();
    });

    it('should return 0 when no entries cleared', () => {
      const cleared = cache.clearChain(999);
      expect(cleared).toBe(0);
    });
  });

  describe('invalidateAfterTransaction', () => {
    it('should call clearAddress with transaction reason', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      cache.set('balance:1:0xaddr1:all', { value: 1 });
      const cleared = cache.invalidateAfterTransaction(1, '0xAddr1', 'zapIn');

      expect(cleared).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('transaction:zapIn')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should remove expired entries', () => {
      cache.set('key1', { value: 1 });
      cache.set('key2', { value: 2 });

      jest.advanceTimersByTime(180001);

      const cleaned = cache.cleanup();

      expect(cleaned).toBe(2);
      expect(cache.cache.size).toBe(0);
    });

    it('should not remove non-expired entries', () => {
      cache.set('key1', { value: 1 });
      cache.set('key2', { value: 2 });

      jest.advanceTimersByTime(90000);

      const cleaned = cache.cleanup();

      expect(cleaned).toBe(0);
      expect(cache.cache.size).toBe(2);
    });

    it('should record eviction metrics', () => {
      cache.set('key1', { value: 1 });
      cache.set('key2', { value: 2 });

      jest.advanceTimersByTime(180001);
      cache.cleanup();

      expect(cache.monitor.metrics.evictions).toBe(2);
    });

    it('should return 0 when no expired entries', () => {
      cache.set('key1', { value: 1 });

      const cleaned = cache.cleanup();
      expect(cleaned).toBe(0);
    });
  });

  describe('startCleanup and stopCleanup', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should run cleanup at specified interval', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Create a new cache with fake timers active to ensure interval is mocked
      const testCache = new BalanceCache();

      testCache.set('key1', { value: 1 });

      // Advance past TTL
      jest.advanceTimersByTime(180001);

      // Advance to trigger cleanup interval (default 60000ms)
      jest.advanceTimersByTime(60000);

      expect(testCache.cache.size).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up 1 expired entries')
      );

      testCache.stopCleanup();
      consoleSpy.mockRestore();
    });

    it('should accept custom cleanup interval', () => {
      cache.stopCleanup();
      cache.startCleanup(30000);

      cache.set('key1', { value: 1 });
      jest.advanceTimersByTime(180001);

      jest.advanceTimersByTime(30000);

      expect(cache.cache.size).toBe(0);
    });

    it('should replace existing cleanup interval', () => {
      cache.startCleanup(10000);
      expect(cache.cleanupInterval).not.toBeNull();

      const oldInterval = cache.cleanupInterval;
      cache.startCleanup(20000);

      expect(cache.cleanupInterval).not.toBe(oldInterval);
    });

    it('should stop cleanup interval', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      cache.stopCleanup();
      expect(cache.cleanupInterval).toBeNull();

      cache.set('key1', { value: 1 });
      jest.advanceTimersByTime(240001); // Past TTL and cleanup interval

      // Cleanup should not run automatically
      expect(cache.cache.has('key1')).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should not log when no entries cleaned', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      cache.set('key1', { value: 1 });

      // Advance cleanup interval but not past TTL
      jest.advanceTimersByTime(60000);

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', () => {
      cache.set('key1', { value: 1 });
      cache.get('key1');

      const stats = cache.getStats();

      expect(stats).toMatchObject({
        size: 1,
        defaultTTL: 180000,
        hits: 1,
        misses: 0,
        sets: 1,
      });
      expect(stats.hitRate).toBeDefined();
      expect(stats.avgCacheAge).toBeDefined();
      expect(stats.memoryUsage).toBeDefined();
    });

    it('should include monitor stats', () => {
      const stats = cache.getStats();

      expect(stats.hitRate).toBeDefined();
      expect(stats.staleHitRate).toBeDefined();
      expect(stats.avgCacheAge).toBeDefined();
    });
  });

  describe('estimateMemoryUsage', () => {
    it('should return KB for small cache', () => {
      cache.set('key1', { value: 1 });

      const usage = cache.estimateMemoryUsage();
      expect(usage).toContain('KB');
    });

    it('should return MB for large cache', () => {
      // Add many entries to exceed 1024 KB threshold
      for (let i = 0; i < 3000; i++) {
        cache.set(`key${i}`, { value: i });
      }

      const usage = cache.estimateMemoryUsage();
      expect(usage).toContain('MB');
    });
  });

  describe('resetStats', () => {
    it('should reset monitor statistics', () => {
      cache.set('key1', { value: 1 });
      cache.get('key1');

      cache.resetStats();

      expect(cache.monitor.metrics.hits).toBe(0);
      expect(cache.monitor.metrics.sets).toBe(0);
    });
  });

  describe('logHealthReport', () => {
    it('should log formatted health report', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      cache.set('key1', { value: 1 });
      cache.get('key1');

      cache.logHealthReport();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Balance Cache Health Report')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache Size:')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Hit Rate:')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle multiple simultaneous operations', () => {
      const key1 = BalanceCache.generateKey(1, '0xAddr1');
      const key2 = BalanceCache.generateKey(2, '0xAddr2');

      cache.set(key1, { value: 1 });
      cache.set(key2, { value: 2 });

      expect(cache.get(key1)).not.toBeNull();
      expect(cache.get(key2)).not.toBeNull();

      cache.delete(key1);

      expect(cache.get(key1)).toBeNull();
      expect(cache.get(key2)).not.toBeNull();
    });

    it('should maintain cache integrity across operations', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const key = BalanceCache.generateKey(1, '0xAddr', null);
      cache.set(key, {
        balances: [
          { tokenAddress: '0xToken1', balance: '100' },
          { tokenAddress: '0xToken2', balance: '200' },
        ],
      });

      cache.updateTokenBalance(1, '0xAddr', '0xToken1', '150');
      const retrieved = cache.get(key);

      expect(retrieved.balances[0].balance).toBe('150');
      expect(retrieved.balances[1].balance).toBe('200');
      expect(cache.monitor.metrics.hits).toBe(2); // Once in update, once in get
      expect(cache.monitor.metrics.partialUpdates).toBe(1);

      consoleSpy.mockRestore();
    });

    it('should handle empty cache gracefully', () => {
      expect(cache.cache.size).toBe(0);
      expect(cache.get('any-key')).toBeNull();
      expect(cache.cleanup()).toBe(0);

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hitRate).toBe('0.00%');
    });

    it('should handle clearing empty address', () => {
      const cleared = cache.clearAddress('0xEmpty');
      expect(cleared).toBe(0);
      expect(cache.monitor.metrics.invalidations).toBe(0);
    });

    it('should handle special characters in addresses', () => {
      const key = BalanceCache.generateKey(
        1,
        '0xABCDEF1234567890',
        ['0xToken-1', '0xToken_2']
      );

      expect(key).toContain('0xabcdef1234567890');
      expect(key).toContain('0xtoken-1');
      expect(key).toContain('0xtoken_2');
    });
  });
});
