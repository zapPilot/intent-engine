/**
 * Tests for Balance Validator Middleware
 */

const balanceValidator = require('../../src/validators/balanceValidator');
const {
  validateBalanceQuery,
  SUPPORTED_CHAIN_IDS,
  SUPPORTED_CHAINS,
  isValidAddress,
  areValidAddresses,
} = require('../../src/validators/balanceValidator');

describe('Validation Helper Functions', () => {
  describe('isValidAddress', () => {
    it('should validate correct Ethereum addresses', () => {
      expect(isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0')).toBe(
        true
      );
      expect(isValidAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe(
        true
      );
    });

    it('should reject invalid addresses', () => {
      expect(isValidAddress('not-an-address')).toBe(false);
      expect(isValidAddress('0x123')).toBe(false);
      expect(isValidAddress('')).toBe(false);
      expect(isValidAddress(null)).toBe(false);
      expect(isValidAddress(undefined)).toBe(false);
    });

    it('should handle checksummed addresses', () => {
      expect(isValidAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')).toBe(
        true
      );
    });
  });

  describe('areValidAddresses', () => {
    it('should validate comma-separated addresses', () => {
      const valid =
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0,0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      expect(areValidAddresses(valid)).toBe(true);
    });

    it('should allow empty/undefined (optional field)', () => {
      expect(areValidAddresses('')).toBe(true);
      expect(areValidAddresses(null)).toBe(true);
      expect(areValidAddresses(undefined)).toBe(true);
    });

    it('should reject lists with invalid addresses', () => {
      const invalid =
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0,invalid-address';
      expect(areValidAddresses(invalid)).toBe(false);
    });

    it('should reject lists with too many addresses (>50)', () => {
      const tooMany = Array.from(
        { length: 51 },
        (_, i) => `0x${'0'.repeat(39)}${i.toString().padStart(1, '0')}`
      ).join(',');

      expect(areValidAddresses(tooMany)).toBe(false);
    });

    it('should handle whitespace in addresses', () => {
      const withSpaces =
        '  0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0  ,  0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48  ';
      expect(areValidAddresses(withSpaces)).toBe(true);
    });
  });
});

describe('Supported Chains', () => {
  it('should include major chains', () => {
    expect(SUPPORTED_CHAIN_IDS).toContain(1); // Ethereum
    expect(SUPPORTED_CHAIN_IDS).toContain(10); // Optimism
    expect(SUPPORTED_CHAIN_IDS).toContain(137); // Polygon
    expect(SUPPORTED_CHAIN_IDS).toContain(8453); // Base
    expect(SUPPORTED_CHAIN_IDS).toContain(42161); // Arbitrum
  });

  it('should have descriptive names', () => {
    expect(SUPPORTED_CHAINS[1]).toBe('Ethereum Mainnet');
    expect(SUPPORTED_CHAINS[10]).toBe('Optimism');
    expect(SUPPORTED_CHAINS[137]).toBe('Polygon');
    expect(SUPPORTED_CHAINS[8453]).toBe('Base');
    expect(SUPPORTED_CHAINS[42161]).toBe('Arbitrum One');
  });
});

describe('Balance Validator Integration', () => {
  const runValidation = query => validateBalanceQuery(query).errors;

  it('should validate correct request', () => {
    const errors = runValidation({
      chainId: '1',
      wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
    });
    expect(errors).toHaveLength(0);
  });

  it('should require chainId', () => {
    const errors = runValidation({
      wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
    });
    expect(errors.some(e => e.field === 'chainId')).toBe(true);
  });

  it('should require wallet', () => {
    const errors = runValidation({
      chainId: '1',
    });
    expect(errors.some(e => e.field === 'wallet')).toBe(true);
  });

  it('should reject unsupported chainId', () => {
    const errors = runValidation({
      chainId: '999',
      wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
    });
    expect(errors.some(e => e.field === 'chainId')).toBe(true);
  });

  it('should reject invalid wallet address', () => {
    const errors = runValidation({
      chainId: '1',
      wallet: 'not-a-valid-address',
    });
    expect(errors.some(e => e.field === 'wallet')).toBe(true);
  });

  it('should validate optional tokens parameter', () => {
    const errors = runValidation({
      chainId: '1',
      wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
      tokens:
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,0xdAC17F958D2ee523a2206206994597C13D831ec7',
    });
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid token addresses', () => {
    const errors = runValidation({
      chainId: '1',
      wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
      tokens: 'invalid-token,0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    });
    expect(errors.some(e => e.field === 'tokens')).toBe(true);
  });

  it('should integrate with middleware and sanitize values', () => {
    const req = {
      query: {
        chainId: '42161',
        wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        tokens:
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,0xdAC17F958D2ee523a2206206994597C13D831ec7',
      },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    const next = jest.fn();

    balanceValidator(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.query.chainId).toBe(42161);
    expect(req.query.wallet).toBe('0x742d35cc6634c0532925a3b844bc9e7595f0beb0');
    expect(req.query.tokensList).toEqual([
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      '0xdac17f958d2ee523a2206206994597c13d831ec7',
    ]);
  });
});

describe('Error Message Quality', () => {
  it('should provide helpful error messages', () => {
    const { errors } = validateBalanceQuery({
      chainId: '999',
      wallet: 'invalid',
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('chainId'))).toBe(true);
    expect(errors.some(e => e.message.includes('wallet'))).toBe(true);
  });
});
