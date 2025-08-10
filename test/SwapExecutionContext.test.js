const SwapExecutionContext = require('../src/valueObjects/SwapExecutionContext');

describe('SwapExecutionContext', () => {
  const baseParams = {
    chainId: 1,
    ethPrice: 3000,
    userAddress: '0x1111111111111111111111111111111111111111',
    toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    toTokenDecimals: 18,
  };

  it('constructs with required fields and defaults', () => {
    const ctx = new SwapExecutionContext({ ...baseParams, slippage: 1 });
    expect(ctx.chainId).toBe(1);
    expect(ctx.ethPrice).toBe(3000);
    expect(ctx.toTokenDecimals).toBe(18);
    expect(ctx.slippage).toBe(1);
    expect(typeof ctx.createdAt).toBe('string');
  });

  it('throws for missing or invalid required fields', () => {
    expect(() => new SwapExecutionContext({})).toThrow(
      /missing required fields/i
    );
    expect(
      () => new SwapExecutionContext({ ...baseParams, chainId: 0 })
    ).toThrow(/chainId/);
    expect(
      () => new SwapExecutionContext({ ...baseParams, ethPrice: 0 })
    ).toThrow(/ethPrice/);
    expect(
      () =>
        new SwapExecutionContext({
          ...baseParams,
          userAddress: '0xBAD',
        })
    ).toThrow(/valid Ethereum address/);
  });

  it('fromExecutionContext fills defaults and maps props', () => {
    const legacy = {
      chainId: 1,
      ethPrice: 2000,
      userAddress: baseParams.userAddress,
      toTokenPrice: 2100,
      params: {},
    };
    const ctx = SwapExecutionContext.fromExecutionContext(legacy);
    expect(ctx.toTokenAddress).toBe(
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    );
    expect(ctx.toTokenDecimals).toBe(18);
    expect(ctx.toTokenPrice).toBe(2100);
  });

  it('createSwapRequest maps token fields and context', () => {
    const ctx = new SwapExecutionContext(baseParams);
    const token = { address: '0xabc', decimals: 6, raw_amount: '123' };
    const req = ctx.createSwapRequest(token);
    expect(req).toMatchObject({
      chainId: 1,
      fromTokenAddress: '0xabc',
      fromTokenDecimals: 6,
      toTokenAddress: baseParams.toTokenAddress,
      toTokenDecimals: 18,
      fromAddress: baseParams.userAddress,
      slippage: 0.5,
      eth_price: 3000,
    });
  });

  it('toLegacyFormat returns expected shape', () => {
    const ctx = new SwapExecutionContext({
      ...baseParams,
      slippage: 0.75,
      toTokenPrice: 3050,
    });
    expect(ctx.toLegacyFormat()).toEqual({
      chainId: 1,
      ethPrice: 3000,
      toTokenPrice: 3050,
      userAddress: baseParams.userAddress,
      toTokenAddress: baseParams.toTokenAddress,
      toTokenDecimals: 18,
      slippage: 0.75,
    });
  });

  it('clone returns new instance with updates applied', () => {
    const ctx = new SwapExecutionContext(baseParams);
    const cloned = ctx.clone({ slippage: 2, metadata: { note: 'x' } });
    expect(cloned).not.toBe(ctx);
    expect(cloned.slippage).toBe(2);
    expect(cloned.metadata).toEqual({ note: 'x' });
    expect(cloned.userAddress).toBe(ctx.userAddress);
  });
});
