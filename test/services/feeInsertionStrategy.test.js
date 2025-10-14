const FeeInsertionStrategy = require('../../src/services/fee/FeeInsertionStrategy');
const InsertionStrategyParams = require('../../src/valueObjects/InsertionStrategyParams');

describe('FeeInsertionStrategy', () => {
  let strategy;

  const sampleBatches = [[{ symbol: 'A' }], [{ symbol: 'B' }]];

  beforeEach(() => {
    strategy = new FeeInsertionStrategy();
  });

  describe('calculateInsertionStrategyWithParams', () => {
    it('delegates to calculateInsertionStrategy when provided params object', () => {
      const params = InsertionStrategyParams.forBalancedStrategy({
        batches: sampleBatches,
        totalFeeETH: 0.2,
        totalTransactionCount: 8,
        feeTransactionCount: 2,
      });

      const spy = jest
        .spyOn(strategy, 'calculateInsertionStrategy')
        .mockReturnValue({ strategy: 'random', insertionPoints: [3, 6] });

      const result = strategy.calculateInsertionStrategyWithParams(params);

      expect(spy).toHaveBeenCalledWith(
        params.batches,
        params.totalFeeETH,
        params.totalTransactionCount,
        params.feeTransactionCount,
        expect.objectContaining({ minimumThresholdPercentage: 0.4 })
      );
      expect(result).toEqual({ strategy: 'random', insertionPoints: [3, 6] });
    });

    it('throws when provided params are invalid', () => {
      expect(() => strategy.calculateInsertionStrategyWithParams({})).toThrow(
        'Expected InsertionStrategyParams instance'
      );
    });
  });

  describe('calculateInsertionStrategy', () => {
    it('returns random strategy metadata when threshold below total transactions', () => {
      jest
        .spyOn(strategy.calculator, 'calculateMinimumThreshold')
        .mockReturnValue(3);
      jest
        .spyOn(strategy.calculator, 'generateRandomInsertionPoints')
        .mockReturnValue([4, 6]);

      const result = strategy.calculateInsertionStrategy(
        sampleBatches,
        0.3,
        10,
        2,
        { spreadFactor: 0.5 }
      );

      expect(result).toMatchObject({
        strategy: 'random',
        minimumThreshold: 3,
        insertionPoints: [4, 6],
        metadata: expect.objectContaining({
          totalTokens: 2,
          totalTransactions: 10,
          feeTransactionCount: 2,
        }),
      });
    });

    it('returns fallback strategy when threshold exceeds total transactions', () => {
      jest
        .spyOn(strategy.calculator, 'calculateMinimumThreshold')
        .mockReturnValue(12);
      jest
        .spyOn(strategy.calculator, 'generateRandomInsertionPoints')
        .mockReturnValue([9, 10]);

      const result = strategy.calculateInsertionStrategy(
        sampleBatches,
        0.3,
        10,
        2
      );

      expect(result.strategy).toBe('fallback');
      expect(result.insertionPoints).toEqual([9, 10]);
    });
  });

  describe('validateInsertionStrategy', () => {
    it('validates points within range and after minimum', () => {
      const isValid = strategy.validateInsertionStrategy(
        {
          insertionPoints: [3, 5],
          minimumThreshold: 3,
          strategy: 'random',
        },
        8
      );
      expect(isValid).toBe(true);
    });

    it('returns false when points violate constraints', () => {
      const isValid = strategy.validateInsertionStrategy(
        {
          insertionPoints: [1, 9],
          minimumThreshold: 3,
          strategy: 'random',
        },
        5
      );
      expect(isValid).toBe(false);
    });
  });

  describe('shouldInsertFeeBlock', () => {
    it('inserts immediately when fallback strategy reaches 80% progress', () => {
      const shouldInsert = strategy.shouldInsertFeeBlock(
        10,
        {
          strategy: 'fallback',
          insertionPoints: [],
          minimumThreshold: 12,
        },
        8,
        10
      );

      expect(shouldInsert).toBe(true);
    });

    it('uses first insertion point for random strategy', () => {
      const shouldInsert = strategy.shouldInsertFeeBlock(
        5,
        {
          strategy: 'random',
          insertionPoints: [4, 7],
          minimumThreshold: 2,
        },
        1,
        5
      );

      expect(shouldInsert).toBe(true);
    });

    it('falls back to minimum threshold when no insertion points exist', () => {
      const shouldInsert = strategy.shouldInsertFeeBlock(
        3,
        {
          strategy: 'random',
          insertionPoints: [],
          minimumThreshold: 3,
        },
        1,
        4
      );

      expect(shouldInsert).toBe(true);
    });
  });

  describe('executeFeeBlockInsertion', () => {
    it('inserts fee block when conditions satisfied', () => {
      const feeTransactions = [{ id: 'fee1' }, { id: 'fee2' }];
      const transactions = [{ id: 't1' }];

      jest.spyOn(strategy, 'shouldInsertFeeBlock').mockReturnValue(true);

      const result = strategy.executeFeeBlockInsertion({
        feeTransactions,
        insertionStrategy: { strategy: 'random' },
        transactions,
        currentTransactionCount: transactions.length,
        processedTokenCount: 1,
        totalTokenCount: 2,
      });

      expect(result).toMatchObject({ inserted: true, feeTransactionCount: 2 });
      expect(transactions.slice(-2)).toEqual(feeTransactions);
    });

    it('skips insertion when conditions fail', () => {
      const result = strategy.executeFeeBlockInsertion({
        feeTransactions: [{ id: 'fee1' }],
        insertionStrategy: { strategy: 'random', insertionPoints: [10] },
        transactions: [],
        currentTransactionCount: 0,
        processedTokenCount: 0,
        totalTokenCount: 2,
      });

      expect(result.inserted).toBe(false);
      expect(result.reason).toMatch(/Conditions not met/);
    });
  });

  describe('executeFallbackFeeInsertion', () => {
    it('appends fee transactions at the end', () => {
      const feeTransactions = [{ id: 'fee1' }];
      const transactions = [{ id: 'existing' }];

      const result = strategy.executeFallbackFeeInsertion({
        feeTransactions,
        transactions,
      });

      expect(result).toMatchObject({ inserted: true, position: 1 });
      expect(transactions).toHaveLength(2);
    });

    it('reports no-op when nothing to insert', () => {
      const result = strategy.executeFallbackFeeInsertion({
        feeTransactions: [],
        transactions: [],
      });

      expect(result).toEqual({
        inserted: false,
        reason: 'No fee transactions to insert',
      });
    });
  });

  describe('processFeeInsertion', () => {
    it('injects fees when insertion point reached', () => {
      const feeTransactions = [{ id: 'fee1' }, { id: 'fee2' }];
      const results = { transactions: [] };

      const state = strategy.processFeeInsertion({
        shouldInsertFees: true,
        insertionPoints: [0, 1],
        currentTransactionIndex: 0,
        feesInserted: 0,
        feeTransactions,
        results,
      });

      expect(state).toEqual({
        insertionPoints: [],
        feesInserted: 2,
        currentTransactionIndex: 2,
      });
      expect(results.transactions).toEqual(feeTransactions);
    });

    it('makes no changes when insertion conditions are not met', () => {
      const feeTransactions = [{ id: 'fee1' }];
      const results = { transactions: [] };

      const state = strategy.processFeeInsertion({
        shouldInsertFees: true,
        insertionPoints: [2],
        currentTransactionIndex: 0,
        feesInserted: 0,
        feeTransactions,
        results,
      });

      expect(state).toEqual({
        insertionPoints: [2],
        feesInserted: 0,
        currentTransactionIndex: 0,
      });
      expect(results.transactions).toHaveLength(0);
    });
  });

  describe('insertRemainingFees', () => {
    it('pushes remaining fees when enabled', () => {
      const feeTransactions = [{ id: 'fee1' }, { id: 'fee2' }];
      const results = { transactions: [{ id: 'existing' }] };

      strategy.insertRemainingFees({
        shouldInsertFees: true,
        feesInserted: 1,
        feeTransactions,
        results,
      });

      expect(results.transactions).toHaveLength(2);
      expect(results.transactions[1]).toEqual(feeTransactions[1]);
    });

    it('does nothing when all fees inserted already', () => {
      const results = { transactions: [] };

      strategy.insertRemainingFees({
        shouldInsertFees: true,
        feesInserted: 2,
        feeTransactions: [{ id: 'fee1' }, { id: 'fee2' }],
        results,
      });

      expect(results.transactions).toHaveLength(0);
    });
  });
});
