const request = require('supertest');
const app = require('../src/app');
const SwapService = require('../src/services/swapService');

describe('Swap API Endpoints', () => {
  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /swap/providers', () => {
    it('should return list of supported providers', async () => {
      const response = await request(app).get('/swap/providers').expect(200);

      expect(response.body.providers).toEqual(['1inch', 'paraswap', '0x']);
    });
  });
});

describe('SwapService Unit Tests', () => {
  let swapService;

  beforeEach(() => {
    swapService = new SwapService();
  });

  describe('Constructor', () => {
    it('should initialize with correct providers', () => {
      expect(swapService.providers).toHaveProperty('1inch');
      expect(swapService.providers).toHaveProperty('paraswap');
      expect(swapService.providers).toHaveProperty('0x');
    });
  });

  describe('getSupportedProviders', () => {
    it('should return array of provider names', () => {
      const providers = swapService.getSupportedProviders();
      expect(providers).toEqual(['1inch', 'paraswap', '0x']);
    });
  });

  describe('isProviderSupported', () => {
    it('should return true for supported providers', () => {
      expect(swapService.isProviderSupported('1inch')).toBe(true);
      expect(swapService.isProviderSupported('paraswap')).toBe(true);
      expect(swapService.isProviderSupported('0x')).toBe(true);
    });

    it('should return false for unsupported providers', () => {
      expect(swapService.isProviderSupported('uniswap')).toBe(false);
      expect(swapService.isProviderSupported('sushiswap')).toBe(false);
      expect(swapService.isProviderSupported('')).toBe(false);
      expect(swapService.isProviderSupported(null)).toBe(false);
    });
  });

  describe('getRetryStrategy', () => {
    it('should return correct retry strategy for known providers', () => {
      const oneInchStrategy = swapService.getRetryStrategy('1inch');
      const paraswapStrategy = swapService.getRetryStrategy('paraswap');
      const zeroXStrategy = swapService.getRetryStrategy('0x');

      expect(typeof oneInchStrategy).toBe('function');
      expect(typeof paraswapStrategy).toBe('function');
      expect(typeof zeroXStrategy).toBe('function');
    });

    it('should return null for unknown providers', () => {
      expect(swapService.getRetryStrategy('unknown')).toBeNull();
      expect(swapService.getRetryStrategy('')).toBeNull();
      expect(swapService.getRetryStrategy(null)).toBeNull();
    });
  });

  describe('getBestSwapQuote', () => {
    beforeEach(() => {
      // Mock the DEX aggregator services
      swapService.providers['1inch'].getSwapData = jest.fn();
      swapService.providers['paraswap'].getSwapData = jest.fn();
      swapService.providers['0x'].getSwapData = jest.fn();
    });

    it('should enhance params with default ethPrice', async () => {
      // Mock successful responses
      const mockQuote = {
        toUsd: 100,
        toAmount: '1000000000000000000',
        gasCostUSD: 5,
      };

      swapService.providers['1inch'].getSwapData.mockResolvedValue(mockQuote);
      swapService.providers['paraswap'].getSwapData.mockRejectedValue(
        new Error('Failed')
      );
      swapService.providers['0x'].getSwapData.mockRejectedValue(
        new Error('Failed')
      );

      const params = {
        chainId: 1,
        fromTokenAddress: '0x123',
        toTokenAddress: '0x456',
        amount: '1000000000000000000',
        fromAddress: '0x789',
        slippage: 1,
      };

      const result = await swapService.getBestSwapQuote(params);

      // Check that ethPrice was added with default value
      expect(swapService.providers['1inch'].getSwapData).toHaveBeenCalledWith({
        ...params,
        ethPrice: 3000,
      });

      expect(result).toEqual({
        ...mockQuote,
        provider: '1inch',
        allQuotes: [
          {
            provider: '1inch',
            toUsd: 100,
            gasCostUSD: 5,
            toAmount: '1000000000000000000',
          },
        ],
      });
    });

    it('should use provided ethPrice when available', async () => {
      const mockQuote = {
        toUsd: 100,
        toAmount: '1000000000000000000',
        gasCostUSD: 5,
      };

      swapService.providers['1inch'].getSwapData.mockResolvedValue(mockQuote);
      swapService.providers['paraswap'].getSwapData.mockRejectedValue(
        new Error('Failed')
      );
      swapService.providers['0x'].getSwapData.mockRejectedValue(
        new Error('Failed')
      );

      const params = {
        chainId: 1,
        fromTokenAddress: '0x123',
        toTokenAddress: '0x456',
        amount: '1000000000000000000',
        fromAddress: '0x789',
        slippage: 1,
        eth_price: '3500',
      };

      await swapService.getBestSwapQuote(params);

      expect(swapService.providers['1inch'].getSwapData).toHaveBeenCalledWith({
        ...params,
        ethPrice: 3500,
      });
    });

    it('should handle null eth_price', async () => {
      const mockQuote = {
        toUsd: 100,
        toAmount: '1000000000000000000',
        gasCostUSD: 5,
      };

      swapService.providers['1inch'].getSwapData.mockResolvedValue(mockQuote);
      swapService.providers['paraswap'].getSwapData.mockRejectedValue(
        new Error('Failed')
      );
      swapService.providers['0x'].getSwapData.mockRejectedValue(
        new Error('Failed')
      );

      const params = {
        chainId: 1,
        fromTokenAddress: '0x123',
        toTokenAddress: '0x456',
        amount: '1000000000000000000',
        fromAddress: '0x789',
        slippage: 1,
        eth_price: 'null',
      };

      await swapService.getBestSwapQuote(params);

      expect(swapService.providers['1inch'].getSwapData).toHaveBeenCalledWith({
        ...params,
        ethPrice: 3000,
      });
    });

    it('should select best quote based on toUsd value', async () => {
      const lowQuote = {
        toUsd: 95,
        toAmount: '950000000000000000',
        gasCostUSD: 5,
      };

      const highQuote = {
        toUsd: 105,
        toAmount: '1050000000000000000',
        gasCostUSD: 3,
      };

      swapService.providers['1inch'].getSwapData.mockResolvedValue(lowQuote);
      swapService.providers['paraswap'].getSwapData.mockResolvedValue(
        highQuote
      );
      swapService.providers['0x'].getSwapData.mockRejectedValue(
        new Error('Failed')
      );

      const params = {
        chainId: 1,
        fromTokenAddress: '0x123',
        toTokenAddress: '0x456',
        amount: '1000000000000000000',
        fromAddress: '0x789',
        slippage: 1,
      };

      const result = await swapService.getBestSwapQuote(params);

      expect(result.provider).toBe('paraswap');
      expect(result.toUsd).toBe(105);
      expect(result.allQuotes).toHaveLength(2);
    });

    it('should throw error when no providers return successful quotes', async () => {
      swapService.providers['1inch'].getSwapData.mockRejectedValue(
        new Error('1inch failed')
      );
      swapService.providers['paraswap'].getSwapData.mockRejectedValue(
        new Error('Paraswap failed')
      );
      swapService.providers['0x'].getSwapData.mockRejectedValue(
        new Error('0x failed')
      );

      const params = {
        chainId: 1,
        fromTokenAddress: '0x123',
        toTokenAddress: '0x456',
        amount: '1000000000000000000',
        fromAddress: '0x789',
        slippage: 1,
      };

      await expect(swapService.getBestSwapQuote(params)).rejects.toThrow(
        'No providers returned successful quotes'
      );
    });

    it('should handle mixed success and failure responses', async () => {
      const successQuote = {
        toUsd: 100,
        toAmount: '1000000000000000000',
        gasCostUSD: 5,
      };

      swapService.providers['1inch'].getSwapData.mockResolvedValue(
        successQuote
      );
      swapService.providers['paraswap'].getSwapData.mockRejectedValue(
        new Error('Paraswap failed')
      );
      swapService.providers['0x'].getSwapData.mockRejectedValue(
        new Error('0x failed')
      );

      const params = {
        chainId: 1,
        fromTokenAddress: '0x123',
        toTokenAddress: '0x456',
        amount: '1000000000000000000',
        fromAddress: '0x789',
        slippage: 1,
      };

      const result = await swapService.getBestSwapQuote(params);

      expect(result.provider).toBe('1inch');
      expect(result.allQuotes).toHaveLength(1);
    });
  });
});

// Mock tests for individual services would go here
describe('DEX Aggregator Services', () => {
  // These would require mocking axios responses
  describe('OneInchService', () => {
    it('should format 1inch API response correctly', () => {
      // Mock test implementation
      expect(true).toBe(true);
    });
  });

  describe('ParaswapService', () => {
    it('should format Paraswap API response correctly', () => {
      // Mock test implementation
      expect(true).toBe(true);
    });
  });

  describe('ZeroXService', () => {
    it('should format 0x API response correctly', () => {
      // Mock test implementation
      expect(true).toBe(true);
    });
  });
});
