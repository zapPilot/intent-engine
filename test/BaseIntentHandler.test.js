const BaseIntentHandler = require('../src/intents/BaseIntentHandler');

describe('BaseIntentHandler', () => {
  let handler;
  let mockSwapService;
  let mockPriceService;
  let mockRebalanceClient;

  beforeEach(() => {
    mockSwapService = { execute: jest.fn() };
    mockPriceService = { getPrice: jest.fn() };
    mockRebalanceClient = { rebalance: jest.fn() };

    handler = new BaseIntentHandler(
      mockSwapService,
      mockPriceService,
      mockRebalanceClient
    );
  });

  describe('constructor', () => {
    it('should initialize with provided services', () => {
      expect(handler.swapService).toBe(mockSwapService);
      expect(handler.priceService).toBe(mockPriceService);
      expect(handler.rebalanceClient).toBe(mockRebalanceClient);
    });
  });

  describe('execute', () => {
    it('should throw error indicating method must be implemented by subclass', () => {
      expect(() => handler.execute({})).toThrow(
        'execute() must be implemented by subclass'
      );
    });
  });

  describe('validate', () => {
    it('should throw error indicating method must be implemented by subclass', () => {
      expect(() => handler.validate({})).toThrow(
        'validate() must be implemented by subclass'
      );
    });
  });

  describe('validateCommon', () => {
    it('should validate valid userAddress and chainId', () => {
      const validRequest = {
        userAddress: '0x1234567890123456789012345678901234567890',
        chainId: 1,
      };

      expect(() => handler.validateCommon(validRequest)).not.toThrow();
    });

    it('should throw error for missing userAddress', () => {
      const request = {
        chainId: 1,
      };

      expect(() => handler.validateCommon(request)).toThrow(
        'Invalid userAddress: must be a valid Ethereum address'
      );
    });

    it('should throw error for invalid userAddress format', () => {
      const invalidAddresses = [
        '0x123', // too short
        '0x12345678901234567890123456789012345678901', // too long
        '12345678901234567890123456789012345678901', // missing 0x
        '0xGHIJKL901234567890123456789012345678901', // invalid hex
        'not-an-address',
        '',
        null,
        undefined,
      ];

      invalidAddresses.forEach(address => {
        const request = {
          userAddress: address,
          chainId: 1,
        };

        expect(() => handler.validateCommon(request)).toThrow(
          'Invalid userAddress: must be a valid Ethereum address'
        );
      });
    });

    it('should throw error for missing chainId', () => {
      const request = {
        userAddress: '0x1234567890123456789012345678901234567890',
      };

      expect(() => handler.validateCommon(request)).toThrow(
        'Invalid chainId: must be a positive integer'
      );
    });

    it('should throw error for invalid chainId', () => {
      const invalidChainIds = [
        0, // not positive
        -1, // negative
        1.5, // not integer
        '1', // string
        null,
        undefined,
        {},
        [],
      ];

      invalidChainIds.forEach(chainId => {
        const request = {
          userAddress: '0x1234567890123456789012345678901234567890',
          chainId,
        };

        expect(() => handler.validateCommon(request)).toThrow(
          'Invalid chainId: must be a positive integer'
        );
      });
    });

    it('should accept valid chainIds', () => {
      const validChainIds = [1, 42161, 8453, 137, 56, 100, 1000000];

      validChainIds.forEach(chainId => {
        const request = {
          userAddress: '0x1234567890123456789012345678901234567890',
          chainId,
        };

        expect(() => handler.validateCommon(request)).not.toThrow();
      });
    });

    it('should handle mixed case addresses', () => {
      const mixedCaseAddresses = [
        '0xAbCdEf1234567890123456789012345678901234',
        '0xABCDEF1234567890123456789012345678901234',
        '0xabcdef1234567890123456789012345678901234',
      ];

      mixedCaseAddresses.forEach(address => {
        const request = {
          userAddress: address,
          chainId: 1,
        };

        expect(() => handler.validateCommon(request)).not.toThrow();
      });
    });
  });

  describe('inheritance', () => {
    it('should allow subclasses to override execute and validate', () => {
      class TestIntentHandler extends BaseIntentHandler {
        execute(request) {
          return { success: true, request };
        }

        validate(request) {
          this.validateCommon(request);
          return true;
        }
      }

      const testHandler = new TestIntentHandler(
        mockSwapService,
        mockPriceService,
        mockRebalanceClient
      );

      const request = {
        userAddress: '0x1234567890123456789012345678901234567890',
        chainId: 1,
      };

      expect(() => testHandler.validate(request)).not.toThrow();
      expect(testHandler.execute(request)).toEqual({ success: true, request });
    });
  });
});
