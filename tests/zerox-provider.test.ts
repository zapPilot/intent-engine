import { zeroXProvider } from '../src/integrations/swap-providers/ZeroXProvider';
import { QuoteRequest } from '../src/types';

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
  })),
}));

describe('ZeroXProvider', () => {
  const mockAxiosInstance = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (zeroXProvider as any).client = mockAxiosInstance;
  });

  describe('isChainSupported', () => {
    it('should return true for supported chains', () => {
      expect(zeroXProvider.isChainSupported(1)).toBe(true); // Ethereum
      expect(zeroXProvider.isChainSupported(137)).toBe(true); // Polygon
      expect(zeroXProvider.isChainSupported(42161)).toBe(true); // Arbitrum
      expect(zeroXProvider.isChainSupported(8453)).toBe(true); // Base
    });

    it('should return false for unsupported chains', () => {
      expect(zeroXProvider.isChainSupported(999)).toBe(false);
      expect(zeroXProvider.isChainSupported(2)).toBe(false);
    });
  });

  describe('getQuote', () => {
    it('should return route info for valid quote request', async () => {
      const mockResponse = {
        data: {
          buyAmount: '1000000',
          sellAmount: '1000000000000000000',
          allowanceTarget: '0x123',
          to: '0x456',
          data: '0x789',
          value: '0',
          gasPrice: '20000000000',
          gas: '150000',
          estimatedGas: '140000',
          protocolFee: '1000',
          minimumProtocolFee: '500',
          buyTokenToEthRate: '0.001',
          sellTokenToEthRate: '1.0',
          estimatedPriceImpact: '0.05',
          sources: [
            { name: 'Uniswap_V3', proportion: '0.8' },
            { name: 'SushiSwap', proportion: '0.2' },
          ],
          transaction: {
            to: '0x456',
            data: '0x789',
            value: '0',
            gas: '150000',
            gasPrice: '20000000000',
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const params = {
        chainId: 1,
        sellToken: '0xA0b86a33E6417C83b20B44eb26a3f1b1B3b02b7B',
        buyToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        sellAmount: '1000000000000000000',
        slippageBps: 100,
        taker: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
      };

      const result = await zeroXProvider.getQuote(params);

      expect(result.provider).toBe('0x');
      expect(result.amountIn).toBe('1000000000000000000');
      expect(result.amountOut).toBe('1000000');
      expect(result.gasEstimate).toBe('140000');
      expect(result.priceImpact).toBe('0.05');
      expect(result.metadata?.protocolFee).toBe('1000');
      expect(result.metadata?.sources).toHaveLength(2);
    });

    it('should throw error when quote request fails', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API Error'));

      const params = {
        chainId: 1,
        sellToken: '0xA0b86a33E6417C83b20B44eb26a3f1b1B3b02b7B',
        buyToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        sellAmount: '1000000000000000000',
        slippageBps: 100,
        taker: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
      };

      await expect(zeroXProvider.getQuote(params)).rejects.toThrow('0x quote failed');
    });
  });

  describe('getSwapTransaction', () => {
    it('should return transaction data for valid swap request', async () => {
      const mockResponse = {
        data: {
          transaction: {
            to: '0x456',
            data: '0x789',
            value: '0',
            gas: '150000',
            gasPrice: '20000000000',
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const params = {
        chainId: 1,
        sellToken: '0xA0b86a33E6417C83b20B44eb26a3f1b1B3b02b7B',
        buyToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        sellAmount: '1000000000000000000',
        slippageBps: 100,
        taker: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
      };

      const result = await zeroXProvider.getSwapTransaction(params);

      expect(result.to).toBe('0x456');
      expect(result.data).toBe('0x789');
      expect(result.gasLimit).toBe('150000');
    });
  });

  describe('getQuotes', () => {
    it('should return quotes for valid request', async () => {
      const mockResponse = {
        data: {
          buyAmount: '1000000',
          sellAmount: '1000000000000000000',
          allowanceTarget: '0x123',
          to: '0x456',
          data: '0x789',
          value: '0',
          gasPrice: '20000000000',
          gas: '150000',
          estimatedGas: '140000',
          protocolFee: '1000',
          minimumProtocolFee: '500',
          buyTokenToEthRate: '0.001',
          sellTokenToEthRate: '1.0',
          estimatedPriceImpact: '0.05',
          sources: [{ name: 'Uniswap_V3', proportion: '1.0' }],
          transaction: {
            to: '0x456',
            data: '0x789',
            value: '0',
            gas: '150000',
            gasPrice: '20000000000',
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const request: QuoteRequest = {
        action: 'swap',
        amount: '1000000000000000000',
        fromToken: '0xA0b86a33E6417C83b20B44eb26a3f1b1B3b02b7B',
        toToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        chainId: 1,
      };

      const quotes = await zeroXProvider.getQuotes(request);

      expect(quotes).toHaveLength(1);
      expect(quotes[0]?.provider).toBe('0x');
    });

    it('should return empty array when chain not supported', async () => {
      const request: QuoteRequest = {
        action: 'swap',
        amount: '1000000000000000000',
        fromToken: '0xA0b86a33E6417C83b20B44eb26a3f1b1B3b02b7B',
        toToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        chainId: 999, // Unsupported chain
      };

      const quotes = await zeroXProvider.getQuotes(request);

      expect(quotes).toHaveLength(0);
    });

    it('should return empty array when quote fails', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API Error'));

      const request: QuoteRequest = {
        action: 'swap',
        amount: '1000000000000000000',
        fromToken: '0xA0b86a33E6417C83b20B44eb26a3f1b1B3b02b7B',
        toToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        chainId: 1,
      };

      const quotes = await zeroXProvider.getQuotes(request);

      expect(quotes).toHaveLength(0);
    });
  });

  describe('getAllowanceTarget', () => {
    it('should return allowance target for valid chain', async () => {
      const mockResponse = {
        data: {
          allowanceTarget: '0x123456789',
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const target = await zeroXProvider.getAllowanceTarget(1);

      expect(target).toBe('0x123456789');
    });

    it('should return fallback address when request fails', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API Error'));

      const target = await zeroXProvider.getAllowanceTarget(1);

      expect(target).toBe('0x0000000000000000000000000000000000000000');
    });
  });

  describe('healthCheck', () => {
    it('should return true when API is healthy', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ status: 200 });

      const isHealthy = await zeroXProvider.healthCheck();

      expect(isHealthy).toBe(true);
    });

    it('should return false when API is unhealthy', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API Error'));

      const isHealthy = await zeroXProvider.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });

  describe('getGasPrice', () => {
    it('should return gas price for valid chain', async () => {
      const mockResponse = {
        data: {
          gasPrice: '25000000000',
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const gasPrice = await zeroXProvider.getGasPrice(1);

      expect(gasPrice).toBe('25000000000');
    });

    it('should return fallback gas price when request fails', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API Error'));

      const gasPrice = await zeroXProvider.getGasPrice(1);

      expect(gasPrice).toBe('20000000000'); // 20 Gwei fallback
    });
  });

  describe('getSupportedSources', () => {
    it('should return supported sources', async () => {
      const mockResponse = {
        data: {
          sources: [
            { name: 'Uniswap_V3' },
            { name: 'SushiSwap' },
            { name: 'Curve' },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const sources = await zeroXProvider.getSupportedSources();

      expect(sources).toEqual(['Uniswap_V3', 'SushiSwap', 'Curve']);
    });

    it('should return empty array when request fails', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API Error'));

      const sources = await zeroXProvider.getSupportedSources();

      expect(sources).toEqual([]);
    });
  });
});