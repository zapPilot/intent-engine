/**
 * Balance Validator Unit Tests
 */

const {
  handleValidationErrors,
  SUPPORTED_CHAINS,
  SUPPORTED_CHAIN_IDS,
  isValidAddress,
  areValidAddresses,
} = require('../../src/validators/balanceValidator');

describe('Balance Validator', () => {
  describe('isValidAddress', () => {
    test('should return true for valid address', () => {
      expect(isValidAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe(
        true
      );
    });

    test('should return false for invalid address', () => {
      expect(isValidAddress('0xinvalid')).toBe(false);
      expect(isValidAddress('not-an-address')).toBe(false);
      expect(isValidAddress('')).toBe(false);
      expect(isValidAddress(null)).toBe(false);
    });
  });

  describe('areValidAddresses', () => {
    test('should return true for valid comma-separated addresses', () => {
      expect(
        areValidAddresses(
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,0xdAC17F958D2ee523a2206206994597C13D831ec7'
        )
      ).toBe(true);
    });

    test('should return true for empty string (optional)', () => {
      expect(areValidAddresses('')).toBe(true);
      expect(areValidAddresses(null)).toBe(true);
    });

    test('should return false for invalid address in list', () => {
      expect(
        areValidAddresses(
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,0xinvalid'
        )
      ).toBe(false);
    });

    test('should return false for more than 50 addresses', () => {
      const addresses = Array(51)
        .fill('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
        .join(',');
      expect(areValidAddresses(addresses)).toBe(false);
    });
  });

  describe('SUPPORTED_CHAINS', () => {
    test('should contain expected chains', () => {
      expect(SUPPORTED_CHAINS).toHaveProperty('1');
      expect(SUPPORTED_CHAINS).toHaveProperty('137');
      expect(SUPPORTED_CHAINS).toHaveProperty('42161');
      expect(SUPPORTED_CHAINS).toHaveProperty('8453');
      expect(SUPPORTED_CHAINS).toHaveProperty('10');
    });
  });

  describe('SUPPORTED_CHAIN_IDS', () => {
    test('should be array of numbers', () => {
      expect(Array.isArray(SUPPORTED_CHAIN_IDS)).toBe(true);
      expect(SUPPORTED_CHAIN_IDS.every(id => typeof id === 'number')).toBe(
        true
      );
      expect(SUPPORTED_CHAIN_IDS).toContain(1);
      expect(SUPPORTED_CHAIN_IDS).toContain(137);
    });
  });

  describe('handleValidationErrors', () => {
    test('should call next() when no errors', () => {
      const req = {};
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      // Mock validationResult to return no errors
      jest.mock('express-validator', () => ({
        validationResult: jest.fn(() => ({ isEmpty: () => true })),
      }));

      handleValidationErrors(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
