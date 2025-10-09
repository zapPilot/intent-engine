/**
 * UnifiedZapValidator - Comprehensive validation tests
 */

const UnifiedZapValidator = require('../../src/validators/UnifiedZapValidator');
const UNIFIED_ZAP_CONFIG = require('../../src/config/unifiedZapConfig');

describe('UnifiedZapValidator', () => {
  describe('validateInputToken', () => {
    describe('Native token identifiers', () => {
      it('should accept "native" keyword', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken('native');
        }).not.toThrow();
      });

      it('should accept "native" keyword (case insensitive)', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken('NATIVE');
        }).not.toThrow();

        expect(() => {
          UnifiedZapValidator.validateInputToken('Native');
        }).not.toThrow();

        expect(() => {
          UnifiedZapValidator.validateInputToken('NaTiVe');
        }).not.toThrow();
      });

      it('should accept zero address (0x0000...)', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken(
            '0x0000000000000000000000000000000000000000'
          );
        }).not.toThrow();
      });

      it('should accept zero address (case insensitive)', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken(
            '0X0000000000000000000000000000000000000000'
          );
        }).not.toThrow();
      });

      it('should accept sentinel address (0xeeee...)', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken(
            '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
          );
        }).not.toThrow();
      });

      it('should accept sentinel address (case insensitive)', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken(
            '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE'
          );
        }).not.toThrow();

        expect(() => {
          UnifiedZapValidator.validateInputToken(
            '0xEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEe'
          );
        }).not.toThrow();
      });
    });

    describe('Valid ERC20 addresses', () => {
      it('should accept valid USDC address', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken(
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
          );
        }).not.toThrow();
      });

      it('should accept valid WETH address', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken(
            '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
          );
        }).not.toThrow();
      });

      it('should accept address with lowercase hex', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken(
            '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
          );
        }).not.toThrow();
      });

      it('should accept address with uppercase hex', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken(
            '0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48'
          );
        }).not.toThrow();
      });
    });

    describe('Invalid inputs', () => {
      it('should throw error when inputToken is missing', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken();
        }).toThrow('inputToken is required and must be a string');
      });

      it('should throw error when inputToken is null', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken(null);
        }).toThrow('inputToken is required and must be a string');
      });

      it('should throw error when inputToken is empty string', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken('');
        }).toThrow('inputToken is required and must be a string');
      });

      it('should throw error when inputToken is not a string', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken(12345);
        }).toThrow('inputToken is required and must be a string');

        expect(() => {
          UnifiedZapValidator.validateInputToken({});
        }).toThrow('inputToken is required and must be a string');

        expect(() => {
          UnifiedZapValidator.validateInputToken([]);
        }).toThrow('inputToken is required and must be a string');
      });

      it('should throw error for invalid address format', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken('invalid-address');
        }).toThrow(
          'Invalid inputToken: must be a valid Ethereum address or "native"'
        );
      });

      it('should throw error for address without 0x prefix', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken(
            'A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
          );
        }).toThrow(
          'Invalid inputToken: must be a valid Ethereum address or "native"'
        );
      });

      it('should throw error for address with wrong length', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken('0x123');
        }).toThrow(
          'Invalid inputToken: must be a valid Ethereum address or "native"'
        );

        expect(() => {
          UnifiedZapValidator.validateInputToken(
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB4812345'
          );
        }).toThrow(
          'Invalid inputToken: must be a valid Ethereum address or "native"'
        );
      });

      it('should throw error for address with invalid characters', () => {
        expect(() => {
          UnifiedZapValidator.validateInputToken(
            '0xG0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
          );
        }).toThrow(
          'Invalid inputToken: must be a valid Ethereum address or "native"'
        );
      });
    });
  });

  describe('validate - Full request validation', () => {
    const validRequest = {
      userAddress: '0x806686442aF382B627818D08dA93c96C2Fb0a981',
      chainId: 8453,
      params: {
        strategyAllocations: [
          {
            strategyId: 'stablecoin',
            percentage: 100,
          },
        ],
        inputToken: 'native',
        inputAmount: '0.002524126015179282',
        slippage: 0.5,
      },
    };

    it('should validate complete request with native token', () => {
      expect(() => {
        UnifiedZapValidator.validate(validRequest, UNIFIED_ZAP_CONFIG);
      }).not.toThrow();
    });

    it('should validate complete request with ERC20 token', () => {
      const requestWithERC20 = {
        ...validRequest,
        params: {
          ...validRequest.params,
          inputToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
        },
      };

      expect(() => {
        UnifiedZapValidator.validate(requestWithERC20, UNIFIED_ZAP_CONFIG);
      }).not.toThrow();
    });

    it('should throw error for invalid inputToken in complete request', () => {
      const invalidRequest = {
        ...validRequest,
        params: {
          ...validRequest.params,
          inputToken: 'invalid-token',
        },
      };

      expect(() => {
        UnifiedZapValidator.validate(invalidRequest, UNIFIED_ZAP_CONFIG);
      }).toThrow(
        'Invalid inputToken: must be a valid Ethereum address or "native"'
      );
    });
  });

  describe('validateInputAmount', () => {
    it('should accept valid decimal amount strings', () => {
      expect(() => {
        UnifiedZapValidator.validateInputAmount('0.002524126015179282');
      }).not.toThrow();

      expect(() => {
        UnifiedZapValidator.validateInputAmount('1.5');
      }).not.toThrow();

      expect(() => {
        UnifiedZapValidator.validateInputAmount('100');
      }).not.toThrow();
    });

    it('should throw error for invalid amount format', () => {
      expect(() => {
        UnifiedZapValidator.validateInputAmount('abc');
      }).toThrow('inputAmount must be a valid positive number string');

      expect(() => {
        UnifiedZapValidator.validateInputAmount('');
      }).toThrow('inputAmount is required');

      expect(() => {
        UnifiedZapValidator.validateInputAmount(null);
      }).toThrow('inputAmount is required');
    });

    it('should throw error for zero or negative amounts', () => {
      expect(() => {
        UnifiedZapValidator.validateInputAmount('0');
      }).toThrow('inputAmount must be greater than 0');

      expect(() => {
        UnifiedZapValidator.validateInputAmount('-1.5');
      }).toThrow('inputAmount must be a valid positive number string');
    });
  });

  describe('validateStrategyAllocations', () => {
    it('should accept valid single strategy', () => {
      expect(() => {
        UnifiedZapValidator.validateStrategyAllocations(
          [{ strategyId: 'stablecoin', percentage: 100 }],
          UNIFIED_ZAP_CONFIG
        );
      }).not.toThrow();
    });

    it('should accept valid multiple strategies', () => {
      expect(() => {
        UnifiedZapValidator.validateStrategyAllocations(
          [
            { strategyId: 'stablecoin', percentage: 50 },
            { strategyId: 'eth', percentage: 50 },
          ],
          UNIFIED_ZAP_CONFIG
        );
      }).not.toThrow();
    });

    it('should throw error for empty allocations', () => {
      expect(() => {
        UnifiedZapValidator.validateStrategyAllocations([], UNIFIED_ZAP_CONFIG);
      }).toThrow('strategyAllocations cannot be empty');
    });

    it('should throw error when percentages do not sum to 100', () => {
      expect(() => {
        UnifiedZapValidator.validateStrategyAllocations(
          [
            { strategyId: 'stablecoin', percentage: 50 },
            { strategyId: 'eth', percentage: 40 },
          ],
          UNIFIED_ZAP_CONFIG
        );
      }).toThrow('Strategy percentages must sum to 100%');
    });

    it('should throw error for unknown strategy', () => {
      expect(() => {
        UnifiedZapValidator.validateStrategyAllocations(
          [{ strategyId: 'unknown-strategy', percentage: 100 }],
          UNIFIED_ZAP_CONFIG
        );
      }).toThrow('Unknown strategy: unknown-strategy');
    });

    it('should throw error for duplicate strategies', () => {
      expect(() => {
        UnifiedZapValidator.validateStrategyAllocations(
          [
            { strategyId: 'stablecoin', percentage: 50 },
            { strategyId: 'stablecoin', percentage: 50 },
          ],
          UNIFIED_ZAP_CONFIG
        );
      }).toThrow('Duplicate strategy ID: stablecoin');
    });
  });
});
