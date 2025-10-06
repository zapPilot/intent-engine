/**
 * Enhanced Balance Cache Tests
 * Testing TTL alignment, monitoring, partial updates, and cache invalidation
 */

const BalanceCache = require('../balanceCache.enhanced');

describe('Enhanced BalanceCache', () => {
  let cache;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new BalanceCache(180000); // 3 minutes TTL
  });

  afterEach(() => {
    cache.stopCleanup();
  });

  describe('Cache TTL Alignment', () => {
    it('should expire cache after 3 minutes (aligned with price cache)', done => {
      const key = BalanceCache.generateKey('1', '0x123', null);
      const data = {
        balances: [{ tokenAddress: '0xAAA', balance: '1000' }],
        timestamp: Date.now(),
      };

      cache.set(key, data);

      // Should be cached immediately
      expect(cache.get(key)).toBeTruthy();

      // Should still be cached after 2 minutes
      setTimeout(() => {
        expect(cache.get(key)).toBeTruthy();
      }, 120000);

      // Should be expired after 3 minutes
      setTimeout(() => {
        expect(cache.get(key)).toBeNull();
        done();
      }, 180000);
    }, 200000);

    it('should align with backend TTL (180000ms = 180 seconds)', () => {
      expect(cache.defaultTTL).toBe(180000);
    });
  });

  describe('Monitoring and Metrics', () => {
    it('should track cache hits and misses', () => {
      const key = BalanceCache.generateKey('1', '0x123', null);
      const data = { balances: [], timestamp: Date.now() };

      // Miss - no data
      expect(cache.get(key)).toBeNull();

      // Set data
      cache.set(key, data);

      // Hit - data exists
      expect(cache.get(key)).toBeTruthy();
      expect(cache.get(key)).toBeTruthy();

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.sets).toBe(1);
    });

    it('should detect stale cache hits', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const key = BalanceCache.generateKey('1', '0x123', null);
      const staleData = {
        balances: [],
        timestamp: Date.now() - 600000, // 10 minutes old
      };

      cache.set(key, staleData);
      cache.get(key);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stale cache hit')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should calculate hit rate correctly', () => {
      const key = BalanceCache.generateKey('1', '0x123', null);
      cache.set(key, { balances: [], timestamp: Date.now() });

      cache.get(key); // hit
      cache.get(key); // hit
      cache.get('nonexistent'); // miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBe('66.67%'); // 2 hits / 3 total
    });

    it('should track average cache age', () => {
      const key = BalanceCache.generateKey('1', '0x123', null);
      const timestamp = Date.now() - 30000; // 30 seconds old

      cache.set(key, { balances: [], timestamp });
      cache.get(key);

      const stats = cache.getStats();
      expect(stats.avgCacheAge).toMatch(/30\./); // ~30 seconds
    });
  });

  describe('Partial Cache Updates', () => {
    it('should update specific token balance without full invalidation', () => {
      const key = BalanceCache.generateKey('1', '0x123', null);
      const originalData = {
        balances: [
          { tokenAddress: '0xAAA', balance: '1000' },
          { tokenAddress: '0xBBB', balance: '2000' },
        ],
        timestamp: Date.now(),
      };

      cache.set(key, originalData);

      // Update single token
      const updated = cache.updateTokenBalance('1', '0x123', '0xAAA', '1500');
      expect(updated).toBe(true);

      const cachedData = cache.get(key);
      expect(cachedData.balances[0].balance).toBe('1500');
      expect(cachedData.balances[1].balance).toBe('2000'); // Unchanged
      expect(cachedData.partialUpdate).toBe(true);

      const stats = cache.getStats();
      expect(stats.partialUpdates).toBe(1);
    });

    it('should handle partial update for non-existent token', () => {
      const key = BalanceCache.generateKey('1', '0x123', null);
      const data = {
        balances: [{ tokenAddress: '0xAAA', balance: '1000' }],
        timestamp: Date.now(),
      };

      cache.set(key, data);

      const updated = cache.updateTokenBalance('1', '0x123', '0xCCC', '3000');
      expect(updated).toBe(false); // Token not found, no update
    });

    it('should refresh specific tokens without full cache invalidation', async () => {
      const key = BalanceCache.generateKey('1', '0x123', null);
      const originalData = {
        balances: [
          { tokenAddress: '0xAAA', balance: '1000' },
          { tokenAddress: '0xBBB', balance: '2000' },
        ],
        timestamp: Date.now() - 60000, // 1 minute old
      };

      cache.set(key, originalData);

      // Mock fetch function
      const fetchFn = jest.fn().mockResolvedValue({
        balances: [{ tokenAddress: '0xAAA', balance: '1500' }],
        timestamp: Date.now(),
      });

      const refreshed = await cache.refreshTokens(
        '1',
        '0x123',
        ['0xAAA'],
        fetchFn
      );

      expect(fetchFn).toHaveBeenCalledWith('1', '0x123', ['0xAAA']);
      expect(refreshed.balances).toHaveLength(2); // Merged result
      expect(refreshed.partialUpdate).toBe(true);
      expect(
        refreshed.balances.find(b => b.tokenAddress === '0xAAA').balance
      ).toBe('1500');
      expect(
        refreshed.balances.find(b => b.tokenAddress === '0xBBB').balance
      ).toBe('2000');
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache after transaction', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const key = BalanceCache.generateKey('1', '0x123', null);
      cache.set(key, { balances: [], timestamp: Date.now() });

      const cleared = cache.invalidateAfterTransaction('1', '0x123', 'zapIn');

      expect(cleared).toBe(1);
      expect(cache.get(key)).toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Invalidated: address 0x123 (transaction:zapIn)'
        )
      );

      consoleLogSpy.mockRestore();
    });

    it('should clear all caches for an address with reason', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      cache.set(BalanceCache.generateKey('1', '0x123', ['0xAAA']), {
        balances: [],
      });
      cache.set(BalanceCache.generateKey('1', '0x123', ['0xBBB']), {
        balances: [],
      });
      cache.set(BalanceCache.generateKey('42161', '0x123', null), {
        balances: [],
      });

      const cleared = cache.clearAddress('0x123', 'balance_changed');

      expect(cleared).toBe(3);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalidated: address 0x123 (balance_changed)')
      );

      consoleLogSpy.mockRestore();
    });

    it('should clear all caches for a chain with reason', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      cache.set(BalanceCache.generateKey('1', '0x123', null), { balances: [] });
      cache.set(BalanceCache.generateKey('1', '0x456', null), { balances: [] });
      cache.set(BalanceCache.generateKey('42161', '0x123', null), {
        balances: [],
      });

      const cleared = cache.clearChain('1', 'chain_reorg');

      expect(cleared).toBe(2);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalidated: chain 1 (chain_reorg)')
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('Cache Health Reporting', () => {
    it('should log comprehensive health report', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const key = BalanceCache.generateKey('1', '0x123', null);
      cache.set(key, { balances: [], timestamp: Date.now() });
      cache.get(key);

      cache.logHealthReport();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Balance Cache Health Report')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache Size:')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Hit Rate:')
      );

      consoleLogSpy.mockRestore();
    });

    it('should provide detailed stats', () => {
      const key = BalanceCache.generateKey('1', '0x123', null);
      cache.set(key, { balances: [], timestamp: Date.now() });
      cache.get(key);
      cache.get('nonexistent');

      const stats = cache.getStats();

      expect(stats).toHaveProperty('size', 1);
      expect(stats).toHaveProperty('hits', 1);
      expect(stats).toHaveProperty('misses', 1);
      expect(stats).toHaveProperty('sets', 1);
      expect(stats).toHaveProperty('hitRate', '50.00%');
      expect(stats).toHaveProperty('avgCacheAge');
      expect(stats).toHaveProperty('memoryUsage');
      expect(stats).toHaveProperty('partialUpdates', 0);
      expect(stats).toHaveProperty('invalidations', 0);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain same key generation logic', () => {
      const key1 = BalanceCache.generateKey('1', '0xAbC', null);
      const key2 = BalanceCache.generateKey('1', '0xabc', null);

      expect(key1).toBe(key2); // Case insensitive
      expect(key1).toBe('balance:1:0xabc:all');
    });

    it('should maintain same key format for token arrays', () => {
      const key = BalanceCache.generateKey('1', '0x123', ['0xBBB', '0xAAA']);
      expect(key).toBe('balance:1:0x123:0xaaa,0xbbb'); // Sorted
    });
  });
});
