const DustZapIntentHandler = require('../src/intents/DustZapIntentHandler');
const DUST_ZAP_CONFIG = require('../src/config/dustZapConfig');

// Mock services
const mockSwapService = {};
const mockPriceService = {};
const mockRebalanceClient = {};

describe('DustZapIntentHandler Validation', () => {
  let handler;

  beforeEach(() => {
    handler = new DustZapIntentHandler(
      mockSwapService,
      mockPriceService,
      mockRebalanceClient
    );
  });

  describe('toTokenAddress validation', () => {
    it('should throw error when toTokenAddress is missing', () => {
      const request = {
        userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        chainId: 1,
        params: {
          toTokenDecimals: 18,
          slippage: 0.5,
        },
      };

      expect(() => handler.validate(request)).toThrow(
        DUST_ZAP_CONFIG.ERRORS.MISSING_TO_TOKEN_ADDRESS
      );
    });

    it('should throw error when toTokenAddress is null', () => {
      const request = {
        userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        chainId: 1,
        params: {
          toTokenAddress: null,
          toTokenDecimals: 18,
          slippage: 0.5,
        },
      };

      expect(() => handler.validate(request)).toThrow(
        DUST_ZAP_CONFIG.ERRORS.MISSING_TO_TOKEN_ADDRESS
      );
    });

    it('should throw error when toTokenAddress is invalid', () => {
      const request = {
        userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        chainId: 1,
        params: {
          toTokenAddress: 'invalid-address',
          toTokenDecimals: 18,
          slippage: 0.5,
        },
      };

      expect(() => handler.validate(request)).toThrow(
        DUST_ZAP_CONFIG.ERRORS.INVALID_TO_TOKEN_ADDRESS
      );
    });

    it('should pass validation with valid toTokenAddress', () => {
      const request = {
        userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        chainId: 1,
        params: {
          toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          toTokenDecimals: 18,
          slippage: 0.5,
        },
      };

      expect(() => handler.validate(request)).not.toThrow();
    });
  });

  describe('toTokenDecimals validation', () => {
    it('should throw error when toTokenDecimals is missing', () => {
      const request = {
        userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        chainId: 1,
        params: {
          toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          slippage: 0.5,
        },
      };

      expect(() => handler.validate(request)).toThrow(
        DUST_ZAP_CONFIG.ERRORS.MISSING_TO_TOKEN_DECIMALS
      );
    });

    it('should throw error when toTokenDecimals is null', () => {
      const request = {
        userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        chainId: 1,
        params: {
          toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          toTokenDecimals: null,
          slippage: 0.5,
        },
      };

      expect(() => handler.validate(request)).toThrow(
        DUST_ZAP_CONFIG.ERRORS.MISSING_TO_TOKEN_DECIMALS
      );
    });

    it('should throw error when toTokenDecimals is not an integer', () => {
      const request = {
        userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        chainId: 1,
        params: {
          toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          toTokenDecimals: 18.5,
          slippage: 0.5,
        },
      };

      expect(() => handler.validate(request)).toThrow(
        DUST_ZAP_CONFIG.ERRORS.INVALID_TO_TOKEN_DECIMALS
      );
    });

    it('should throw error when toTokenDecimals is zero or negative', () => {
      const request = {
        userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        chainId: 1,
        params: {
          toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          toTokenDecimals: 0,
          slippage: 0.5,
        },
      };

      expect(() => handler.validate(request)).toThrow(
        DUST_ZAP_CONFIG.ERRORS.INVALID_TO_TOKEN_DECIMALS
      );
    });

    it('should pass validation with valid toTokenDecimals', () => {
      const request = {
        userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        chainId: 1,
        params: {
          toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          toTokenDecimals: 18,
          slippage: 0.5,
        },
      };

      expect(() => handler.validate(request)).not.toThrow();
    });
  });
});
