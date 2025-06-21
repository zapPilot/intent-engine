import { enhancedSwapService, EnhancedSwapRequest } from '../src/services/EnhancedSwapService';

// Mock the provider modules
jest.mock('../src/integrations/swap-providers/OneInchProvider');
jest.mock('../src/integrations/swap-providers/ParaswapProvider');
jest.mock('../src/integrations/swap-providers/ZeroXProvider');

// Import mocked providers
import { oneInchProvider } from '../src/integrations/swap-providers/OneInchProvider';
import { paraswapProvider } from '../src/integrations/swap-providers/ParaswapProvider';
import { zeroXProvider } from '../src/integrations/swap-providers/ZeroXProvider';

// Mock provider responses
const mockOneInchResponse = {
  approve_to: '0x1111111254EEB25477B68fb85Ed929f73A960582',
  to: '0x1111111254EEB25477B68fb85Ed929f73A960582',
  toAmount: '1000000000000000000',
  minToAmount: '990000000000000000',
  data: '0x7c025200...',
  gasCostUSD: 5.0,
  gas: 150000,
  custom_slippage: 1,
  toUsd: 1995.0
};

const mockParaswapResponse = {
  approve_to: '0x216b4b4ba9f3e719726886d34a177484278bfcae',
  to: '0x216b4b4ba9f3e719726886d34a177484278bfcae',
  toAmount: '1010000000000000000',
  minToAmount: '999900000000000000',
  data: '0x8f7e8ec7...',
  gasCostUSD: 4.5,
  gas: '140000',
  custom_slippage: 100,
  toUsd: 2005.5
};

const mockZeroXResponse = {
  toAmount: '995000000000000000',
  minToAmount: '985050000000000000',
  data: '0x415565b0...',
  to: '0x0000000000000000000000000000000000000000',
  approve_to: '0x0000000000000000000000000000000000000000',
  gasCostUSD: 6.0,
  gas: 160000,
  custom_slippage: 100,
  toUsd: 1989.0
};

