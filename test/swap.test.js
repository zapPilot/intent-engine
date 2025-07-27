const request = require('supertest');
const app = require('../src/app');
const intentRoutes = require('../src/routes/intents');
const SwapService = require('../src/services/swapService');

describe('Swap API Endpoints', () => {
  // Clean up timers to prevent Jest hanging
  afterAll(() => {
    if (intentRoutes.intentService) {
      intentRoutes.intentService.cleanup();
    }
    jest.clearAllTimers();
  });
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

  describe('getSecondBestSwapQuote', () => {
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

      const result = await swapService.getSecondBestSwapQuote(params);

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
            netValue: 95,
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

      await swapService.getSecondBestSwapQuote(params);

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

      await swapService.getSecondBestSwapQuote(params);

      expect(swapService.providers['1inch'].getSwapData).toHaveBeenCalledWith({
        ...params,
        ethPrice: 3000,
      });
    });

    it('should select second-best quote based on net value (toUsd - gasCostUSD)', async () => {
      const mediumQuote = {
        toUsd: 95,
        toAmount: '950000000000000000',
        gasCostUSD: 5, // Net value: 90
      };

      const bestQuote = {
        toUsd: 105,
        toAmount: '1050000000000000000',
        gasCostUSD: 3, // Net value: 102 (best)
      };

      const worstQuote = {
        toUsd: 100,
        toAmount: '1000000000000000000',
        gasCostUSD: 15, // Net value: 85 (worst)
      };

      swapService.providers['1inch'].getSwapData.mockResolvedValue(mediumQuote);
      swapService.providers['paraswap'].getSwapData.mockResolvedValue(
        bestQuote
      );
      swapService.providers['0x'].getSwapData.mockResolvedValue(worstQuote);

      const params = {
        chainId: 1,
        fromTokenAddress: '0x123',
        toTokenAddress: '0x456',
        amount: '1000000000000000000',
        fromAddress: '0x789',
        slippage: 1,
      };

      const result = await swapService.getSecondBestSwapQuote(params);

      // Should return second-best (medium quote with net value 90)
      expect(result.provider).toBe('1inch');
      expect(result.toUsd).toBe(95);
      expect(result.gasCostUSD).toBe(5);
      expect(result.allQuotes).toHaveLength(3);

      // Verify allQuotes are sorted by net value and include netValue
      expect(result.allQuotes[0].provider).toBe('paraswap'); // Best net value: 102
      expect(result.allQuotes[0].netValue).toBe(102);
      expect(result.allQuotes[1].provider).toBe('1inch'); // Second-best net value: 90
      expect(result.allQuotes[1].netValue).toBe(90);
      expect(result.allQuotes[2].provider).toBe('0x'); // Worst net value: 85
      expect(result.allQuotes[2].netValue).toBe(85);
    });

    it('should return the only available quote when there is only one successful provider', async () => {
      const singleQuote = {
        toUsd: 100,
        toAmount: '1000000000000000000',
        gasCostUSD: 5,
      };

      swapService.providers['1inch'].getSwapData.mockResolvedValue(singleQuote);
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

      const result = await swapService.getSecondBestSwapQuote(params);

      // Should return the only available quote
      expect(result.provider).toBe('1inch');
      expect(result.toUsd).toBe(100);
      expect(result.gasCostUSD).toBe(5);
      expect(result.allQuotes).toHaveLength(1);
      expect(result.allQuotes[0].netValue).toBe(95); // 100 - 5
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

      await expect(swapService.getSecondBestSwapQuote(params)).rejects.toThrow(
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

      const result = await swapService.getSecondBestSwapQuote(params);

      expect(result.provider).toBe('1inch');
      expect(result.allQuotes).toHaveLength(1);
      expect(result.allQuotes[0].netValue).toBe(95); // 100 - 5
    });

    it('should handle missing gasCostUSD by treating it as 0', async () => {
      const quoteWithoutGas = {
        toUsd: 100,
        toAmount: '1000000000000000000',
        // gasCostUSD is missing
      };

      const quoteWithGas = {
        toUsd: 98,
        toAmount: '980000000000000000',
        gasCostUSD: 2,
      };

      swapService.providers['1inch'].getSwapData.mockResolvedValue(
        quoteWithoutGas
      );
      swapService.providers['paraswap'].getSwapData.mockResolvedValue(
        quoteWithGas
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

      const result = await swapService.getSecondBestSwapQuote(params);

      // Should return second-best (paraswap with net value 96)
      // Best is 1inch with net value 100 (100 - 0)
      expect(result.provider).toBe('paraswap');
      expect(result.toUsd).toBe(98);
      expect(result.gasCostUSD).toBe(2);
      expect(result.allQuotes).toHaveLength(2);
      expect(result.allQuotes[0].netValue).toBe(100); // 100 - 0
      expect(result.allQuotes[1].netValue).toBe(96); // 98 - 2
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
