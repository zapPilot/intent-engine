const {
  filterDustTokens,
  isExcludedToken,
  isAaveToken,
  groupIntoBatches,
  calculateTotalValue,
  isValidToken,
} = require('../src/utils/dustFilters');

describe('Dust Filters', () => {
  describe('filterDustTokens', () => {
    it('should handle non-array input gracefully', () => {
      expect(filterDustTokens(null)).toEqual([]);
      expect(filterDustTokens(undefined)).toEqual([]);
      expect(filterDustTokens('invalid')).toEqual([]);
      expect(filterDustTokens({})).toEqual([]);
    });

    it('should filter out tokens with invalid price data', () => {
      const tokensWithInvalidPrice = [
        { address: '0x1', symbol: 'TOKEN1', amount: '1', price: 0 },
        { address: '0x2', symbol: 'TOKEN2', amount: '1', price: -1 },
        { address: '0x3', symbol: 'TOKEN3', amount: '1', price: null },
        { address: '0x4', symbol: 'TOKEN4', amount: '1', price: undefined },
        { address: '0x5', symbol: 'TOKEN5', amount: '1', price: 0.01 }, // Valid
      ];

      const result = filterDustTokens(tokensWithInvalidPrice, 0.005);
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('TOKEN5');
    });

    it('should filter out tokens below dust threshold', () => {
      const tokensWithLowValue = [
        { address: '0x1', symbol: 'TOKEN1', amount: '1', price: 0.001 }, // $0.001 - below
        { address: '0x2', symbol: 'TOKEN2', amount: '1', price: 0.01 }, // $0.01 - above
      ];

      const result = filterDustTokens(tokensWithLowValue, 0.005);
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('TOKEN2');
    });

    it('should exclude LP tokens', () => {
      const lpTokens = [
        { address: '0x1', symbol: 'TOKEN1-TOKEN2', amount: '1', price: 1 },
        { address: '0x2', symbol: 'TOKEN1/TOKEN2', amount: '1', price: 1 },
        { address: '0x3', symbol: 'VALIDTOKEN', amount: '1', price: 1 },
      ];

      const result = filterDustTokens(lpTokens, 0.1);
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('VALIDTOKEN');
    });

    it('should exclude stablecoins and native tokens', () => {
      const excludedTokens = [
        { address: '0x1', symbol: 'USDC', amount: '100', price: 1 },
        { address: '0x2', symbol: 'ETH', amount: '1', price: 3000 },
        { address: '0x3', symbol: 'VALIDTOKEN', amount: '1', price: 10 },
      ];

      const result = filterDustTokens(excludedTokens, 0.1);
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('VALIDTOKEN');
    });

    it('should exclude Aave tokens', () => {
      const aaveTokens = [
        { address: '0x1', symbol: 'aUSDC', amount: '100', price: 1 },
        { address: '0x2', symbol: 'variableDebtUSDC', amount: '100', price: 1 },
        { address: '0x3', symbol: 'VALIDTOKEN', amount: '1', price: 10 },
      ];

      const result = filterDustTokens(aaveTokens, 0.1);
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('VALIDTOKEN');
    });

    it('should add value property and sort by value descending', () => {
      const tokens = [
        { address: '0x1', symbol: 'TOKEN1', amount: '1', price: 10 }, // $10
        { address: '0x2', symbol: 'TOKEN2', amount: '2', price: 5 }, // $10
        { address: '0x3', symbol: 'TOKEN3', amount: '1', price: 15 }, // $15
      ];

      const result = filterDustTokens(tokens, 1);
      expect(result).toHaveLength(3);
      expect(result[0].symbol).toBe('TOKEN3'); // $15 first
      expect(result[0].value).toBe(15);
      expect(result[1].value).toBe(10); // TOKEN1 or TOKEN2
      expect(result[2].value).toBe(10);
    });

    it('should handle missing amount gracefully', () => {
      const tokensWithMissingAmount = [
        { address: '0x1', symbol: 'TOKEN1', price: 10 }, // No amount
        { address: '0x2', symbol: 'TOKEN2', amount: '0', price: 10 }, // Zero amount
        { address: '0x3', symbol: 'TOKEN3', amount: '1', price: 10 }, // Valid
      ];

      const result = filterDustTokens(tokensWithMissingAmount, 1);
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('TOKEN3');
    });
  });

  describe('isExcludedToken', () => {
    it('should handle null and undefined symbol', () => {
      expect(isExcludedToken(null)).toBe(false);
      expect(isExcludedToken(undefined)).toBe(false);
      expect(isExcludedToken('')).toBe(false);
    });

    it('should identify stablecoins', () => {
      expect(isExcludedToken('USDC')).toBe(true);
      expect(isExcludedToken('usdc')).toBe(true);
      expect(isExcludedToken('USDT')).toBe(true);
      expect(isExcludedToken('DAI')).toBe(true);
      expect(isExcludedToken('BUSD')).toBe(true);
      expect(isExcludedToken('FRAX')).toBe(true);
      expect(isExcludedToken('LUSD')).toBe(true);
    });

    it('should identify native tokens', () => {
      expect(isExcludedToken('ETH')).toBe(true);
      expect(isExcludedToken('WETH')).toBe(true);
      expect(isExcludedToken('BNB')).toBe(true);
      expect(isExcludedToken('MATIC')).toBe(true);
      expect(isExcludedToken('AVAX')).toBe(true);
    });

    it('should identify specific exclusions', () => {
      expect(isExcludedToken('ALP')).toBe(true);
    });

    it('should not exclude valid tokens', () => {
      expect(isExcludedToken('LINK')).toBe(false);
      expect(isExcludedToken('UNI')).toBe(false);
      expect(isExcludedToken('COMP')).toBe(false);
    });
  });

  describe('isAaveToken', () => {
    it('should handle null and undefined symbol', () => {
      expect(isAaveToken(null)).toBe(false);
      expect(isAaveToken(undefined)).toBe(false);
      expect(isAaveToken('')).toBe(false);
    });

    it('should identify aTokens', () => {
      expect(isAaveToken('aUSDC')).toBe(true);
      expect(isAaveToken('aETH')).toBe(true);
      expect(isAaveToken('aDAI')).toBe(true);
      expect(isAaveToken('aLINK')).toBe(true);
    });

    it('should identify variable debt tokens', () => {
      expect(isAaveToken('variableDebtUSDC')).toBe(true);
      expect(isAaveToken('variableDebtETH')).toBe(true);
    });

    it('should identify stable debt tokens', () => {
      expect(isAaveToken('stableDebtUSDC')).toBe(true);
      expect(isAaveToken('stableDebtETH')).toBe(true);
    });

    it('should not identify regular tokens', () => {
      expect(isAaveToken('USDC')).toBe(false);
      expect(isAaveToken('ETH')).toBe(false);
      expect(isAaveToken('LINK')).toBe(false);
      expect(isAaveToken('randomToken')).toBe(false);
    });
  });

  describe('groupIntoBatches', () => {
    it('should group tokens into batches of specified size', () => {
      const tokens = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      const batches = groupIntoBatches(tokens, 10);

      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(10);
      expect(batches[1]).toHaveLength(10);
      expect(batches[2]).toHaveLength(5);
    });

    it('should handle empty array', () => {
      const batches = groupIntoBatches([], 10);
      expect(batches).toEqual([]);
    });

    it('should handle single token', () => {
      const tokens = [{ id: 1 }];
      const batches = groupIntoBatches(tokens, 10);

      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(1);
    });

    it('should use default batch size of 10', () => {
      const tokens = Array.from({ length: 15 }, (_, i) => ({ id: i }));
      const batches = groupIntoBatches(tokens);

      expect(batches).toHaveLength(2);
      expect(batches[0]).toHaveLength(10);
      expect(batches[1]).toHaveLength(5);
    });
  });

  describe('calculateTotalValue', () => {
    it('should calculate total value correctly', () => {
      const tokens = [{ value: 10.5 }, { value: 20.25 }, { value: 15.75 }];

      const total = calculateTotalValue(tokens);
      expect(total).toBeCloseTo(46.5, 2);
    });

    it('should handle tokens without value property', () => {
      const tokens = [
        { value: 10 },
        { symbol: 'TOKEN' }, // No value property
        { value: 20 },
      ];

      const total = calculateTotalValue(tokens);
      expect(total).toBe(30);
    });

    it('should handle empty array', () => {
      const total = calculateTotalValue([]);
      expect(total).toBe(0);
    });

    it('should handle tokens with zero values', () => {
      const tokens = [{ value: 0 }, { value: 10 }, { value: 0 }];

      const total = calculateTotalValue(tokens);
      expect(total).toBe(10);
    });
  });

  describe('isValidToken', () => {
    it('should validate complete token object', () => {
      const validToken = {
        address: '0x123',
        symbol: 'TOKEN',
        amount: '1000',
        price: 1.5,
      };

      expect(isValidToken(validToken)).toBe(true);
    });

    it('should reject null or undefined token', () => {
      expect(isValidToken(null)).toBeFalsy();
      expect(isValidToken(undefined)).toBeFalsy();
    });

    it('should reject token with missing address', () => {
      const token = {
        symbol: 'TOKEN',
        amount: '1000',
        price: 1.5,
      };

      expect(isValidToken(token)).toBe(false);
    });

    it('should reject token with missing symbol', () => {
      const token = {
        address: '0x123',
        amount: '1000',
        price: 1.5,
      };

      expect(isValidToken(token)).toBe(false);
    });

    it('should reject token with missing amount', () => {
      const token = {
        address: '0x123',
        symbol: 'TOKEN',
        price: 1.5,
      };

      expect(isValidToken(token)).toBe(false);
    });

    it('should reject token with missing price', () => {
      const token = {
        address: '0x123',
        symbol: 'TOKEN',
        amount: '1000',
      };

      expect(isValidToken(token)).toBe(false);
    });

    it('should accept zero amount and price', () => {
      const token = {
        address: '0x123',
        symbol: 'TOKEN',
        amount: 0,
        price: 0,
      };

      expect(isValidToken(token)).toBe(true);
    });

    it('should reject non-string address and symbol', () => {
      const tokenWithNonStringFields = {
        address: 123,
        symbol: 456,
        amount: '1000',
        price: 1.5,
      };

      expect(isValidToken(tokenWithNonStringFields)).toBe(false);
    });
  });
});
