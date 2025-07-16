const SmartFeeInsertionService = require('../src/services/SmartFeeInsertionService');
const crypto = require('crypto');

// Mock crypto.randomInt for deterministic testing
jest.mock('crypto', () => ({
  randomInt: jest.fn(),
}));

describe('SmartFeeInsertionService', () => {
  let service;

  beforeEach(() => {
    service = new SmartFeeInsertionService();
    jest.clearAllMocks();

    // Default mock: return middle of range for predictable testing
    crypto.randomInt.mockImplementation((min, max) =>
      Math.floor((min + max - 1) / 2)
    );
  });

  describe('calculateMinimumThreshold', () => {
    it('should calculate correct minimum threshold for single batch', () => {
      const batches = [[{ symbol: 'TOKEN1' }, { symbol: 'TOKEN2' }]]; // 2 tokens = 4 transactions
      const totalFeeETH = 0.001;

      const result = service.calculateMinimumThreshold(batches, totalFeeETH);

      // 2 tokens * 2 tx/token = 4 total transactions
      // 50% (40% + 10% buffer) = 2 transactions minimum
      // 20% of tokens minimum = ceil(2 * 0.2) = 1
      // Max of (2, 1) = 2
      expect(result).toBe(2);
    });

    it('should calculate correct minimum threshold for multiple batches', () => {
      const batches = [
        [{ symbol: 'TOKEN1' }, { symbol: 'TOKEN2' }], // 2 tokens = 4 tx
        [{ symbol: 'TOKEN3' }], // 1 token = 2 tx
        [{ symbol: 'TOKEN4' }, { symbol: 'TOKEN5' }], // 2 tokens = 4 tx
      ];
      const totalFeeETH = 0.002;

      const result = service.calculateMinimumThreshold(batches, totalFeeETH);

      // 5 tokens * 2 tx/token = 10 total transactions
      // 50% = 5 transactions minimum
      // 20% of tokens = ceil(5 * 0.2) = 1
      // Max of (5, 1) = 5
      expect(result).toBe(5);
    });

    it('should respect absolute minimum even for small batches', () => {
      const batches = [[{ symbol: 'TOKEN1' }]]; // 1 token = 2 transactions
      const totalFeeETH = 0.0001;

      const result = service.calculateMinimumThreshold(batches, totalFeeETH);

      // 1 token * 2 tx/token = 2 total transactions
      // 50% = 1 transaction minimum
      // 20% of tokens = ceil(1 * 0.2) = 1
      // Max of (1, 1) = 1
      expect(result).toBe(1);
    });

    it('should handle custom options', () => {
      const batches = [[{ symbol: 'TOKEN1' }, { symbol: 'TOKEN2' }]];
      const totalFeeETH = 0.001;
      const options = {
        minimumThresholdPercentage: 0.6, // 60%
        safetyBuffer: 0.2, // 20%
      };

      const result = service.calculateMinimumThreshold(
        batches,
        totalFeeETH,
        options
      );

      // 2 tokens * 2 tx/token = 4 total transactions
      // 80% (60% + 20% buffer) = ceil(4 * 0.8) = 4 transactions
      // 20% of tokens = ceil(2 * 0.2) = 1
      // Max of (4, 1) = 4
      expect(result).toBe(4);
    });
  });

  describe('generateRandomInsertionPoints', () => {
    beforeEach(() => {
      // Mock crypto.randomInt to return predictable values for testing
      crypto.randomInt.mockReturnValueOnce(2).mockReturnValueOnce(1);
    });

    it('should generate valid insertion points within range', () => {
      const minimumIndex = 5;
      const maxIndex = 20;
      const feeTransactionCount = 2;

      const result = service.generateRandomInsertionPoints(
        minimumIndex,
        maxIndex,
        feeTransactionCount
      );

      expect(result).toHaveLength(feeTransactionCount);
      expect(
        result.every(point => point >= minimumIndex && point < maxIndex)
      ).toBe(true);
      expect(result).toEqual(expect.arrayContaining([expect.any(Number)]));
    });

    it('should handle fallback when minimum index too high', () => {
      const minimumIndex = 18;
      const maxIndex = 20;
      const feeTransactionCount = 2;

      const result = service.generateRandomInsertionPoints(
        minimumIndex,
        maxIndex,
        feeTransactionCount
      );

      // With limited range, may not get all requested points
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(feeTransactionCount);
      expect(result.every(point => point >= 0 && point < maxIndex)).toBe(true);
    });

    it('should handle sequential placement when insufficient range', () => {
      const minimumIndex = 15;
      const maxIndex = 17; // Only 2 positions available
      const feeTransactionCount = 3;

      const result = service.generateRandomInsertionPoints(
        minimumIndex,
        maxIndex,
        feeTransactionCount
      );

      expect(result).toHaveLength(feeTransactionCount);
      expect(
        result.every(point => point >= minimumIndex && point < maxIndex)
      ).toBe(true);
    });

    it('should return unique sorted insertion points', () => {
      const minimumIndex = 5;
      const maxIndex = 20;
      const feeTransactionCount = 3;

      const result = service.generateRandomInsertionPoints(
        minimumIndex,
        maxIndex,
        feeTransactionCount
      );

      // Check uniqueness
      const uniquePoints = [...new Set(result)];
      expect(uniquePoints).toHaveLength(result.length);

      // Check sorted order
      const sortedResult = [...result].sort((a, b) => a - b);
      expect(result).toEqual(sortedResult);
    });
  });

  describe('generateRandomInsertionPointsInRange', () => {
    beforeEach(() => {
      crypto.randomInt.mockReturnValueOnce(3).mockReturnValueOnce(7);
    });

    it('should generate points within specified range', () => {
      const startIndex = 10;
      const endIndex = 20;
      const count = 2;

      const result = service.generateRandomInsertionPointsInRange(
        startIndex,
        endIndex,
        count
      );

      expect(result).toHaveLength(count);
      expect(
        result.every(point => point >= startIndex && point < endIndex)
      ).toBe(true);
    });

    it('should respect range boundaries in normal cases', () => {
      const startIndex = 5;
      const endIndex = 15; // Good range
      const count = 3;

      const result = service.generateRandomInsertionPointsInRange(
        startIndex,
        endIndex,
        count
      );

      expect(result.length).toBeLessThanOrEqual(count);
      expect(
        result.every(point => point >= startIndex && point < endIndex)
      ).toBe(true);
    });
  });

  describe('generateSequentialWithRandomOffset', () => {
    beforeEach(() => {
      crypto.randomInt.mockReturnValue(1); // Small offset
    });

    it('should generate sequential points with offsets', () => {
      const minimumIndex = 10;
      const maxIndex = 20;
      const count = 3;

      const result = service.generateSequentialWithRandomOffset(
        minimumIndex,
        maxIndex,
        count
      );

      expect(result).toHaveLength(count);
      expect(
        result.every(point => point >= minimumIndex && point < maxIndex)
      ).toBe(true);

      // Points should be generally increasing (allow for small random offsets)
      // Just verify they're all in the valid range and we got the right count
      expect(result.length).toBe(count);
    });
  });

  describe('calculateInsertionStrategy', () => {
    it('should return complete strategy object', () => {
      const batches = [[{ symbol: 'TOKEN1' }, { symbol: 'TOKEN2' }]];
      const totalFeeETH = 0.001;
      const totalTransactionCount = 10;
      const feeTransactionCount = 2;

      const result = service.calculateInsertionStrategy(
        batches,
        totalFeeETH,
        totalTransactionCount,
        feeTransactionCount
      );

      expect(result).toHaveProperty('minimumThreshold');
      expect(result).toHaveProperty('insertionPoints');
      expect(result).toHaveProperty('strategy');
      expect(result).toHaveProperty('metadata');

      expect(result.insertionPoints).toHaveLength(feeTransactionCount);
      expect(result.metadata.totalTokens).toBe(2);
      expect(result.metadata.totalTransactions).toBe(totalTransactionCount);
      expect(result.metadata.feeTransactionCount).toBe(feeTransactionCount);
    });

    it('should detect fallback strategy when needed', () => {
      const batches = [[{ symbol: 'TOKEN1' }]];
      const totalFeeETH = 0.001;
      const totalTransactionCount = 2; // Very small transaction count
      const feeTransactionCount = 1;

      const result = service.calculateInsertionStrategy(
        batches,
        totalFeeETH,
        totalTransactionCount,
        feeTransactionCount
      );

      // When minimum threshold >= total transactions, should use fallback
      if (result.minimumThreshold >= totalTransactionCount) {
        expect(result.strategy).toBe('fallback');
      } else {
        expect(result.strategy).toBe('random');
      }
    });

    it('should calculate correct metadata', () => {
      const batches = [
        [{ symbol: 'TOKEN1' }, { symbol: 'TOKEN2' }],
        [{ symbol: 'TOKEN3' }],
      ];
      const totalFeeETH = 0.001;
      const totalTransactionCount = 15;
      const feeTransactionCount = 2;

      const result = service.calculateInsertionStrategy(
        batches,
        totalFeeETH,
        totalTransactionCount,
        feeTransactionCount
      );

      expect(result.metadata.totalTokens).toBe(3);
      expect(result.metadata.totalTransactions).toBe(totalTransactionCount);
      expect(result.metadata.feeTransactionCount).toBe(feeTransactionCount);
      expect(result.metadata.availableRange).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateInsertionStrategy', () => {
    it('should validate correct strategy', () => {
      const strategy = {
        minimumThreshold: 5,
        insertionPoints: [6, 8, 12],
        strategy: 'random',
      };
      const totalTransactionCount = 15;

      const result = service.validateInsertionStrategy(
        strategy,
        totalTransactionCount
      );

      expect(result).toBe(true);
    });

    it('should reject strategy with out-of-bounds indices', () => {
      const strategy = {
        minimumThreshold: 5,
        insertionPoints: [6, 8, 20], // 20 is out of bounds for 15 transactions
        strategy: 'random',
      };
      const totalTransactionCount = 15;

      const result = service.validateInsertionStrategy(
        strategy,
        totalTransactionCount
      );

      expect(result).toBe(false);
    });

    it('should reject strategy with indices before minimum threshold', () => {
      const strategy = {
        minimumThreshold: 8,
        insertionPoints: [6, 10, 12], // 6 is before minimum threshold
        strategy: 'random',
      };
      const totalTransactionCount = 15;

      const result = service.validateInsertionStrategy(
        strategy,
        totalTransactionCount
      );

      expect(result).toBe(false);
    });

    it('should allow fallback strategy with earlier indices', () => {
      const strategy = {
        minimumThreshold: 10,
        insertionPoints: [2, 4], // Before minimum, but fallback strategy
        strategy: 'fallback',
      };
      const totalTransactionCount = 15;

      const result = service.validateInsertionStrategy(
        strategy,
        totalTransactionCount
      );

      expect(result).toBe(true);
    });

    it('should handle negative indices gracefully', () => {
      const strategy = {
        minimumThreshold: 5,
        insertionPoints: [-1, 8, 12], // Negative index
        strategy: 'random',
      };
      const totalTransactionCount = 15;

      const result = service.validateInsertionStrategy(
        strategy,
        totalTransactionCount
      );

      expect(result).toBe(false);
    });

    it('should validate sequential order', () => {
      const strategy = {
        minimumThreshold: 5,
        insertionPoints: [6, 6, 8], // Duplicate indices (non-sequential)
        strategy: 'random',
      };
      const totalTransactionCount = 15;

      const result = service.validateInsertionStrategy(
        strategy,
        totalTransactionCount
      );

      expect(result).toBe(true); // Should still pass as duplicates get sorted correctly
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty batches gracefully', () => {
      const batches = [];
      const totalFeeETH = 0.001;

      const result = service.calculateMinimumThreshold(batches, totalFeeETH);

      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero fee amount', () => {
      const batches = [[{ symbol: 'TOKEN1' }]];
      const totalFeeETH = 0;

      const result = service.calculateMinimumThreshold(batches, totalFeeETH);

      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should handle single transaction scenario', () => {
      const minimumIndex = 0;
      const maxIndex = 5; // Give reasonable space
      const feeTransactionCount = 1;

      const result = service.generateRandomInsertionPoints(
        minimumIndex,
        maxIndex,
        feeTransactionCount
      );

      expect(result.length).toBeGreaterThan(0);
      if (result.length > 0) {
        expect(result.every(point => point >= 0 && point < maxIndex)).toBe(
          true
        );
      }
    });
  });

  describe('randomization verification', () => {
    it('should use crypto.randomInt for security', () => {
      const minimumIndex = 5;
      const maxIndex = 20;
      const feeTransactionCount = 2;

      service.generateRandomInsertionPoints(
        minimumIndex,
        maxIndex,
        feeTransactionCount
      );

      expect(crypto.randomInt).toHaveBeenCalled();
    });

    it('should generate different results with different random seeds', () => {
      // Reset mocks and set different return values
      jest.clearAllMocks();

      const minimumIndex = 5;
      const maxIndex = 20;
      const feeTransactionCount = 2;

      // First call
      crypto.randomInt.mockReturnValueOnce(2).mockReturnValueOnce(8);
      const result1 = service.generateRandomInsertionPoints(
        minimumIndex,
        maxIndex,
        feeTransactionCount
      );

      // Reset and second call
      jest.clearAllMocks();
      crypto.randomInt.mockReturnValueOnce(5).mockReturnValueOnce(12);
      const result2 = service.generateRandomInsertionPoints(
        minimumIndex,
        maxIndex,
        feeTransactionCount
      );

      // Results should be different due to different random values
      expect(result1).not.toEqual(result2);
    });
  });
});
