import { healthCheckService, HealthCheckService } from '../src/services/HealthCheckService';

// Mock fetch globally
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

// Mock monitoring service
jest.mock('../src/utils/monitoring');
import { monitoring } from '../src/utils/monitoring';
const mockMonitoring = monitoring as jest.Mocked<typeof monitoring>;

// Helper to create mock Response objects
const createMockResponse = (data: any, options: Partial<Response> = {}): Response => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: new Headers(),
  type: 'basic',
  url: '',
  redirected: false,
  body: null,
  bodyUsed: false,
  clone: () => ({} as Response),
  arrayBuffer: async () => new ArrayBuffer(0),
  blob: async () => new Blob([]),
  formData: async () => new FormData(),
  text: async () => '',
  json: async () => data,
  ...options,
} as Response);

describe('HealthCheckService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    healthCheckService.clearCache();
    
    // Reset monitoring mock
    mockMonitoring.updateHealthStatus = jest.fn();
    mockMonitoring.getSystemHealth = jest.fn().mockReturnValue({
      status: 'healthy',
      services: {},
      metrics: {
        swapOperations: {
          totalCount: 10,
          successCount: 9,
          failureCount: 1,
          averageDuration: 1500,
          maxDuration: 3000,
          minDuration: 500,
          successRate: 0.9,
        },
        quoteOperations: {
          totalCount: 20,
          successCount: 19,
          failureCount: 1,
          averageDuration: 800,
          maxDuration: 1500,
          minDuration: 200,
          successRate: 0.95,
        },
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('check1inchHealth', () => {
    it('should return healthy status for successful 1inch API response', async () => {
      const mockResponse = {
        protocols: [
          {
            id: 'WETH',
            title: 'Wrapped Ether',
            img: 'https://tokens.1inch.io/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png',
          },
        ],
      };

      mockFetch.mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure response time > 0
        return createMockResponse(mockResponse);
      });

      const result = await (healthCheckService as any).check1inchHealth();

      expect(result.provider).toBe('1inch');
      expect(result.status).toBe('healthy');
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.responseTime).toBeLessThan(5000);
      expect(result.error).toBeUndefined();
      expect(result.metadata?.apiVersion).toBe('v6.0');
    });

    it('should return degraded status for slow 1inch API response', async () => {
      const mockResponse = { protocols: [] };

      // Mock a slow response (3 seconds)
      mockFetch.mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 3000));
        return createMockResponse(mockResponse);
      });

      const result = await (healthCheckService as any).check1inchHealth();

      expect(result.provider).toBe('1inch');
      expect(result.status).toBe('degraded');
      expect(result.responseTime).toBeGreaterThanOrEqual(3000);
    });

    it('should return unhealthy status for 1inch API errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await (healthCheckService as any).check1inchHealth();

      expect(result.provider).toBe('1inch');
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Network error');
      expect(result.responseTime).toBeGreaterThan(0);
    });

    it('should return unhealthy status for 1inch HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      }));

      const result = await (healthCheckService as any).check1inchHealth();

      expect(result.provider).toBe('1inch');
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('HTTP 500: Internal Server Error');
    });

    it('should return unhealthy status for 1inch API timeout', async () => {
      // Mock fetch to reject with AbortError (simulating timeout)
      mockFetch.mockRejectedValueOnce(Object.assign(new Error('Request timeout'), { name: 'AbortError' }));

      const result = await (healthCheckService as any).check1inchHealth();

      expect(result.provider).toBe('1inch');
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Request timeout');
    });
  });

  describe('checkParaswapHealth', () => {
    it('should return healthy status for successful Paraswap API response', async () => {
      const mockResponse = [
        { adapter: '0x', name: '0x' },
        { adapter: 'UniswapV2', name: 'Uniswap V2' },
      ];

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await (healthCheckService as any).checkParaswapHealth();

      expect(result.provider).toBe('paraswap');
      expect(result.status).toBe('healthy');
      expect(result.responseTime).toBeLessThan(2000);
      expect(result.metadata?.adaptersAvailable).toBe(2);
    });

    it('should return unhealthy status for Paraswap API errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API unavailable'));

      const result = await (healthCheckService as any).checkParaswapHealth();

      expect(result.provider).toBe('paraswap');
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('API unavailable');
    });
  });

  describe('check0xHealth', () => {
    it('should return healthy status for successful 0x API response', async () => {
      const mockResponse = {
        sources: [
          { name: 'Uniswap_V2', proportion: '0.5' },
          { name: 'SushiSwap', proportion: '0.3' },
        ],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await (healthCheckService as any).check0xHealth();

      expect(result.provider).toBe('0x');
      expect(result.status).toBe('healthy');
      expect(result.responseTime).toBeLessThan(2000);
      expect(result.metadata?.sourcesAvailable).toBe(2);
    });

    it('should return unhealthy status for 0x API errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Service unavailable'));

      const result = await (healthCheckService as any).check0xHealth();

      expect(result.provider).toBe('0x');
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Service unavailable');
    });
  });

  describe('checkAllProviders', () => {
    it('should check all providers and update monitoring', async () => {
      // Mock successful responses for all providers
      mockFetch
        .mockResolvedValueOnce(createMockResponse({ protocols: [] }))
        .mockResolvedValueOnce(createMockResponse([]))
        .mockResolvedValueOnce(createMockResponse({ sources: [] }));

      const results = await healthCheckService.checkAllProviders();

      expect(results).toHaveLength(3);
      expect(results.map(r => r.provider)).toEqual(['1inch', 'paraswap', '0x']);
      expect(results.every(r => r.status === 'healthy')).toBe(true);
      
      // Verify monitoring was updated for each provider
      expect(mockMonitoring.updateHealthStatus).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed provider health statuses', async () => {
      // Mock: 1inch healthy, Paraswap error, 0x healthy
      mockFetch
        .mockResolvedValueOnce(createMockResponse({ protocols: [] }))
        .mockRejectedValueOnce(new Error('Paraswap down'))
        .mockResolvedValueOnce(createMockResponse({ sources: [] }));

      const results = await healthCheckService.checkAllProviders();

      expect(results).toHaveLength(3);
      
      const oneinchResult = results.find(r => r.provider === '1inch');
      const paraswapResult = results.find(r => r.provider === 'paraswap');
      const zeroXResult = results.find(r => r.provider === '0x');

      expect(oneinchResult?.status).toBe('healthy');
      expect(paraswapResult?.status).toBe('unhealthy');
      expect(paraswapResult?.error).toBe('Paraswap down');
      expect(zeroXResult?.status).toBe('healthy');
    });

    it('should handle all providers failing', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('1inch error'))
        .mockRejectedValueOnce(new Error('Paraswap error'))
        .mockRejectedValueOnce(new Error('0x error'));

      const results = await healthCheckService.checkAllProviders();

      expect(results).toHaveLength(3);
      expect(results.every(r => r.status === 'unhealthy')).toBe(true);
      expect(results.map(r => r.error)).toEqual([
        '1inch error',
        'Paraswap error',
        '0x error',
      ]);
    });
  });

  describe('getSystemHealth', () => {
    it('should return comprehensive system health status', async () => {
      // Mock healthy providers
      mockFetch
        .mockResolvedValueOnce(createMockResponse({ protocols: [] }))
        .mockResolvedValueOnce(createMockResponse([]))
        .mockResolvedValueOnce(createMockResponse({ sources: [] }));

      const systemHealth = await healthCheckService.getSystemHealth();

      expect(systemHealth.overall).toBe('healthy');
      expect(systemHealth.providers).toHaveLength(3);
      expect(systemHealth.metrics).toBeDefined();
      expect(systemHealth.metrics.swapOperations).toBeDefined();
      expect(systemHealth.metrics.quoteOperations).toBeDefined();
      expect(systemHealth.timestamp).toBeDefined();
    });

    it('should return degraded status when one provider is unhealthy', async () => {
      // Mock: 1 unhealthy, 2 healthy
      mockFetch
        .mockRejectedValueOnce(new Error('1inch error'))
        .mockResolvedValueOnce(createMockResponse([]))
        .mockResolvedValueOnce(createMockResponse({ sources: [] }));

      const systemHealth = await healthCheckService.getSystemHealth();

      expect(systemHealth.overall).toBe('degraded');
      expect(systemHealth.providers.filter(p => p.status === 'unhealthy')).toHaveLength(1);
      expect(systemHealth.providers.filter(p => p.status === 'healthy')).toHaveLength(2);
    });

    it('should return unhealthy status when two or more providers are unhealthy', async () => {
      // Mock: 2 unhealthy, 1 healthy
      mockFetch
        .mockRejectedValueOnce(new Error('1inch error'))
        .mockRejectedValueOnce(new Error('Paraswap error'))
        .mockResolvedValueOnce(createMockResponse({ sources: [] }));

      const systemHealth = await healthCheckService.getSystemHealth();

      expect(systemHealth.overall).toBe('unhealthy');
      expect(systemHealth.providers.filter(p => p.status === 'unhealthy')).toHaveLength(2);
    });

    it('should factor monitoring service health into overall status', async () => {
      // Mock all providers healthy but monitoring service degraded
      mockFetch
        .mockResolvedValueOnce(createMockResponse({ protocols: [] }))
        .mockResolvedValueOnce(createMockResponse([]))
        .mockResolvedValueOnce(createMockResponse({ sources: [] }));

      mockMonitoring.getSystemHealth.mockReturnValueOnce({
        status: 'degraded',
        services: {},
        metrics: {
          swapOperations: {
            totalCount: 10,
            successCount: 8,
            failureCount: 2,
            averageDuration: 1500,
            maxDuration: 3000,
            minDuration: 500,
            successRate: 0.8, // Low success rate
          },
          quoteOperations: {
            totalCount: 20,
            successCount: 19,
            failureCount: 1,
            averageDuration: 800,
            maxDuration: 1500,
            minDuration: 200,
            successRate: 0.95,
          },
        },
      });

      const systemHealth = await healthCheckService.getSystemHealth();

      expect(systemHealth.overall).toBe('degraded');
    });
  });

  describe('caching', () => {
    it('should cache health check results for 30 seconds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ protocols: [] }),
        status: 200,
        statusText: 'OK',
      } as Response);

      // First call
      const result1 = await (healthCheckService as any).check1inchHealth();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call within cache window
      const result2 = await (healthCheckService as any).check1inchHealth();
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional call
      expect(result1.lastCheck).toBe(result2.lastCheck);
    });

    it('should refresh cache after expiry', async () => {
      // First call
      mockFetch.mockResolvedValueOnce(createMockResponse({ protocols: [] }));

      const result1 = await (healthCheckService as any).check1inchHealth();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Wait a small amount to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      // Clear cache manually to simulate expiry
      healthCheckService.clearCache();

      // Second call after cache clear
      mockFetch.mockResolvedValueOnce(createMockResponse({ protocols: [] }));

      const result2 = await (healthCheckService as any).check1inchHealth();
      expect(mockFetch).toHaveBeenCalledTimes(2); // Additional call made
      expect(result1.lastCheck).not.toBe(result2.lastCheck);
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = HealthCheckService.getInstance();
      const instance2 = HealthCheckService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('error resilience', () => {
    it('should handle JSON parsing errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, {
        json: async () => {
          throw new Error('Invalid JSON');
        },
      }));

      const result = await (healthCheckService as any).check1inchHealth();

      expect(result.provider).toBe('1inch');
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Invalid JSON');
    });

    it('should handle fetch network errors', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await (healthCheckService as any).check1inchHealth();

      expect(result.provider).toBe('1inch');
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Failed to fetch');
    });
  });
});