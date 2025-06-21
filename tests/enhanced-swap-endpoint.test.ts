import request from 'supertest';
import { app } from '../src/index';

// Mock the enhanced swap service
jest.mock('../src/services/EnhancedSwapService');
import { enhancedSwapService } from '../src/services/EnhancedSwapService';

const mockEnhancedSwapService = enhancedSwapService as jest.Mocked<typeof enhancedSwapService>;

describe('Enhanced Swap Endpoint Integration Tests', () => {
  const baseUrl = '/api/v1';
  
  // Mock response that matches rebalance_backend format
  const mockSwapResponse = {
    approve_to: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    to: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    toAmount: '1000000000000000000',
    minToAmount: '990000000000000000',
    data: '0x7c025200...',
    gasCostUSD: 5.0,
    gas: 150000,
    custom_slippage: 100,
    toUsd: 1995.0,
    provider: '1inch'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /swap/enhanced', () => {
    describe('Parameter Validation', () => {
      it('should reject requests with missing required parameters', async () => {
        const response = await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '42161',
            fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037'
            // Missing required parameters
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Missing required parameters');
        expect(response.body.required).toEqual([
          'chainId', 'fromTokenAddress', 'toTokenAddress', 'amount', 'fromAddress'
        ]);
      });

      it('should accept requests with all required parameters', async () => {
        mockEnhancedSwapService.getSwapData.mockResolvedValue(mockSwapResponse);

        const response = await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '42161',
            fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            fromTokenDecimals: '18',
            toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            toTokenDecimals: '18',
            amount: '1000000000000000000',
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e',
            slippage: '1',
            provider: '1inch',
            ethPrice: '2000',
            toTokenPrice: '2000'
          });

        expect(response.status).toBe(200);
        expect(response.body.provider).toBe('1inch');
        expect(response.body.toAmount).toBe('1000000000000000000');
      });

      it('should use default values for optional parameters', async () => {
        mockEnhancedSwapService.getSwapData.mockResolvedValue(mockSwapResponse);

        await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '42161',
            fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            amount: '1000000000000000000',
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e',
            provider: '1inch'
          });

        expect(mockEnhancedSwapService.getSwapData).toHaveBeenCalledWith({
          chainId: '42161',
          fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
          fromTokenDecimals: 18, // Default
          toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
          toTokenDecimals: 18, // Default
          amount: '1000000000000000000',
          fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e',
          slippage: 1, // Default
          provider: '1inch',
          ethPrice: 2000, // Default
          toTokenPrice: 1 // Default
        });
      });

      it('should reject invalid provider', async () => {
        const response = await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '42161',
            fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            amount: '1000000000000000000',
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e',
            provider: 'invalid-provider'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid provider');
        expect(response.body.validProviders).toEqual(['1inch', 'paraswap', '0x']);
      });
    });

    describe('Provider Selection', () => {
      it('should call specific provider when provider is specified', async () => {
        mockEnhancedSwapService.getSwapData.mockResolvedValue(mockSwapResponse);

        await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '42161',
            fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            amount: '1000000000000000000',
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e',
            provider: 'paraswap'
          });

        expect(mockEnhancedSwapService.getSwapData).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: 'paraswap'
          })
        );
        expect(mockEnhancedSwapService.getBestSwapData).not.toHaveBeenCalled();
      });

      it('should call getBestSwapData when no provider specified', async () => {
        mockEnhancedSwapService.getBestSwapData.mockResolvedValue(mockSwapResponse);

        await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '42161',
            fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            amount: '1000000000000000000',
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e'
          });

        expect(mockEnhancedSwapService.getBestSwapData).toHaveBeenCalledWith(
          expect.objectContaining({
            chainId: '42161',
            fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            amount: '1000000000000000000',
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e'
          })
        );
        expect(mockEnhancedSwapService.getSwapData).not.toHaveBeenCalled();
      });
    });

    describe('Response Format', () => {
      it('should return response in rebalance_backend compatible format', async () => {
        mockEnhancedSwapService.getSwapData.mockResolvedValue(mockSwapResponse);

        const response = await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '42161',
            fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            amount: '1000000000000000000',
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e',
            provider: '1inch'
          });

        expect(response.status).toBe(200);
        
        // Verify rebalance_backend compatible response structure
        expect(response.body).toMatchObject({
          approve_to: '0x1111111254EEB25477B68fb85Ed929f73A960582',
          to: '0x1111111254EEB25477B68fb85Ed929f73A960582',
          toAmount: '1000000000000000000',
          minToAmount: '990000000000000000',
          data: '0x7c025200...',
          gasCostUSD: 5.0,
          gas: 150000,
          custom_slippage: 100,
          toUsd: 1995.0,
          provider: '1inch'
        });

        // Verify metadata is included
        expect(response.body.metadata).toBeDefined();
        expect(response.body.metadata.responseTime).toMatch(/^\d+ms$/);
        expect(response.body.metadata.timestamp).toBeDefined();
        expect(response.body.metadata.requestId).toBeDefined();
      });

      it('should include performance metadata', async () => {
        mockEnhancedSwapService.getSwapData.mockResolvedValue(mockSwapResponse);

        const response = await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '42161',
            fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            amount: '1000000000000000000',
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e',
            provider: '1inch'
          });

        expect(response.body.metadata).toMatchObject({
          responseTime: expect.stringMatching(/^\d+ms$/),
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.any(String)
        });
      });
    });

    describe('Error Handling', () => {
      it('should handle EnhancedSwapService errors gracefully', async () => {
        const errorMessage = 'Provider API failure';
        mockEnhancedSwapService.getSwapData.mockRejectedValue(new Error(errorMessage));

        const response = await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '42161',
            fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            amount: '1000000000000000000',
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e',
            provider: '1inch'
          });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe(errorMessage);
        expect(response.body.metadata).toBeDefined();
        expect(response.body.metadata.responseTime).toMatch(/^\d+ms$/);
      });

      it('should handle getBestSwapData errors gracefully', async () => {
        const errorMessage = 'All providers failed';
        mockEnhancedSwapService.getBestSwapData.mockRejectedValue(new Error(errorMessage));

        const response = await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '42161',
            fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            amount: '1000000000000000000',
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e'
          });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe(errorMessage);
        expect(response.body.params).toBeDefined();
      });

      it('should handle malformed requests gracefully', async () => {
        const response = await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '', // Empty required parameter
            fromTokenAddress: 'invalid-address',
            toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            amount: '1000000000000000000',
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Missing required parameters');
      });
    });

    describe('Request ID Handling', () => {
      it('should use provided x-request-id header', async () => {
        mockEnhancedSwapService.getSwapData.mockResolvedValue(mockSwapResponse);
        const requestId = 'test-request-123';

        const response = await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .set('x-request-id', requestId)
          .query({
            chainId: '42161',
            fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            amount: '1000000000000000000',
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e',
            provider: '1inch'
          });

        expect(response.status).toBe(200);
        expect(response.body.metadata.requestId).toBe(requestId);
      });

      it('should generate request ID when not provided', async () => {
        mockEnhancedSwapService.getSwapData.mockResolvedValue(mockSwapResponse);

        const response = await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '42161',
            fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            amount: '1000000000000000000',
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e',
            provider: '1inch'
          });

        expect(response.status).toBe(200);
        expect(response.body.metadata.requestId).toMatch(/^req_\d+$|^[a-z0-9]+$/);
      });
    });

    describe('Real-world Scenarios', () => {
      it('should handle Arbitrum WETH to USDC swap', async () => {
        const arbitrumSwapResponse = {
          ...mockSwapResponse,
          provider: 'paraswap',
          toAmount: '2000000000', // 2000 USDC (6 decimals)
          minToAmount: '1980000000', // With 1% slippage
          toUsd: 1995.0
        };

        mockEnhancedSwapService.getBestSwapData.mockResolvedValue(arbitrumSwapResponse);

        const response = await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '42161', // Arbitrum
            fromTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
            fromTokenDecimals: '18',
            toTokenAddress: '0xA0b86a33E6417C83b20B44eb26a3f1b1B3b02b7B', // USDC
            toTokenDecimals: '6',
            amount: '1000000000000000000', // 1 WETH
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e',
            slippage: '1',
            ethPrice: '2000',
            toTokenPrice: '1'
          });

        expect(response.status).toBe(200);
        expect(response.body.provider).toBe('paraswap');
        expect(response.body.toAmount).toBe('2000000000');
      });

      it('should handle Base mainnet swaps', async () => {
        const baseSwapResponse = {
          ...mockSwapResponse,
          provider: '0x',
          gas: 120000,
          gasCostUSD: 3.5
        };

        mockEnhancedSwapService.getSwapData.mockResolvedValue(baseSwapResponse);

        const response = await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '8453', // Base
            fromTokenAddress: '0x4200000000000000000000000000000000000006', // WETH on Base
            toTokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
            amount: '500000000000000000', // 0.5 WETH
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e',
            provider: '0x'
          });

        expect(response.status).toBe(200);
        expect(response.body.provider).toBe('0x');
        expect(response.body.gas).toBe(120000);
      });
    });

    describe('Performance Requirements', () => {
      it('should respond within acceptable time limits', async () => {
        mockEnhancedSwapService.getSwapData.mockResolvedValue(mockSwapResponse);

        const startTime = Date.now();
        const response = await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '42161',
            fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            amount: '1000000000000000000',
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e',
            provider: '1inch'
          });
        const endTime = Date.now();

        expect(response.status).toBe(200);
        expect(endTime - startTime).toBeLessThan(5000); // Should respond within 5 seconds
      });

      it('should include response time in metadata', async () => {
        mockEnhancedSwapService.getSwapData.mockResolvedValue(mockSwapResponse);

        const response = await request(app)
          .get(`${baseUrl}/swap/enhanced`)
          .query({
            chainId: '42161',
            fromTokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            amount: '1000000000000000000',
            fromAddress: '0x742d35Cc6567C6532C3113F9D2b6e4d3D0FD9A4e',
            provider: '1inch'
          });

        expect(response.status).toBe(200);
        const responseTime = parseInt(response.body.metadata.responseTime.replace('ms', ''));
        expect(responseTime).toBeGreaterThanOrEqual(0);
        expect(responseTime).toBeLessThan(5000);
      });
    });
  });
});