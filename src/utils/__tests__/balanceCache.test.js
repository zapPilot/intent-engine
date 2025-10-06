const BalanceCache = require('../balanceCache');

describe('BalanceCache', () => {
  let cache;

  beforeEach(() => {
    cache = new BalanceCache(1000); // 1 second TTL for testing
  });

  afterEach(() => {
    cache.stopCleanup();
  });

  describe('Cache key generation', () => {
    it('should generate consistent keys', () => {
      const key1 = BalanceCache.generateKey(1, '0xABC');
      const key2 = BalanceCache.generateKey('1', '0xabc');

      expect(key1).toBe(key2);
      expect(key1).toBe('balance:1:0xabc:all');
    });

    it('should include token addresses in key', () => {
      const tokens = ['0xDEF', '0xABC'];
      const key = BalanceCache.generateKey(1, '0x123', tokens);

      // Should be sorted
      expect(key).toBe('balance:1:0x123:0xabc,0xdef');
    });

    it('should handle empty token array', () => {
      const key = BalanceCache.generateKey(1, '0x123', []);
      expect(key).toBe('balance:1:0x123:all');
    });
  });

  describe('Set and Get', () => {
    it('should store and retrieve data', () => {
      const key = 'test:key';
      const data = { balance: '1000' };

      cache.set(key, data);
      const retrieved = cache.get(key);

      expect(retrieved).toEqual(data);
      expect(cache.getStats().sets).toBe(1);
      expect(cache.getStats().hits).toBe(1);
    });

    it('should return null for missing keys', () => {
      const result = cache.get('nonexistent');

      expect(result).toBeNull();
      expect(cache.getStats().misses).toBe(1);
    });

    it('should expire entries after TTL', async () => {
      const key = 'test:expire';
      cache.set(key, { test: 'data' }, 100); // 100ms TTL

      // Should exist immediately
      expect(cache.get(key)).toBeTruthy();

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      expect(cache.get(key)).toBeNull();
    });

    it('should use default TTL if not specified', () => {
      const key = 'test:default';
      cache.set(key, { data: 'test' });

      const expiration = cache.expirations.get(key);
      const now = Date.now();

      expect(expiration).toBeGreaterThan(now);
      expect(expiration).toBeLessThanOrEqual(now + 1000); // Default 1s
    });
  });

  describe('Delete', () => {
    it('should delete specific key', () => {
      const key = 'test:delete';
      cache.set(key, { data: 'test' });

      expect(cache.get(key)).toBeTruthy();

      const deleted = cache.delete(key);
      expect(deleted).toBe(true);
      expect(cache.get(key)).toBeNull();
    });

    it('should return false for non-existent key', () => {
      const deleted = cache.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('Clear operations', () => {
    beforeEach(() => {
      // Setup test data
      cache.set(BalanceCache.generateKey(1, '0xabc'), { data: '1' });
      cache.set(BalanceCache.generateKey(1, '0xdef'), { data: '2' });
      cache.set(BalanceCache.generateKey(137, '0xabc'), { data: '3' });
      cache.set(BalanceCache.generateKey(137, '0xghi'), { data: '4' });
    });

    it('should clear all entries for an address', () => {
      const cleared = cache.clearAddress('0xabc');

      expect(cleared).toBe(2); // Both chain 1 and 137
      expect(cache.cache.size).toBe(2); // 0xdef and 0xghi remain
    });

    it('should clear all entries for a chain', () => {
      const cleared = cache.clearChain(1);

      expect(cleared).toBe(2); // Both addresses on chain 1
      expect(cache.cache.size).toBe(2); // Chain 137 entries remain
    });

    it('should clear all entries', () => {
      cache.clear();

      expect(cache.cache.size).toBe(0);
      expect(cache.expirations.size).toBe(0);
    });

    it('should be case-insensitive for addresses', () => {
      const cleared = cache.clearAddress('0xABC');
      expect(cleared).toBe(2);
    });
  });

  describe('Cleanup', () => {
    it('should remove expired entries', async () => {
      cache.set('key1', { data: '1' }, 50); // Expire in 50ms
      cache.set('key2', { data: '2' }, 50);
      cache.set('key3', { data: '3' }, 5000); // Expire in 5s

      expect(cache.cache.size).toBe(3);

      // Wait for first two to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      const cleaned = cache.cleanup();
      expect(cleaned).toBe(2);
      expect(cache.cache.size).toBe(1);
      expect(cache.get('key3')).toBeTruthy();
    });

    it('should not clean unexpired entries', () => {
      cache.set('key1', { data: '1' }, 5000);
      cache.set('key2', { data: '2' }, 5000);

      const cleaned = cache.cleanup();
      expect(cleaned).toBe(0);
      expect(cache.cache.size).toBe(2);
    });
  });

  describe('Statistics', () => {
    it('should track cache hits and misses', () => {
      cache.set('key1', { data: '1' });

      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('key2'); // Miss
      cache.get('key3'); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe('50.00%');
    });

    it('should track sets and evictions', () => {
      cache.set('key1', { data: '1' });
      cache.set('key2', { data: '2' });

      cache.delete('key1');

      const stats = cache.getStats();
      expect(stats.sets).toBe(2);
      expect(stats.size).toBe(1);
    });

    it('should calculate hit rate correctly', () => {
      cache.set('key', { data: 'test' });

      // 3 hits, 1 miss = 75%
      cache.get('key');
      cache.get('key');
      cache.get('key');
      cache.get('missing');

      const stats = cache.getStats();
      expect(stats.hitRate).toBe('75.00%');
    });

    it('should handle zero requests', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe('0%');
    });

    it('should estimate memory usage', () => {
      cache.set('key1', { data: '1' });
      cache.set('key2', { data: '2' });

      const stats = cache.getStats();
      expect(stats.memoryUsage).toContain('KB');
    });

    it('should reset statistics', () => {
      cache.set('key', { data: 'test' });
      cache.get('key');
      cache.get('missing');

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.sets).toBe(0);
    });
  });

  describe('Automatic cleanup', () => {
    it('should start cleanup interval by default', () => {
      const newCache = new BalanceCache();
      expect(newCache.cleanupInterval).toBeTruthy();
      newCache.stopCleanup();
    });

    it('should stop cleanup interval', () => {
      cache.stopCleanup();
      expect(cache.cleanupInterval).toBeNull();
    });

    it('should restart cleanup interval', () => {
      cache.stopCleanup();
      cache.startCleanup(100);
      expect(cache.cleanupInterval).toBeTruthy();
    });
  });

  describe('Edge cases', () => {
    it('should handle very large numbers', () => {
      const key = 'large';
      const data = { balance: '999999999999999999999999' };

      cache.set(key, data);
      expect(cache.get(key)).toEqual(data);
    });

    it('should handle concurrent access', () => {
      const key = 'concurrent';

      cache.set(key, { value: 1 });
      cache.set(key, { value: 2 });
      cache.set(key, { value: 3 });

      const result = cache.get(key);
      expect(result.value).toBe(3);
    });

    it('should handle null and undefined values', () => {
      cache.set('null', null);
      cache.set('undefined', undefined);

      expect(cache.get('null')).toBeNull();
      expect(cache.get('undefined')).toBeUndefined();
    });

    it('should handle special characters in keys', () => {
      const key = 'balance:1:0x123:token,token2';
      cache.set(key, { data: 'test' });

      expect(cache.get(key)).toEqual({ data: 'test' });
    });
  });
});
