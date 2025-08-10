const SmartFeeInsertionService = require('../src/services/SmartFeeInsertionService');

describe('SmartFeeInsertionService additional paths', () => {
  let service;

  beforeEach(() => {
    service = new SmartFeeInsertionService();
  });

  it('shouldInsertFeeBlock uses first insertion point when available', () => {
    const strategy = {
      insertionPoints: [5, 8],
      minimumThreshold: 3,
      strategy: 'random',
    };
    expect(service.shouldInsertFeeBlock(4, strategy, 0, 0)).toBe(false);
    expect(service.shouldInsertFeeBlock(5, strategy, 0, 0)).toBe(true);
  });

  it('shouldInsertFeeBlock with fallback uses progress threshold', () => {
    const strategy = {
      insertionPoints: [],
      minimumThreshold: 7,
      strategy: 'fallback',
    };
    // Needs >= 80% processed tokens
    expect(service.shouldInsertFeeBlock(999, strategy, 7, 10)).toBe(false);
    expect(service.shouldInsertFeeBlock(999, strategy, 8, 10)).toBe(true);
  });

  it('executeFeeBlockInsertion inserts block and reports position', () => {
    const params = {
      feeTransactions: [{ id: 'fee1' }, { id: 'fee2' }],
      insertionStrategy: {
        insertionPoints: [2],
        minimumThreshold: 1,
        strategy: 'random',
      },
      transactions: [{ id: 't1' }, { id: 't2' }],
      currentTransactionCount: 2,
      processedTokenCount: 0,
      totalTokenCount: 0,
    };

    const res = service.executeFeeBlockInsertion(params);
    expect(res.inserted).toBe(true);
    expect(res.position).toBe(2);
    expect(res.feeTransactionCount).toBe(2);
    expect(params.transactions.slice(-2)).toEqual([
      { id: 'fee1' },
      { id: 'fee2' },
    ]);
  });

  it('executeFeeBlockInsertion returns reason when not inserted', () => {
    const params = {
      feeTransactions: [],
      insertionStrategy: {
        insertionPoints: [2],
        minimumThreshold: 1,
        strategy: 'random',
      },
      transactions: [],
      currentTransactionCount: 1,
      processedTokenCount: 0,
      totalTokenCount: 0,
    };
    const res = service.executeFeeBlockInsertion(params);
    expect(res.inserted).toBe(false);
    expect(res.reason).toMatch(/No fee transactions/);
  });

  it('executeFallbackFeeInsertion appends to end when provided', () => {
    const params = {
      feeTransactions: [{ id: 'fee1' }],
      transactions: [{ id: 'a' }],
    };
    const res = service.executeFallbackFeeInsertion(params);
    expect(res.inserted).toBe(true);
    expect(res.position).toBe(1);
    expect(params.transactions[1]).toEqual({ id: 'fee1' });
  });

  it('processFeeInsertion inserts up to available points', () => {
    const params = {
      shouldInsertFees: true,
      insertionPoints: [1, 3],
      currentTransactionIndex: 1,
      feesInserted: 0,
      feeTransactions: [{ id: 'fee1' }, { id: 'fee2' }],
      results: { transactions: [{ id: 'x' }] },
    };

    const state = service.processFeeInsertion(params);
    expect(state.feesInserted).toBe(2);
    expect(state.currentTransactionIndex).toBe(3);
    expect(state.insertionPoints).toEqual([]);
    expect(params.results.transactions.slice(0, 3)).toEqual([
      { id: 'x' },
      { id: 'fee1' },
      { id: 'fee2' },
    ]);
  });

  it('insertRemainingFees appends leftover fees', () => {
    const results = { transactions: [] };
    service.insertRemainingFees({
      shouldInsertFees: true,
      feesInserted: 1,
      feeTransactions: [{ id: 'f1' }, { id: 'f2' }],
      results,
    });
    expect(results.transactions).toEqual([{ id: 'f2' }]);
  });
});
