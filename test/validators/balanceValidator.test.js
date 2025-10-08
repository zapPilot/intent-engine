/**
 * Balance Validator Unit Tests
 */

const {
  balanceValidationRules,
  handleValidationErrors,
  SUPPORTED_CHAINS,
  SUPPORTED_CHAIN_IDS,
  isValidAddress,
  areValidAddresses,
} = require('../../src/validators/balanceValidator');

describe('Balance Validator', () => {
  describe('isValidAddress', () => {
    test('should return true for valid address', () => {
      expect(isValidAddress('0x742d35cc6634c0532925a3b844bc9e7595f0beb')).toBe(true);
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
      expect(areValidAddresses('0x742d35cc6634c0532925a3b844bc9e7595f0beb,0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')).toBe(true);
    });

    test('should return true for empty string (optional)', () => {
      expect(areValidAddresses('')).toBe(true);
      expect(areValidAddresses(null)).toBe(true);
    });

    test('should return false for invalid address in list', () => {
      expect(areValidAddresses('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb,0xinvalid')).toBe(false);
    });

    test('should return false for more than 50 addresses', () => {
      const addresses = Array(51).fill('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb').join(',');
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
      expect(SUPPORTED_CHAIN_IDS.every(id => typeof id === 'number')).toBe(true);
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
