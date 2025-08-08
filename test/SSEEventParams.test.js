const SSEEventParams = require('../src/valueObjects/SSEEventParams');

describe('SSEEventParams', () => {
  const baseFields = {
    tokenIndex: 0,
    token: { symbol: 'ETH' },
    processedTokens: 0,
    totalTokens: 2,
  };

  it('forSuccess creates params from TokenProcessingResult', () => {
    const result = {
      token: baseFields.token,
      transactions: [{ id: 1 }],
      tradingLoss: '1',
      getSwapData: () => ({
        provider: 'provider1',
        expectedTokenAmount: '100',
        minToAmount: '90',
        toUsd: 1000,
        gasCostUSD: 50,
      }),
    };

    const params = SSEEventParams.forSuccess(
      result,
      baseFields.tokenIndex,
      baseFields.processedTokens,
      baseFields.totalTokens
    );

    expect(params.getTokenReadyParams()).toEqual({
      tokenIndex: 0,
      token: baseFields.token,
      transactions: result.transactions,
      provider: 'provider1',
      expectedTokenAmount: '100',
      minToAmount: '90',
      toUsd: 1000,
      gasCostUSD: 50,
      tradingLoss: '1',
      processedTokens: 0,
      totalTokens: 2,
    });
  });

  it('forFailure creates params with error', () => {
    const result = { token: baseFields.token, error: 'boom', tradingLoss: '2' };
    const params = SSEEventParams.forFailure(
      result,
      1,
      baseFields.processedTokens,
      baseFields.totalTokens
    );
    expect(params.getTokenFailedParams()).toEqual({
      tokenIndex: 1,
      token: baseFields.token,
      error: 'boom',
      errorCategory: null,
      userFriendlyMessage: null,
      provider: 'failed',
      tradingLoss: '2',
      processedTokens: 0,
      totalTokens: 2,
    });
  });

  it('getProgress calculates correctly and handles invalid totals', () => {
    const params = new SSEEventParams({ ...baseFields, transactions: [] });
    expect(params.getProgress()).toBeCloseTo(0.5);

    const zeroTotal = new SSEEventParams({
      ...baseFields,
      totalTokens: 0,
      transactions: [],
    });
    expect(zeroTotal.getProgress()).toBe(0);
  });

  it('validate enforces required fields and event specifics', () => {
    const missing = new SSEEventParams();
    expect(() => missing.validate('success')).toThrow(
      'SSEEventParams missing required field: tokenIndex'
    );

    const success = new SSEEventParams({
      ...baseFields,
      transactions: [{ id: 1 }],
    });
    expect(() => success.validate('success')).not.toThrow();

    const noTransactions = new SSEEventParams({
      ...baseFields,
      transactions: null,
    });
    expect(() => noTransactions.validate('success')).toThrow(
      'SSEEventParams for success event must include transactions'
    );

    const failure = new SSEEventParams({ ...baseFields, error: 'oops' });
    expect(() => failure.validate('failure')).not.toThrow();

    const failureNoError = new SSEEventParams(baseFields);
    expect(() => failureNoError.validate('failure')).toThrow(
      'SSEEventParams for failure event must include error'
    );
  });

  it('clone creates new instance with updates', () => {
    const original = new SSEEventParams({
      ...baseFields,
      transactions: [],
      metadata: { a: 1 },
    });
    const cloned = original.clone({ provider: 'new' });
    expect(cloned).not.toBe(original);
    expect(cloned.provider).toBe('new');
    expect(cloned.metadata).toEqual(original.metadata);
  });

  it('fromLegacyParams wraps legacy object', () => {
    const legacy = { ...baseFields, transactions: [] };
    const params = SSEEventParams.fromLegacyParams(legacy);
    expect(params).toBeInstanceOf(SSEEventParams);
    expect(params.token).toBe(legacy.token);
  });
});
