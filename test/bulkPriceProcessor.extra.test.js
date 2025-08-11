jest.mock('../src/config/priceConfig', () => ({
  getProvidersByPriority: jest.fn(() => ['p1', 'p2']),
}));

const BulkPriceProcessor = require('../src/services/priceService/BulkPriceProcessor');
const PriceCache = require('../src/services/priceService/PriceCache');
const { getProvidersByPriority } = require('../src/config/priceConfig');

describe('BulkPriceProcessor', () => {
  let cache;
  let rateLimitManager;
  let orchestrator;
  let providers;

  beforeEach(() => {
    cache = new PriceCache();
    rateLimitManager = { consumeTokens: jest.fn(() => true) };
    orchestrator = { processIndividualRequests: jest.fn(async () => {}) };
    providers = {
      p1: { isAvailable: jest.fn(() => true) },
      p2: { isAvailable: jest.fn(() => true) },
    };
  });

  it('bypasses cache when useCache=false and formats response', async () => {
    const proc = new BulkPriceProcessor(
      providers,
      rateLimitManager,
      cache,
      orchestrator
    );
    const out = await proc.getBulkPrices(['btc', 'eth'], { useCache: false });
    expect(out.totalRequested).toBe(2);
    expect(out.fromCache).toBe(0);
    expect(out.fromProviders).toBe(0);
    expect(out.failed).toBe(2);
    expect(out.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: 'btc' }),
        expect.objectContaining({ symbol: 'eth' }),
      ])
    );
  });

  it('uses bulk when available and caches successes; includes provider errors', async () => {
    // p1 supports bulk with partial success + error
    providers.p1.getBulkPrices = jest.fn(_symbols => ({
      results: {
        btc: { success: true, price: 1, provider: 'p1', symbol: 'btc' },
      },
      errors: [{ symbol: 'eth', provider: 'p1', error: 'not supported' }],
    }));

    const proc = new BulkPriceProcessor(
      providers,
      rateLimitManager,
      cache,
      orchestrator
    );

    const out = await proc.getBulkPrices(['btc', 'eth']);

    expect(providers.p1.getBulkPrices).toHaveBeenCalledWith(['btc', 'eth'], {
      timeout: 5000,
    });
    expect(out.results.btc).toMatchObject({ fromCache: false, provider: 'p1' });
    expect(out.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ symbol: 'eth' })])
    );
    // Cached
    expect(cache.get('btc')).toMatchObject({ provider: 'p1' });
  });

  it('falls back to individual requests when provider lacks bulk', async () => {
    providers.p1.getBulkPrices = undefined; // no bulk path

    const symbols = ['btc', 'eth'];

    orchestrator.processIndividualRequests.mockImplementation(
      (_provider, _name, _todo, res, _errors, remaining) => {
        // Simulate processing first missing token only
        res.eth = { success: true, price: 2, symbol: 'eth' };
        remaining.delete('eth');
      }
    );

    const proc = new BulkPriceProcessor(
      providers,
      rateLimitManager,
      cache,
      orchestrator
    );
    const out = await proc.getBulkPrices(symbols);

    expect(orchestrator.processIndividualRequests).toHaveBeenCalled();
    expect(out.results.eth).toBeDefined();
  });

  it('skips provider when rate limit exhausted', async () => {
    rateLimitManager.consumeTokens.mockReturnValueOnce(false);
    providers.p1.getBulkPrices = jest.fn();

    const proc = new BulkPriceProcessor(
      providers,
      rateLimitManager,
      cache,
      orchestrator
    );
    const out = await proc.getBulkPrices(['btc']);

    expect(providers.p1.getBulkPrices).not.toHaveBeenCalled();
    // Since no providers produced results, it becomes failed
    expect(out.failed).toBe(1);
  });

  it('handles bulk provider error and then falls back to individual', async () => {
    providers.p1.getBulkPrices = jest.fn(() => {
      throw new Error('bulk failed');
    });
    orchestrator.processIndividualRequests.mockImplementation(
      (_provider, _name, symbols, results, _errors, remaining) => {
        for (const s of symbols) {
          results[s] = { success: true, price: 42, symbol: s };
          remaining.delete(s);
        }
      }
    );

    const proc = new BulkPriceProcessor(
      providers,
      rateLimitManager,
      cache,
      orchestrator
    );
    const out = await proc.getBulkPrices(['btc', 'eth']);

    expect(out.results.btc).toBeDefined();
    expect(out.results.eth).toBeDefined();
    expect(out.failed).toBe(0);
  });

  it('addFailureErrors lists available providers for leftover symbols', () => {
    providers.p2.isAvailable.mockReturnValue(true);
    providers.p1.isAvailable.mockReturnValue(false);
    const proc = new BulkPriceProcessor(
      providers,
      rateLimitManager,
      cache,
      orchestrator
    );

    const errors = [];
    const remaining = new Set(['x']);
    proc.addFailureErrors(remaining, errors, getProvidersByPriority());

    expect(errors[0]).toMatchObject({ symbol: 'x' });
    // Only available providers included
    expect(errors[0].providers).toEqual(['p2']);
  });
});
