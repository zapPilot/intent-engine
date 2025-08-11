const TokenProcessor = require('../src/services/TokenProcessor');

// Provide light stubs for dependencies
const swapService = {};
const priceService = {};

// Stub TransactionBuilder methods used inside calculateTradingLoss paths are not touched here

describe('TokenProcessor.calculateTradingLoss and failure paths', () => {
  it('calculates loss when values present and handles zero safely', () => {
    const tp = new TokenProcessor(swapService, priceService);
    const res1 = tp.calculateTradingLoss({ toUsd: 50, gasCostUSD: 5 }, 100);
    expect(res1).toMatchObject({ inputValueUSD: 100, outputValueUSD: 55 });

    const res2 = tp.calculateTradingLoss({ toUsd: 0, gasCostUSD: 0 }, 0);
    expect(res2.lossPercentage).toBe(0);
  });

  it('returns informative object when insufficient data', () => {
    const tp = new TokenProcessor(swapService, priceService);
    const res = tp.calculateTradingLoss({}, undefined);
    expect(res.error).toBe('Insufficient data for loss calculation');
    expect(res.outputValueUSD).toBeNull();
  });

  it('handleTokenFailure emits SSE event via streamWriter', () => {
    const tp = new TokenProcessor(swapService, priceService);
    const writes = [];
    const streamWriter = ev => writes.push(ev);

    const token = { symbol: 'TKN', amount: 2, price: 3 };
    const out = tp.handleTokenFailure(token, new Error('boom'), {
      tokenIndex: 0,
      streamWriter,
      processedTokens: 0,
      totalTokens: 1,
    });

    expect(out.success).toBe(false);
    expect(writes.length).toBe(1);
    expect(writes[0].type).toBe('token_failed');
  });
});
