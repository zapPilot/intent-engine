/**
 * InsertionStrategyParams Test Suite
 * Tests the parameter object for fee insertion strategy calculations
 */

const InsertionStrategyParams = require('../../src/valueObjects/InsertionStrategyParams');

describe('InsertionStrategyParams', () => {
  const validParams = {
    batches: [
      ['token1', 'token2'],
      ['token3', 'token4', 'token5'],
    ],
    totalFeeETH: 0.05,
    totalTransactionCount: 10,
    feeTransactionCount: 2,
  };

  describe('constructor', () => {
    it('should create instance with valid parameters', () => {
      const params = new InsertionStrategyParams(validParams);

      expect(params.batches).toEqual(validParams.batches);
      expect(params.totalFeeETH).toBe(0.05);
      expect(params.totalTransactionCount).toBe(10);
      expect(params.feeTransactionCount).toBe(2);
      expect(params.minimumThresholdPercentage).toBe(0.4); // default
      expect(params.safetyBuffer).toBe(0.1); // default
      expect(params.spreadFactor).toBe(0.3); // default
      expect(params.timestamp).toBeDefined();
    });

    it('should use custom strategy options', () => {
      const params = new InsertionStrategyParams({
        ...validParams,
        minimumThresholdPercentage: 0.6,
        safetyBuffer: 0.15,
        spreadFactor: 0.25,
      });

      expect(params.minimumThresholdPercentage).toBe(0.6);
      expect(params.safetyBuffer).toBe(0.15);
      expect(params.spreadFactor).toBe(0.25);
    });

    it('should throw error for invalid batches', () => {
      expect(() => {
        new InsertionStrategyParams({
          ...validParams,
          batches: [],
        });
      }).toThrow('batches must be a non-empty array');
    });

    it('should throw error for negative totalFeeETH', () => {
      expect(() => {
        new InsertionStrategyParams({
          ...validParams,
          totalFeeETH: -1,
        });
      }).toThrow('totalFeeETH must be a non-negative number');
    });

    it('should throw error for invalid percentages', () => {
      expect(() => {
        new InsertionStrategyParams({
          ...validParams,
          minimumThresholdPercentage: 1.5,
        });
      }).toThrow('minimumThresholdPercentage must be between 0 and 1');

      expect(() => {
        new InsertionStrategyParams({
          ...validParams,
          safetyBuffer: -0.1,
        });
      }).toThrow('safetyBuffer must be between 0 and 1');

      expect(() => {
        new InsertionStrategyParams({
          ...validParams,
          spreadFactor: 2,
        });
      }).toThrow('spreadFactor must be between 0 and 1');
    });
  });

  describe('factory methods', () => {
    it('should create conservative strategy parameters', () => {
      const params =
        InsertionStrategyParams.forConservativeStrategy(validParams);

      expect(params.minimumThresholdPercentage).toBe(0.6);
      expect(params.safetyBuffer).toBe(0.2);
      expect(params.spreadFactor).toBe(0.2);
      expect(params.getStrategyType()).toBe('conservative');
    });

    it('should create aggressive strategy parameters', () => {
      const params = InsertionStrategyParams.forAggressiveStrategy(validParams);

      expect(params.minimumThresholdPercentage).toBe(0.2);
      expect(params.safetyBuffer).toBe(0.05);
      expect(params.spreadFactor).toBe(0.5);
      expect(params.getStrategyType()).toBe('aggressive');
    });

    it('should create balanced strategy parameters', () => {
      const params = InsertionStrategyParams.forBalancedStrategy(validParams);

      expect(params.minimumThresholdPercentage).toBe(0.4); // default
      expect(params.safetyBuffer).toBe(0.1); // default
      expect(params.spreadFactor).toBe(0.3); // default
      expect(params.getStrategyType()).toBe('balanced');
    });
  });

  describe('utility methods', () => {
    let params;

    beforeEach(() => {
      params = new InsertionStrategyParams(validParams);
    });

    it('should calculate total token count', () => {
      expect(params.getTotalTokenCount()).toBe(5); // 2 + 3 tokens
    });

    it('should determine strategy type', () => {
      expect(params.getStrategyType()).toBe('balanced');

      const conservative =
        InsertionStrategyParams.forConservativeStrategy(validParams);
      expect(conservative.getStrategyType()).toBe('conservative');

      const aggressive =
        InsertionStrategyParams.forAggressiveStrategy(validParams);
      expect(aggressive.getStrategyType()).toBe('aggressive');
    });

    it('should return minimum threshold options', () => {
      const options = params.getMinimumThresholdOptions();

      expect(options).toEqual({
        minimumThresholdPercentage: 0.4,
        safetyBuffer: 0.1,
      });
    });

    it('should return insertion options', () => {
      const options = params.getInsertionOptions();

      expect(options).toEqual({
        spreadFactor: 0.3,
      });
    });

    it('should convert to method parameters for backward compatibility', () => {
      const methodParams = params.toMethodParameters();

      expect(methodParams).toEqual([
        validParams.batches,
        validParams.totalFeeETH,
        validParams.totalTransactionCount,
        validParams.feeTransactionCount,
        {
          minimumThresholdPercentage: 0.4,
          safetyBuffer: 0.1,
        },
      ]);
    });

    it('should provide meaningful summary', () => {
      const summary = params.getSummary();

      expect(summary).toEqual({
        totalTokens: 5,
        totalTransactions: 10,
        feeTransactions: 2,
        strategyType: 'balanced',
        thresholdPercentage: 0.4,
        timestamp: params.timestamp,
      });
    });

    it('should clone with updates', () => {
      const cloned = params.clone({ totalTransactionCount: 20 });

      expect(cloned.totalTransactionCount).toBe(20);
      expect(cloned.totalFeeETH).toBe(validParams.totalFeeETH);
      expect(cloned !== params).toBe(true); // Different instances
    });
  });

  describe('edge cases', () => {
    it('should handle single batch', () => {
      const params = new InsertionStrategyParams({
        batches: [['token1', 'token2']],
        totalFeeETH: 0.01,
        totalTransactionCount: 4,
        feeTransactionCount: 1,
      });

      expect(params.getTotalTokenCount()).toBe(2);
      expect(params.batches.length).toBe(1);
    });

    it('should handle zero fee amount', () => {
      const params = new InsertionStrategyParams({
        ...validParams,
        totalFeeETH: 0,
      });

      expect(params.totalFeeETH).toBe(0);
    });

    it('should handle large transaction counts', () => {
      const params = new InsertionStrategyParams({
        ...validParams,
        totalTransactionCount: 1000,
        feeTransactionCount: 50,
      });

      expect(params.totalTransactionCount).toBe(1000);
      expect(params.feeTransactionCount).toBe(50);
    });

    it('should handle metadata correctly', () => {
      const metadata = { strategy: 'custom', version: '2.0' };
      const params = new InsertionStrategyParams({
        ...validParams,
        metadata,
      });

      expect(params.metadata).toEqual(metadata);

      const cloned = params.clone();
      expect(cloned.metadata).toEqual(metadata);
      expect(cloned.metadata !== params.metadata).toBe(true); // Shallow copy
    });
  });

  describe('strategy type edge cases', () => {
    it('should handle boundary values for strategy type detection', () => {
      const exactlyBalanced = new InsertionStrategyParams({
        ...validParams,
        minimumThresholdPercentage: 0.4,
      });
      expect(exactlyBalanced.getStrategyType()).toBe('balanced');

      const justConservative = new InsertionStrategyParams({
        ...validParams,
        minimumThresholdPercentage: 0.6,
      });
      expect(justConservative.getStrategyType()).toBe('conservative');

      const justAggressive = new InsertionStrategyParams({
        ...validParams,
        minimumThresholdPercentage: 0.2,
      });
      expect(justAggressive.getStrategyType()).toBe('aggressive');
    });
  });
});
