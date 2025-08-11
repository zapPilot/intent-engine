const PriceCache = require('../src/services/priceService/PriceCache');

describe('PriceCache', () => {
  let cache;
  beforeEach(() => {
    cache = new PriceCache();
  });

  it('sets and gets cached entries (case-insensitive)', () => {
    const data = { success: true, price: 123, symbol: 'btc' };
    cache.set('BTC', data, 60);

    expect(cache.get('btc')).toEqual(data);
    expect(cache.get('BtC')).toEqual(data);

    const stats = cache.getStats();
    expect(stats.size).toBe(1);
    expect(stats.entries).toEqual(['btc']);
  });

  it('returns null and cleans up after expiration', () => {
    const data = { success: true, price: 10, symbol: 'eth' };
    cache.set('eth', data, 0.001); // ~1ms ttl

    // Immediately available
    expect(cache.get('ETH')).toEqual(data);

    // Simulate passage of time (>=1ms)
    const start = Date.now;
    const base = Date.now();
    let t = base;
    Date.now = () => (t += 10);

    // Expired path: should return null and delete entry
    expect(cache.get('eth')).toBeNull();

    // Subsequent stats should be empty
    const stats = cache.getStats();
    expect(stats.size).toBe(0);
    expect(stats.entries).toEqual([]);

    // Restore Date.now
    Date.now = start;
  });

  it('getBulk returns cached hits and remaining misses', () => {
    cache.set('btc', { success: true, price: 1, symbol: 'btc' }, 60);
    cache.set('usdc', { success: true, price: 1, symbol: 'usdc' }, 60);

    const { results, remaining } = cache.getBulk(['BTC', 'ETH', 'USDC']);

    expect(results).toEqual({
      btc: { success: true, price: 1, symbol: 'btc', fromCache: true },
      usdc: { success: true, price: 1, symbol: 'usdc', fromCache: true },
    });
    expect(remaining.sort()).toEqual(['eth']);
  });

  it('clear empties both data and timeouts', () => {
    cache.set('btc', { success: true, price: 1, symbol: 'btc' }, 60);
    cache.clear();
    expect(cache.get('btc')).toBeNull();
    expect(cache.getStats()).toEqual({ size: 0, entries: [] });
  });
});
