const crypto = require('crypto');

const FeeCalculator = require('../../src/services/fee/FeeCalculator');

describe('FeeCalculator', () => {
  let calculator;
  let randomQueue;
  let randomSpy;

  beforeEach(() => {
    calculator = new FeeCalculator();
    randomQueue = [];
    randomSpy = jest
      .spyOn(crypto, 'randomInt')
      .mockImplementation((minOrMax, maybeMax) => {
        const hasExplicitMin = typeof maybeMax === 'number';
        const min = hasExplicitMin ? minOrMax : 0;
        const max = hasExplicitMin ? maybeMax : minOrMax;

        if (randomQueue.length === 0) {
          return min; // deterministic fallback when queue empty
        }

        const next = randomQueue.shift();
        // clamp into expected range to imitate crypto.randomInt behaviour
        return Math.min(Math.max(next, min), Math.max(min, max - 1));
      });
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  const setRandomSequence = values => {
    randomQueue = [...values];
  };

  describe('calculateMinimumThreshold', () => {
    it('uses percentage and safety buffer to compute minimum swaps', () => {
      const batches = [['a', 'b'], ['c']];
      const result = calculator.calculateMinimumThreshold(batches, 0.5, {
        minimumThresholdPercentage: 0.4,
        safetyBuffer: 0.1,
      });

      // totalTokens=3, transactions per token=2 -> 6 total
      // threshold percentage = 0.5 => ceil(6*0.5)=3
      expect(result).toBe(3);
    });

    it('honours absolute minimum even when threshold percentage is tiny', () => {
      const batches = [['only']];
      const result = calculator.calculateMinimumThreshold(batches, 0.2, {
        minimumThresholdPercentage: 0,
        safetyBuffer: 0,
      });

      // minimum threshold percentage gives 0, but absolute minimum ~20% of tokens -> 1
      expect(result).toBe(1);
    });
  });

  describe('generateRandomInsertionPoints', () => {
    it('distributes points across available range', () => {
      setRandomSequence([0, 1, 2]);
      const points = calculator.generateRandomInsertionPoints(2, 12, 3, {
        spreadFactor: 0.5,
      });

      expect(points).toEqual([2, 6, 10]);
    });

    it('falls back to end of range when minimum index exceeds max', () => {
      setRandomSequence([0, 1, 2]);
      const points = calculator.generateRandomInsertionPoints(10, 5, 2);
      // fallback range is last 3 positions -> indices 2,3,4
      expect(points).toEqual([2, 3]);
    });

    it('uses sequential with offsets when space is tight', () => {
      setRandomSequence([]);
      const points = calculator.generateRandomInsertionPoints(8, 10, 3);

      expect(points).toEqual([8, 9, 9]);
    });
  });

  describe('generateRandomInsertionPointsInRange', () => {
    it('returns unique sorted insertion points', () => {
      setRandomSequence([0, 0, 1, 2]);
      const points = calculator.generateRandomInsertionPointsInRange(5, 8, 3);

      expect(points).toEqual([5, 6, 7]);
    });
  });

  describe('generateSequentialWithRandomOffset', () => {
    it('creates sequential points with small random offsets', () => {
      setRandomSequence([0, 1, 0]);
      const points = calculator.generateSequentialWithRandomOffset(4, 10, 3);

      expect(points.every(p => p >= 4 && p < 10)).toBe(true);
      expect(points.length).toBe(3);
      expect(points).toEqual([4, 7, 8]);
    });
  });
});