describe('EnhancedSwapService', () => {
  const mockRequest: EnhancedSwapRequest = {
    chainId: '42161',
    fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
    fromTokenDecimals: 18,
    toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    toTokenDecimals: 18,
    amount: '1000000000000000000',
    fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e',
    slippage: 1,
    provider: '1inch',
    ethPrice: 2000,
    toTokenPrice: 2000
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSwapData', () => {
    it('should get swap data from 1inch provider', async () => {
      (oneInchProvider.getEnhancedSwapData as jest.Mock).mockResolvedValue(mockOneInchResponse);

      const result = await enhancedSwapService.getSwapData(mockRequest);

      expect(result).toEqual({
        ...mockOneInchResponse,
        provider: '1inch'
      });
      expect(oneInchProvider.getEnhancedSwapData).toHaveBeenCalledWith({
        chainId: mockRequest.chainId,
        fromTokenAddress: mockRequest.fromTokenAddress,
        fromTokenDecimals: mockRequest.fromTokenDecimals,
        toTokenAddress: mockRequest.toTokenAddress,
        toTokenDecimals: mockRequest.toTokenDecimals,
        amount: mockRequest.amount,
        fromAddress: mockRequest.fromAddress,
        slippage: mockRequest.slippage,
        ethPrice: mockRequest.ethPrice,
        toTokenPrice: mockRequest.toTokenPrice
      });
    });

    it('should get swap data from Paraswap provider', async () => {
      const paraswapRequest = { ...mockRequest, provider: 'paraswap' as const };
      (paraswapProvider.getEnhancedSwapData as jest.Mock).mockResolvedValue(mockParaswapResponse);

      const result = await enhancedSwapService.getSwapData(paraswapRequest);

      expect(result).toEqual({
        ...mockParaswapResponse,
        gas: 140000, // Should be converted to number
        provider: 'paraswap'
      });
      expect(paraswapProvider.getEnhancedSwapData).toHaveBeenCalled();
    });

    it('should get swap data from 0x provider', async () => {
      const zeroXRequest = { ...mockRequest, provider: '0x' as const };
      (zeroXProvider.getEnhancedSwapData as jest.Mock).mockResolvedValue(mockZeroXResponse);

      const result = await enhancedSwapService.getSwapData(zeroXRequest);

      expect(result).toEqual({
        ...mockZeroXResponse,
        provider: '0x'
      });
      expect(zeroXProvider.getEnhancedSwapData).toHaveBeenCalled();
    });

    it('should throw error for unsupported provider', async () => {
      const invalidRequest = { ...mockRequest, provider: 'invalid' as any };

      await expect(enhancedSwapService.getSwapData(invalidRequest))
        .rejects.toThrow('Provider invalid is not supported');
    });

    it('should handle provider errors', async () => {
      (oneInchProvider.getEnhancedSwapData as jest.Mock).mockRejectedValue(new Error('Provider error'));

      await expect(enhancedSwapService.getSwapData(mockRequest))
        .rejects.toThrow('1inch getEnhancedSwapData: Provider error');
    });
  });

  describe('getBestSwapData', () => {
    it('should return the best swap data from all providers', async () => {
      (oneInchProvider.getEnhancedSwapData as jest.Mock).mockResolvedValue(mockOneInchResponse);
      (paraswapProvider.getEnhancedSwapData as jest.Mock).mockResolvedValue(mockParaswapResponse);
      (zeroXProvider.getEnhancedSwapData as jest.Mock).mockResolvedValue(mockZeroXResponse);

      const { provider: _, ...requestWithoutProvider } = mockRequest;
      const result = await enhancedSwapService.getBestSwapData(requestWithoutProvider);

      // Paraswap has the highest toUsd value (2005.5)
      expect(result.provider).toBe('paraswap');
      expect(result.toUsd).toBe(2005.5);
    });

    it('should handle partial provider failures', async () => {
      (oneInchProvider.getEnhancedSwapData as jest.Mock).mockResolvedValue(mockOneInchResponse);
      (paraswapProvider.getEnhancedSwapData as jest.Mock).mockRejectedValue(new Error('API error'));
      (zeroXProvider.getEnhancedSwapData as jest.Mock).mockResolvedValue(mockZeroXResponse);

      const { provider: _, ...requestWithoutProvider } = mockRequest;
      const result = await enhancedSwapService.getBestSwapData(requestWithoutProvider);

      // Should return 1inch as it has higher toUsd than 0x (1995 > 1989)
      expect(result.provider).toBe('1inch');
      expect(result.toUsd).toBe(1995.0);
    });

    it('should throw error when all providers fail', async () => {
      (oneInchProvider.getEnhancedSwapData as jest.Mock).mockRejectedValue(new Error('1inch error'));
      (paraswapProvider.getEnhancedSwapData as jest.Mock).mockRejectedValue(new Error('Paraswap error'));
      (zeroXProvider.getEnhancedSwapData as jest.Mock).mockRejectedValue(new Error('0x error'));

      const { provider: _, ...requestWithoutProvider } = mockRequest;

      await expect(enhancedSwapService.getBestSwapData(requestWithoutProvider))
        .rejects.toThrow('All providers failed to provide swap data');
    });
  });

  describe('validation', () => {
    it('should validate required parameters', async () => {
      const invalidRequest = {
        ...mockRequest,
        chainId: '',
        fromTokenAddress: ''
      };

      await expect(enhancedSwapService.getSwapData(invalidRequest))
        .rejects.toThrow('Chain ID is required');
    });

    it('should validate token addresses are different', async () => {
      const invalidRequest = {
        ...mockRequest,
        fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
        toTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037'
      };

      await expect(enhancedSwapService.getSwapData(invalidRequest))
        .rejects.toThrow('Cannot swap token to itself');
    });

    it('should validate slippage range', async () => {
      const invalidRequest = {
        ...mockRequest,
        slippage: 150 // > 100%
      };

      await expect(enhancedSwapService.getSwapData(invalidRequest))
        .rejects.toThrow('Slippage must be between 0 and 100');
    });

    it('should validate positive prices', async () => {
      const invalidRequest = {
        ...mockRequest,
        ethPrice: -100
      };

      await expect(enhancedSwapService.getSwapData(invalidRequest))
        .rejects.toThrow('Token prices must be positive');
    });

    it('should validate positive amount', async () => {
      const invalidRequest = {
        ...mockRequest,
        amount: '0'
      };

      await expect(enhancedSwapService.getSwapData(invalidRequest))
        .rejects.toThrow('Amount must be positive');
    });

    it('should validate from address', async () => {
      const invalidRequest = {
        ...mockRequest,
        fromAddress: '0x0000000000000000000000000000000000000000'
      };

      await expect(enhancedSwapService.getSwapData(invalidRequest))
        .rejects.toThrow('Valid from address is required');
    });
  });
});