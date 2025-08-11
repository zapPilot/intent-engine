const SwapProcessingService = require('../src/services/SwapProcessingService');

jest.mock('../src/services/TokenProcessor', () => {
  return jest.fn().mockImplementation(() => ({
    processTokenWithSSE: jest.fn(p => ({ ok: true, p })),
    processTokenSwap: jest.fn(() => ({ success: true })),
    handleTokenFailure: jest.fn(() => ({ success: false, reason: 'x' })),
    calculateTradingLoss: jest.fn((q, v) => ({
      inputValueUSD: v,
      out: q?.toUsd || 0,
    })),
  }));
});

jest.mock('../src/services/TokenBatchProcessor', () => {
  return jest.fn().mockImplementation(() => ({
    processTokenBatchWithSSE: jest.fn(() => ({
      successful: [],
      failed: [],
      transactions: [],
      totalValueUSD: 0,
    })),
    progressTracker: {
      handleTokenProcessingResult: jest.fn(() => ({
        updatedTransactionIndex: 7,
      })),
    },
  }));
});

describe('SwapProcessingService delegation and context', () => {
  it('delegates to composed services', async () => {
    const svc = new SwapProcessingService({}, {});

    const tokenRes = await svc.processTokenWithSSE({ token: { symbol: 'x' } });
    expect(tokenRes.ok).toBe(true);

    const swapRes = await svc.processTokenSwap({}, {});
    expect(swapRes.success).toBe(true);

    const failRes = svc.handleTokenFailure({ symbol: 'x' }, new Error('bad'));
    expect(failRes.success).toBe(false);

    const loss = svc.calculateTradingLoss({ toUsd: 1 }, 10);
    expect(loss.inputValueUSD).toBe(10);
  });

  it('createProcessingContext fills defaults for legacy executionContext', () => {
    const ctx = SwapProcessingService.createProcessingContext({
      chainId: 1,
      ethPrice: 3000,
      userAddress: '0x0000000000000000000000000000000000000000',
      params: {},
    });

    expect(ctx.toTokenAddress).toBe(
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    );
    expect(ctx.toTokenDecimals).toBe(18);
    expect(ctx.slippage).toBe(1);
    expect(ctx.referralAddress).toBeNull();
  });
});
