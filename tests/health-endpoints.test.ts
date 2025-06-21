import request from 'supertest';
import { app } from '../src/index';

// Mock the health check service
jest.mock('../src/services/HealthCheckService');
import { healthCheckService } from '../src/services/HealthCheckService';

const mockHealthCheckService = healthCheckService as jest.Mocked<typeof healthCheckService>;

describe('Health Endpoints Integration Tests', () => {
  const baseUrl = '/api/v1/health';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/health', () => {
    it('should return basic health status', async () => {
      const response = await request(app)
        .get(baseUrl);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.version).toBeDefined();
      expect(response.body.environment).toBeDefined();
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
      expect(response.body.responseTime).toMatch(/^\d+ms$/);
    });

    it('should handle health check errors gracefully', async () => {
      // Mock an error in the health check process
      const originalUptime = process.uptime;
      process.uptime = () => {
        throw new Error('System error');
      };

      const response = await request(app)
        .get(baseUrl);

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.error).toBe('System error');
      expect(response.body.timestamp).toBeDefined();

      // Restore original function
      process.uptime = originalUptime;
    });
  });

  describe('GET /api/v1/health/system', () => {
    it('should return comprehensive system health when all services are healthy', async () => {
      const mockSystemHealth = {
        overall: 'healthy' as const,
        providers: [
          {
            provider: '1inch',
            endpoint: 'https://api.1inch.dev/swap/v6.0',
            status: 'healthy' as const,
            responseTime: 150,
            lastCheck: '2024-01-01T00:00:00.000Z',
            metadata: { apiVersion: 'v6.0' },
          },
          {
            provider: 'paraswap',
            endpoint: 'https://api.paraswap.io',
            status: 'healthy' as const,
            responseTime: 200,
            lastCheck: '2024-01-01T00:00:00.000Z',
            metadata: { apiVersion: 'v5' },
          },
          {
            provider: '0x',
            endpoint: 'https://api.0x.org',
            status: 'healthy' as const,
            responseTime: 180,
            lastCheck: '2024-01-01T00:00:00.000Z',
            metadata: { apiVersion: 'v1' },
          },
        ],
        services: {},
        metrics: {
          swapOperations: {
            totalCount: 100,
            successCount: 95,
            failureCount: 5,
            averageDuration: 1500,
            maxDuration: 3000,
            minDuration: 500,
            successRate: 0.95,
          },
          quoteOperations: {
            totalCount: 200,
            successCount: 190,
            failureCount: 10,
            averageDuration: 800,
            maxDuration: 1500,
            minDuration: 200,
            successRate: 0.95,
          },
        },
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      mockHealthCheckService.getSystemHealth.mockResolvedValue(mockSystemHealth);

      const response = await request(app)
        .get(`${baseUrl}/system`)
        .set('x-request-id', 'test-request-123');

      expect(response.status).toBe(200);
      expect(response.body.overall).toBe('healthy');
      expect(response.body.providers).toHaveLength(3);
      expect(response.body.providers.every((p: any) => p.status === 'healthy')).toBe(true);
      expect(response.body.metrics.swapOperations).toBeDefined();
      expect(response.body.metrics.quoteOperations).toBeDefined();
      expect(response.body.metadata).toBeDefined();
      expect(response.body.metadata.requestId).toBe('test-request-123');
      expect(response.body.metadata.responseTime).toMatch(/^\d+ms$/);
      expect(response.body.metadata.version).toBeDefined();
    });

    it('should return degraded status when some providers are unhealthy', async () => {
      const mockSystemHealth = {
        overall: 'degraded' as const,
        providers: [
          {
            provider: '1inch',
            endpoint: 'https://api.1inch.dev/swap/v6.0',
            status: 'healthy' as const,
            responseTime: 150,
            lastCheck: '2024-01-01T00:00:00.000Z',
          },
          {
            provider: 'paraswap',
            endpoint: 'https://api.paraswap.io',
            status: 'unhealthy' as const,
            responseTime: 0,
            lastCheck: '2024-01-01T00:00:00.000Z',
            error: 'API unavailable',
          },
          {
            provider: '0x',
            endpoint: 'https://api.0x.org',
            status: 'healthy' as const,
            responseTime: 180,
            lastCheck: '2024-01-01T00:00:00.000Z',
          },
        ],
        services: {},
        metrics: {
          swapOperations: {
            totalCount: 100,
            successCount: 85,
            failureCount: 15,
            averageDuration: 2000,
            maxDuration: 5000,
            minDuration: 500,
            successRate: 0.85,
          },
          quoteOperations: {
            totalCount: 200,
            successCount: 180,
            failureCount: 20,
            averageDuration: 1200,
            maxDuration: 3000,
            minDuration: 200,
            successRate: 0.9,
          },
        },
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      mockHealthCheckService.getSystemHealth.mockResolvedValue(mockSystemHealth);

      const response = await request(app)
        .get(`${baseUrl}/system`);

      expect(response.status).toBe(200); // Degraded still returns 200
      expect(response.body.overall).toBe('degraded');
      expect(response.body.providers.find((p: any) => p.provider === 'paraswap').status).toBe('unhealthy');
      expect(response.body.providers.find((p: any) => p.provider === 'paraswap').error).toBe('API unavailable');
    });

    it('should return unhealthy status when system is critically degraded', async () => {
      const mockSystemHealth = {
        overall: 'unhealthy' as const,
        providers: [
          {
            provider: '1inch',
            endpoint: 'https://api.1inch.dev/swap/v6.0',
            status: 'unhealthy' as const,
            responseTime: 0,
            lastCheck: '2024-01-01T00:00:00.000Z',
            error: 'Connection timeout',
          },
          {
            provider: 'paraswap',
            endpoint: 'https://api.paraswap.io',
            status: 'unhealthy' as const,
            responseTime: 0,
            lastCheck: '2024-01-01T00:00:00.000Z',
            error: 'API unavailable',
          },
          {
            provider: '0x',
            endpoint: 'https://api.0x.org',
            status: 'healthy' as const,
            responseTime: 180,
            lastCheck: '2024-01-01T00:00:00.000Z',
          },
        ],
        services: {},
        metrics: {
          swapOperations: {
            totalCount: 100,
            successCount: 50,
            failureCount: 50,
            averageDuration: 8000,
            maxDuration: 15000,
            minDuration: 500,
            successRate: 0.5,
          },
          quoteOperations: {
            totalCount: 200,
            successCount: 120,
            failureCount: 80,
            averageDuration: 5000,
            maxDuration: 10000,
            minDuration: 200,
            successRate: 0.6,
          },
        },
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      mockHealthCheckService.getSystemHealth.mockResolvedValue(mockSystemHealth);

      const response = await request(app)
        .get(`${baseUrl}/system`);

      expect(response.status).toBe(503);
      expect(response.body.overall).toBe('unhealthy');
      expect(response.body.providers.filter((p: any) => p.status === 'unhealthy')).toHaveLength(2);
    });

    it('should handle system health check errors', async () => {
      mockHealthCheckService.getSystemHealth.mockRejectedValue(new Error('System health check failed'));

      const response = await request(app)
        .get(`${baseUrl}/system`);

      expect(response.status).toBe(503);
      expect(response.body.overall).toBe('unhealthy');
      expect(response.body.error).toBe('System health check failed');
      expect(response.body.metadata.requestId).toBeDefined();
    });

    it('should generate request ID when not provided', async () => {
      const mockSystemHealth = {
        overall: 'healthy' as const,
        providers: [],
        services: {},
        metrics: {
          swapOperations: {
            totalCount: 0,
            successCount: 0,
            failureCount: 0,
            averageDuration: 0,
            maxDuration: 0,
            minDuration: 0,
            successRate: 0,
          },
          quoteOperations: {
            totalCount: 0,
            successCount: 0,
            failureCount: 0,
            averageDuration: 0,
            maxDuration: 0,
            minDuration: 0,
            successRate: 0,
          },
        },
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      mockHealthCheckService.getSystemHealth.mockResolvedValue(mockSystemHealth);

      const response = await request(app)
        .get(`${baseUrl}/system`);

      expect(response.status).toBe(200);
      expect(response.body.metadata.requestId).toMatch(/^health_\d+$|^[a-z0-9]+$/);
    });
  });

  describe('GET /api/v1/health/providers', () => {
    it('should return all providers health status', async () => {
      const mockProviders = [
        {
          provider: '1inch',
          endpoint: 'https://api.1inch.dev/swap/v6.0',
          status: 'healthy' as const,
          responseTime: 150,
          lastCheck: '2024-01-01T00:00:00.000Z',
          metadata: { apiVersion: 'v6.0' },
        },
        {
          provider: 'paraswap',
          endpoint: 'https://api.paraswap.io',
          status: 'degraded' as const,
          responseTime: 2500,
          lastCheck: '2024-01-01T00:00:00.000Z',
          metadata: { apiVersion: 'v5' },
        },
        {
          provider: '0x',
          endpoint: 'https://api.0x.org',
          status: 'unhealthy' as const,
          responseTime: 0,
          lastCheck: '2024-01-01T00:00:00.000Z',
          error: 'Connection failed',
          metadata: { apiVersion: 'v1' },
        },
      ];

      mockHealthCheckService.checkAllProviders.mockResolvedValue(mockProviders);

      const response = await request(app)
        .get(`${baseUrl}/providers`)
        .set('x-request-id', 'providers-test-123');

      expect(response.status).toBe(200); // Degraded overall but still returns 200
      expect(response.body.overall).toBe('degraded');
      expect(response.body.providers).toHaveLength(3);
      expect(response.body.summary.total).toBe(3);
      expect(response.body.summary.healthy).toBe(1);
      expect(response.body.summary.degraded).toBe(1);
      expect(response.body.summary.unhealthy).toBe(1);
      expect(response.body.metadata.requestId).toBe('providers-test-123');
      expect(response.body.metadata.responseTime).toMatch(/^\d+ms$/);
    });

    it('should return unhealthy overall when multiple providers are down', async () => {
      const mockProviders = [
        {
          provider: '1inch',
          endpoint: 'https://api.1inch.dev/swap/v6.0',
          status: 'unhealthy' as const,
          responseTime: 0,
          lastCheck: '2024-01-01T00:00:00.000Z',
          error: 'API error',
        },
        {
          provider: 'paraswap',
          endpoint: 'https://api.paraswap.io',
          status: 'unhealthy' as const,
          responseTime: 0,
          lastCheck: '2024-01-01T00:00:00.000Z',
          error: 'Connection timeout',
        },
        {
          provider: '0x',
          endpoint: 'https://api.0x.org',
          status: 'healthy' as const,
          responseTime: 150,
          lastCheck: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockHealthCheckService.checkAllProviders.mockResolvedValue(mockProviders);

      const response = await request(app)
        .get(`${baseUrl}/providers`);

      expect(response.status).toBe(503);
      expect(response.body.overall).toBe('unhealthy');
      expect(response.body.summary.unhealthy).toBe(2);
    });

    it('should handle providers health check errors', async () => {
      mockHealthCheckService.checkAllProviders.mockRejectedValue(new Error('Providers check failed'));

      const response = await request(app)
        .get(`${baseUrl}/providers`);

      expect(response.status).toBe(503);
      expect(response.body.overall).toBe('unhealthy');
      expect(response.body.error).toBe('Providers check failed');
    });
  });

  describe('GET /api/v1/health/providers/:provider', () => {
    it('should return specific provider health status', async () => {
      const mockProviders = [
        {
          provider: '1inch',
          endpoint: 'https://api.1inch.dev/swap/v6.0',
          status: 'healthy' as const,
          responseTime: 150,
          lastCheck: '2024-01-01T00:00:00.000Z',
          metadata: { apiVersion: 'v6.0', chainSupport: true },
        },
        {
          provider: 'paraswap',
          endpoint: 'https://api.paraswap.io',
          status: 'degraded' as const,
          responseTime: 2500,
          lastCheck: '2024-01-01T00:00:00.000Z',
        },
        {
          provider: '0x',
          endpoint: 'https://api.0x.org',
          status: 'unhealthy' as const,
          responseTime: 0,
          lastCheck: '2024-01-01T00:00:00.000Z',
          error: 'Connection failed',
        },
      ];

      mockHealthCheckService.checkAllProviders.mockResolvedValue(mockProviders);

      const response = await request(app)
        .get(`${baseUrl}/providers/1inch`)
        .set('x-request-id', 'provider-test-123');

      expect(response.status).toBe(200);
      expect(response.body.provider).toBe('1inch');
      expect(response.body.status).toBe('healthy');
      expect(response.body.responseTime).toBe(150);
      expect(response.body.metadata?.apiVersion).toBe('v6.0');
      expect(response.body.metadata.requestId).toBe('provider-test-123');
    });

    it('should return 503 for unhealthy provider', async () => {
      const mockProviders = [
        {
          provider: '0x',
          endpoint: 'https://api.0x.org',
          status: 'unhealthy' as const,
          responseTime: 0,
          lastCheck: '2024-01-01T00:00:00.000Z',
          error: 'Connection failed',
        },
      ];

      mockHealthCheckService.checkAllProviders.mockResolvedValue(mockProviders);

      const response = await request(app)
        .get(`${baseUrl}/providers/0x`);

      expect(response.status).toBe(503);
      expect(response.body.provider).toBe('0x');
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.error).toBe('Connection failed');
    });

    it('should return 400 for invalid provider', async () => {
      const response = await request(app)
        .get(`${baseUrl}/providers/invalid-provider`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid provider');
      expect(response.body.validProviders).toEqual(['1inch', 'paraswap', '0x']);
    });

    it('should return 404 for provider not found', async () => {
      mockHealthCheckService.checkAllProviders.mockResolvedValue([]);

      const response = await request(app)
        .get(`${baseUrl}/providers/1inch`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Provider not found');
      expect(response.body.provider).toBe('1inch');
    });

    it('should handle individual provider check errors', async () => {
      mockHealthCheckService.checkAllProviders.mockRejectedValue(new Error('Provider check failed'));

      const response = await request(app)
        .get(`${baseUrl}/providers/1inch`);

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.error).toBe('Provider check failed');
      expect(response.body.provider).toBe('1inch');
    });
  });

  describe('GET /api/v1/health/ready', () => {
    it('should return ready when all providers are operational', async () => {
      const mockSystemHealth = {
        overall: 'healthy' as const,
        providers: [
          {
            provider: '1inch',
            endpoint: 'https://api.1inch.dev/swap/v6.0',
            status: 'healthy' as const,
            responseTime: 150,
            lastCheck: '2024-01-01T00:00:00.000Z',
          },
          {
            provider: 'paraswap',
            endpoint: 'https://api.paraswap.io',
            status: 'degraded' as const,
            responseTime: 2000,
            lastCheck: '2024-01-01T00:00:00.000Z',
          },
          {
            provider: '0x',
            endpoint: 'https://api.0x.org',
            status: 'healthy' as const,
            responseTime: 180,
            lastCheck: '2024-01-01T00:00:00.000Z',
          },
        ],
        services: {},
        metrics: {
          swapOperations: {
            totalCount: 100,
            successCount: 95,
            failureCount: 5,
            averageDuration: 1500,
            maxDuration: 3000,
            minDuration: 500,
            successRate: 0.95,
          },
          quoteOperations: {
            totalCount: 200,
            successCount: 190,
            failureCount: 10,
            averageDuration: 800,
            maxDuration: 1500,
            minDuration: 200,
            successRate: 0.95,
          },
        },
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      mockHealthCheckService.getSystemHealth.mockResolvedValue(mockSystemHealth);

      const response = await request(app)
        .get(`${baseUrl}/ready`);

      expect(response.status).toBe(200);
      expect(response.body.ready).toBe(true);
      expect(response.body.overall).toBe('healthy');
      expect(response.body.providers).toHaveLength(3);
      expect(response.body.providers.every((p: any) => p.status !== 'unhealthy')).toBe(true);
    });

    it('should return not ready when any provider is unhealthy', async () => {
      const mockSystemHealth = {
        overall: 'unhealthy' as const,
        providers: [
          {
            provider: '1inch',
            endpoint: 'https://api.1inch.dev/swap/v6.0',
            status: 'healthy' as const,
            responseTime: 150,
            lastCheck: '2024-01-01T00:00:00.000Z',
          },
          {
            provider: 'paraswap',
            endpoint: 'https://api.paraswap.io',
            status: 'unhealthy' as const,
            responseTime: 0,
            lastCheck: '2024-01-01T00:00:00.000Z',
            error: 'API down',
          },
        ],
        services: {},
        metrics: {
          swapOperations: {
            totalCount: 100,
            successCount: 50,
            failureCount: 50,
            averageDuration: 5000,
            maxDuration: 10000,
            minDuration: 500,
            successRate: 0.5,
          },
          quoteOperations: {
            totalCount: 200,
            successCount: 100,
            failureCount: 100,
            averageDuration: 3000,
            maxDuration: 8000,
            minDuration: 200,
            successRate: 0.5,
          },
        },
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      mockHealthCheckService.getSystemHealth.mockResolvedValue(mockSystemHealth);

      const response = await request(app)
        .get(`${baseUrl}/ready`);

      expect(response.status).toBe(503);
      expect(response.body.ready).toBe(false);
      expect(response.body.overall).toBe('unhealthy');
    });

    it('should handle readiness check errors', async () => {
      mockHealthCheckService.getSystemHealth.mockRejectedValue(new Error('Readiness check failed'));

      const response = await request(app)
        .get(`${baseUrl}/ready`);

      expect(response.status).toBe(503);
      expect(response.body.ready).toBe(false);
      expect(response.body.error).toBe('Readiness check failed');
    });
  });

  describe('GET /api/v1/health/live', () => {
    it('should return alive for basic liveness check', async () => {
      const response = await request(app)
        .get(`${baseUrl}/live`);

      expect(response.status).toBe(200);
      expect(response.body.alive).toBe(true);
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
      expect(response.body.version).toBeDefined();
    });

    it('should handle liveness check errors', async () => {
      // Mock an error during liveness check
      const originalUptime = process.uptime;
      process.uptime = () => {
        throw new Error('Process error');
      };

      const response = await request(app)
        .get(`${baseUrl}/live`);

      expect(response.status).toBe(503);
      expect(response.body.alive).toBe(false);
      expect(response.body.error).toBe('Process error');

      // Restore original function
      process.uptime = originalUptime;
    });
  });

  describe('Health endpoint redirects', () => {
    it('should redirect /health to /api/v1/health', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(302);
      expect(response.headers['location']).toBe('/api/v1/health');
    });

    it('should redirect /health/ready to /api/v1/health/ready', async () => {
      const response = await request(app)
        .get('/health/ready');

      expect(response.status).toBe(302);
      expect(response.headers['location']).toBe('/api/v1/health/ready');
    });

    it('should redirect /health/live to /api/v1/health/live', async () => {
      const response = await request(app)
        .get('/health/live');

      expect(response.status).toBe(302);
      expect(response.headers['location']).toBe('/api/v1/health/live');
    });
  });
});