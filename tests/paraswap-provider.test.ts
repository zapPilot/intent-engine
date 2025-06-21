import { paraswapProvider } from '../src/integrations/swap-providers/ParaswapProvider';
import { QuoteRequest } from '../src/types';

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
  })),
}));

describe('ParaswapProvider', () => {
  const mockAxiosInstance = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (paraswapProvider as any).client = mockAxiosInstance;
  });

  describe('isChainSupported', () => {
    it('should return true for supported chains', () => {
      expect(paraswapProvider.isChainSupported(1)).toBe(true); // Ethereum
      expect(paraswapProvider.isChainSupported(137)).toBe(true); // Polygon
      expect(paraswapProvider.isChainSupported(42161)).toBe(true); // Arbitrum
      expect(paraswapProvider.isChainSupported(8453)).toBe(true); // Base
    });

    it('should return false for unsupported chains', () => {
      expect(paraswapProvider.isChainSupported(999)).toBe(false);
      expect(paraswapProvider.isChainSupported(2)).toBe(false);
    });
  });

  describe('getQuote', () => {
    it('should return route info for valid quote request', async () => {
      const mockResponse = {
        data: {
          priceRoute: {
            destAmount: '1000000',
            srcAmount: '1000000000000000000',
            gasCostUSD: '5.50',
            gasCost: '50000',
            tokenTransferProxy: '0x216b4b4ba9f3e719726886d34a177484278bfcae',
            contractAddress: '0x123',
          },
          txParams: {
            to: '0x123',
            data: '0x456',
            value: '0',
            gasPrice: '20000000000',
            gas: '150000',
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const params = {
        srcToken: '0xA0b86a33E6417C83b20B44eb26a3f1b1B3b02b7B',
        srcDecimals: 18,
        destToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        destDecimals: 6,
        amount: '1000000000000000000',
        side: 'SELL' as const,
        network: 1,
        slippage: 100,
        userAddress: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
      };

      const result = await paraswapProvider.getQuote(params);

      expect(result.provider).toBe('paraswap');
      expect(result.amountIn).toBe('1000000000000000000');
      expect(result.amountOut).toBe('1000000');
      expect(result.gasEstimate).toBe('50000');
      expect(result.metadata?.gasCostUSD).toBe('5.50');
    });

    it('should throw error when quote request fails', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API Error'));

      const params = {
        srcToken: '0xA0b86a33E6417C83b20B44eb26a3f1b1B3b02b7B',
        srcDecimals: 18,
        destToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        destDecimals: 6,
        amount: '1000000000000000000',
        side: 'SELL' as const,
        network: 1,
        slippage: 100,
        userAddress: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
      };

      await expect(paraswapProvider.getQuote(params)).rejects.toThrow('Paraswap quote failed');
    });
  });

  describe('getSwapTransaction', () => {
    it('should return transaction data for valid swap request', async () => {
      const mockResponse = {
        data: {
          priceRoute: {
            destAmount: '1000000',
            srcAmount: '1000000000000000000',
            gasCostUSD: '5.50',
            gasCost: '50000',
          },
          txParams: {
            to: '0x123',
            data: '0x456',
            value: '0',
            gasPrice: '20000000000',
            gas: '150000',
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const params = {
        srcToken: '0xA0b86a33E6417C83b20B44eb26a3f1b1B3b02b7B',
        srcDecimals: 18,
        destToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        destDecimals: 6,
        amount: '1000000000000000000',
        side: 'SELL' as const,
        network: 1,
        slippage: 100,
        userAddress: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
      };

      const result = await paraswapProvider.getSwapTransaction(params);

      expect(result.to).toBe('0x123');
      expect(result.data).toBe('0x456');
      expect(result.gasLimit).toBe('150000');
    });
  });

  describe('getQuotes', () => {
    it('should return quotes for valid request', async () => {
      const mockResponse = {
        data: {
          priceRoute: {
            destAmount: '1000000',
            srcAmount: '1000000000000000000',
            gasCostUSD: '5.50',
            gasCost: '50000',
            tokenTransferProxy: '0x216b4b4ba9f3e719726886d34a177484278bfcae',
            contractAddress: '0x123',
          },
          txParams: {
            to: '0x123',
            data: '0x456',
            value: '0',
            gasPrice: '20000000000',
            gas: '150000',
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

      const quotes = await paraswapProvider.getQuotes(request);

      expect(quotes).toHaveLength(1);
      expect(quotes[0]?.provider).toBe('paraswap');
    });

    it('should return empty array when chain not supported', async () => {
      const request: QuoteRequest = {
        action: 'swap',
        amount: '1000000000000000000',
        fromToken: '0xA0b86a33E6417C83b20B44eb26a3f1b1B3b02b7B',
        toToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        chainId: 999, // Unsupported chain
      };

      const quotes = await paraswapProvider.getQuotes(request);

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

      const quotes = await paraswapProvider.getQuotes(request);

      expect(quotes).toHaveLength(0);
    });
  });

  describe('getSpenderAddress', () => {
    it('should return spender address for supported chain', () => {
      const spender = paraswapProvider.getSpenderAddress(1);
      expect(spender).toBe('0x216b4b4ba9f3e719726886d34a177484278bfcae');
    });

    it('should throw error for unsupported chain', () => {
      expect(() => paraswapProvider.getSpenderAddress(999)).toThrow(
        'Paraswap proxy not available for chain 999'
      );
    });
  });

  describe('healthCheck', () => {
    it('should return true when API is healthy', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ status: 200 });

      const isHealthy = await paraswapProvider.healthCheck();

      expect(isHealthy).toBe(true);
    });

    it('should return false when API is unhealthy', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API Error'));

      const isHealthy = await paraswapProvider.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });

  describe('getSupportedTokens', () => {
    it('should return supported tokens for valid chain', async () => {
      const mockResponse = {
        data: {
          tokens: [
            { address: '0x123' },
            { address: '0x456' },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const tokens = await paraswapProvider.getSupportedTokens(1);

      expect(tokens).toEqual(['0x123', '0x456']);
    });

    it('should return empty array when request fails', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API Error'));

      const tokens = await paraswapProvider.getSupportedTokens(1);

      expect(tokens).toEqual([]);
    });

    it('should return empty array for unsupported chain', async () => {
      const tokens = await paraswapProvider.getSupportedTokens(999);

      expect(tokens).toEqual([]);
    });
  });
});