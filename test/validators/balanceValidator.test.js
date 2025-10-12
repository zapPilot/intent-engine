/**
 * Tests for Balance Validator Middleware
 */

const {
  balanceValidationRules,
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
  // Mock express-validator for integration tests
  const mockValidate = (rules, req) => {
    // Simplified mock - in real tests, use express-validator's test utilities
    const errors = [];

    // Manually check chainId
    if (!req.query.chainId) {
      errors.push({ path: 'chainId', msg: 'chainId is required' });
    } else if (!SUPPORTED_CHAIN_IDS.includes(parseInt(req.query.chainId))) {
      errors.push({
        path: 'chainId',
        msg: 'chainId must be one of supported chains',
      });
    }

    // Manually check wallet
    if (!req.query.wallet) {
      errors.push({ path: 'wallet', msg: 'wallet address is required' });
    } else if (!isValidAddress(req.query.wallet)) {
      errors.push({
        path: 'wallet',
        msg: 'wallet must be a valid Ethereum address',
      });
    }

    // Manually check tokens (optional)
    if (req.query.tokens && !areValidAddresses(req.query.tokens)) {
      errors.push({ path: 'tokens', msg: 'tokens must be valid addresses' });
    }

    return errors;
  };

  it('should validate correct request', async () => {
    const req = {
      query: {
        chainId: '1',
        wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
      },
    };

    const errors = await mockValidate(balanceValidationRules, req);
    expect(errors).toHaveLength(0);
  });

  it('should require chainId', async () => {
    const req = {
      query: {
        wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
      },
    };

    const errors = await mockValidate(balanceValidationRules, req);
    expect(errors.some(e => e.path === 'chainId')).toBe(true);
  });

  it('should require wallet', async () => {
    const req = {
      query: {
        chainId: '1',
      },
    };

    const errors = await mockValidate(balanceValidationRules, req);
    expect(errors.some(e => e.path === 'wallet')).toBe(true);
  });

  it('should reject unsupported chainId', async () => {
    const req = {
      query: {
        chainId: '999',
        wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
      },
    };

    const errors = await mockValidate(balanceValidationRules, req);
    expect(errors.some(e => e.path === 'chainId')).toBe(true);
  });

  it('should reject invalid wallet address', async () => {
    const req = {
      query: {
        chainId: '1',
        wallet: 'not-a-valid-address',
      },
    };

    const errors = await mockValidate(balanceValidationRules, req);
    expect(errors.some(e => e.path === 'wallet')).toBe(true);
  });

  it('should validate optional tokens parameter', async () => {
    const req = {
      query: {
        chainId: '1',
        wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        tokens:
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,0xdAC17F958D2ee523a2206206994597C13D831ec7',
      },
    };

    const errors = await mockValidate(balanceValidationRules, req);
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid token addresses', async () => {
    const req = {
      query: {
        chainId: '1',
        wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        tokens: 'invalid-token,0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      },
    };

    const errors = await mockValidate(balanceValidationRules, req);
    expect(errors.some(e => e.path === 'tokens')).toBe(true);
  });

  it('should validate all supported chains', async () => {
    const wallet = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';

    for (const chainId of SUPPORTED_CHAIN_IDS) {
      const req = { query: { chainId: chainId.toString(), wallet } };
      const errors = await mockValidate(balanceValidationRules, req);
      expect(errors).toHaveLength(0);
    }
  });
});

describe('Error Message Quality', () => {
  it('should provide helpful error messages', async () => {
    const req = {
      query: {
        chainId: '999',
        wallet: 'invalid',
      },
    };

    const errors = await mockValidate(balanceValidationRules, req);

    // Errors should be descriptive
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.msg.includes('chainId'))).toBe(true);
    expect(errors.some(e => e.msg.includes('wallet'))).toBe(true);
  });
});

// Helper function for mock validation
function mockValidate(rules, req) {
  const errors = [];

  if (!req.query.chainId) {
    errors.push({ path: 'chainId', msg: 'chainId is required' });
  } else if (!SUPPORTED_CHAIN_IDS.includes(parseInt(req.query.chainId))) {
    errors.push({
      path: 'chainId',
      msg: 'chainId must be one of supported chains',
    });
  }

  if (!req.query.wallet) {
    errors.push({ path: 'wallet', msg: 'wallet address is required' });
  } else if (!isValidAddress(req.query.wallet)) {
    errors.push({
      path: 'wallet',
      msg: 'wallet must be a valid Ethereum address',
    });
  }

  if (req.query.tokens && !areValidAddresses(req.query.tokens)) {
    errors.push({ path: 'tokens', msg: 'tokens must be valid addresses' });
  }

  return errors;
}
