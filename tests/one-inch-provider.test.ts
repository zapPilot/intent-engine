import { OneInchProvider } from '../src/integrations/swap-providers/OneInchProvider';
import { QuoteRequest } from '../src/types';

// Mock axios to avoid making real HTTP requests
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() }
    }
  }))
}));

describe('OneInchProvider', () => {
  let provider: OneInchProvider;
  let mockAxiosClient: any;

  beforeEach(() => {
    provider = new OneInchProvider('test-api-key');
    // Get the mocked axios client
    mockAxiosClient = (provider as any).client;
  });

  describe('isChainSupported', () => {
    it('should return true for supported chains', () => {
      expect(provider.isChainSupported(1)).toBe(true); // Ethereum
      expect(provider.isChainSupported(137)).toBe(true); // Polygon
      expect(provider.isChainSupported(42161)).toBe(true); // Arbitrum
      expect(provider.isChainSupported(10)).toBe(true); // Optimism
      expect(provider.isChainSupported(8453)).toBe(true); // Base
    });

    it('should return false for unsupported chains', () => {
      expect(provider.isChainSupported(999)).toBe(false);
      expect(provider.isChainSupported(9999)).toBe(false);
    });
  });

  describe('getQuote', () => {
    it('should return route info for valid quote request', async () => {
      const mockResponse = {
        data: {
          toAmount: '2000000000000000000000',
          fromAmount: '1000000000000000000',
          protocols: [[{
            name: 'UniswapV3',
            part: 100,
            fromTokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            toTokenAddress: '0xA0b86a33E6441E6b2bDB06C2A4b2d117B5Dc8F85'
          }]],
          estimatedGas: 150000
        }
      };

      mockAxiosClient.get.mockResolvedValue(mockResponse);

      const params = {
        src: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        dst: '0xA0b86a33E6441E6b2bDB06C2A4b2d117B5Dc8F85',
        amount: '1000000000000000000'
      };

      const route = await provider.getQuote(params, 1);

      expect(route).toBeDefined();
      expect(route.provider).toBe('1inch');
      expect(route.amountIn).toBe('1000000000000000000');
      expect(route.amountOut).toBe('2000000000000000000000');
      expect(route.gasEstimate).toBe('150000');
      expect(mockAxiosClient.get).toHaveBeenCalledWith('/swap/v6.0/1/quote', { params });
    });

    it('should throw error when quote request fails', async () => {
      mockAxiosClient.get.mockRejectedValue(new Error('API Error'));

      const params = {
        src: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        dst: '0xA0b86a33E6441E6b2bDB06C2A4b2d117B5Dc8F85',
        amount: '1000000000000000000'
      };

      await expect(provider.getQuote(params, 1))
        .rejects.toThrow('1inch quote failed: API Error');
    });
  });

  describe('getSwapTransaction', () => {
    it('should return transaction data for valid swap request', async () => {
      const mockResponse = {
        data: {
          toAmount: '2000000000000000000000',
          fromAmount: '1000000000000000000',
          tx: {
            to: '0x111111125421ca6dc452d289314280a0f8842a65',
            data: '0xabcdef...',
            value: '1000000000000000000',
            gas: 150000,
            gasPrice: '20000000000'
          }
        }
      };

      mockAxiosClient.get.mockResolvedValue(mockResponse);

      const params = {
        src: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        dst: '0xA0b86a33E6441E6b2bDB06C2A4b2d117B5Dc8F85',
        amount: '1000000000000000000',
        from: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
        slippage: 1
      };

      const result = await provider.getSwapTransaction(params, 1);

      expect(result).toBeDefined();
      expect(result.transaction).toBeDefined();
      expect(result.route).toBeDefined();
      expect(result.transaction.to).toBe('0x111111125421ca6dc452d289314280a0f8842a65');
      expect(result.transaction.data).toBe('0xabcdef...');
      expect(result.transaction.value).toBe('1000000000000000000');
      expect(result.transaction.gasLimit).toBe('150000');
      expect(result.route.provider).toBe('1inch');
    });

    it('should throw error when swap request fails', async () => {
      mockAxiosClient.get.mockRejectedValue(new Error('Swap Error'));

      const params = {
        src: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        dst: '0xA0b86a33E6441E6b2bDB06C2A4b2d117B5Dc8F85',
        amount: '1000000000000000000',
        from: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
        slippage: 1
      };

      await expect(provider.getSwapTransaction(params, 1))
        .rejects.toThrow('1inch swap transaction failed: Swap Error');
    });
  });

  describe('getQuotes', () => {
    it('should return quotes for valid request', async () => {
      const mockResponse = {
        data: {
          toAmount: '2000000000000000000000',
          fromAmount: '1000000000000000000',
          protocols: [],
          estimatedGas: 150000
        }
      };

      mockAxiosClient.get.mockResolvedValue(mockResponse);

      const request: QuoteRequest = {
        action: 'swap',
        amount: '1000000000000000000',
        fromToken: 'ETH',
        toToken: '0xA0b86a33E6441E6b2bDB06C2A4b2d117B5Dc8F85',
        chainId: 1
      };

      const quotes = await provider.getQuotes(request);

      expect(quotes).toBeDefined();
      expect(Array.isArray(quotes)).toBe(true);
      expect(quotes.length).toBe(1);
      expect(quotes[0]?.provider).toBe('1inch');
    });

    it('should return empty array when quote fails', async () => {
      mockAxiosClient.get.mockRejectedValue(new Error('API Error'));

      const request: QuoteRequest = {
        action: 'swap',
        amount: '1000000000000000000',
        fromToken: 'ETH',
        toToken: '0xA0b86a33E6441E6b2bDB06C2A4b2d117B5Dc8F85',
        chainId: 1
      };

      const quotes = await provider.getQuotes(request);

      expect(quotes).toBeDefined();
      expect(Array.isArray(quotes)).toBe(true);
      expect(quotes.length).toBe(0);
    });
  });

  describe('getSupportedTokens', () => {
    it('should return supported tokens for valid chain', async () => {
      const mockResponse = {
        data: {
          tokens: {
            '0xA0b86a33E6441E6b2bDB06C2A4b2d117B5Dc8F85': {
              address: '0xA0b86a33E6441E6b2bDB06C2A4b2d117B5Dc8F85',
              symbol: 'USDT',
              name: 'Tether USD',
              decimals: 6,
              logoURI: 'https://example.com/logo.png'
            }
          }
        }
      };

      mockAxiosClient.get.mockResolvedValue(mockResponse);

      const tokens = await provider.getSupportedTokens(1);

      expect(tokens).toBeDefined();
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBe(1);
      expect(tokens[0]?.symbol).toBe('USDT');
    });

    it('should return empty array when request fails', async () => {
      mockAxiosClient.get.mockRejectedValue(new Error('API Error'));

      const tokens = await provider.getSupportedTokens(1);

      expect(tokens).toBeDefined();
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBe(0);
    });
  });

  describe('getGasPrice', () => {
    it('should return default gas price', async () => {
      const gasPrice = await provider.getGasPrice(1);
      expect(gasPrice).toBe('20000000000'); // 20 Gwei
    });
  });

  describe('healthCheck', () => {
    it('should return true when API is healthy', async () => {
      mockAxiosClient.get.mockResolvedValue({ data: { tokens: {} } });

      const isHealthy = await provider.healthCheck();

      expect(isHealthy).toBe(true);
      expect(mockAxiosClient.get).toHaveBeenCalledWith('/swap/v6.0/1/tokens', { timeout: 5000 });
    });

    it('should return false when API is unhealthy', async () => {
      mockAxiosClient.get.mockRejectedValue(new Error('API Down'));

      const isHealthy = await provider.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });

  describe('getSpenderAddress', () => {
    it('should return spender address from API', async () => {
      const mockResponse = {
        data: {
          address: '0x111111125421ca6dc452d289314280a0f8842a65'
        }
      };

      mockAxiosClient.get.mockResolvedValue(mockResponse);

      const spender = await provider.getSpenderAddress(1);

      expect(spender).toBe('0x111111125421ca6dc452d289314280a0f8842a65');
      expect(mockAxiosClient.get).toHaveBeenCalledWith('/swap/v6.0/1/approve/spender');
    });

    it('should return fallback address when API fails', async () => {
      mockAxiosClient.get.mockRejectedValue(new Error('API Error'));

      const spender = await provider.getSpenderAddress(1);

      expect(spender).toBe('0x111111125421ca6dc452d289314280a0f8842a65');
    });
  });

  describe('checkApproval', () => {
    it('should return approval information when sufficient allowance', async () => {
      const mockSpenderResponse = { data: { address: '0x111111125421ca6dc452d289314280a0f8842a65' } };
      const mockAllowanceResponse = { data: { allowance: '2000000000000000000' } }; // 2 ETH

      mockAxiosClient.get
        .mockResolvedValueOnce(mockSpenderResponse)
        .mockResolvedValueOnce(mockAllowanceResponse);

      const result = await provider.checkApproval(
        '0xA0b86a33E6441E6b2bDB06C2A4b2d117B5Dc8F85',
        '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
        '1000000000000000000', // 1 ETH
        1
      );

      expect(result.isApprovalNeeded).toBe(false);
      expect(result.currentAllowance).toBe('2000000000000000000');
      expect(result.spenderAddress).toBe('0x111111125421ca6dc452d289314280a0f8842a65');
    });

    it('should return approval needed when insufficient allowance', async () => {
      const mockSpenderResponse = { data: { address: '0x111111125421ca6dc452d289314280a0f8842a65' } };
      const mockAllowanceResponse = { data: { allowance: '500000000000000000' } }; // 0.5 ETH

      mockAxiosClient.get
        .mockResolvedValueOnce(mockSpenderResponse)
        .mockResolvedValueOnce(mockAllowanceResponse);

      const result = await provider.checkApproval(
        '0xA0b86a33E6441E6b2bDB06C2A4b2d117B5Dc8F85',
        '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
        '1000000000000000000', // 1 ETH
        1
      );

      expect(result.isApprovalNeeded).toBe(true);
      expect(result.currentAllowance).toBe('500000000000000000');
    });

    it('should assume approval needed when API fails', async () => {
      mockAxiosClient.get.mockRejectedValue(new Error('API Error'));

      const result = await provider.checkApproval(
        '0xA0b86a33E6441E6b2bDB06C2A4b2d117B5Dc8F85',
        '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
        '1000000000000000000',
        1
      );

      expect(result.isApprovalNeeded).toBe(true);
      expect(result.currentAllowance).toBe('0');
    });
  });
});