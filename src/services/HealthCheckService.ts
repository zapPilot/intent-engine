import { logger } from '../utils/logger';
import { monitoring, HealthStatus } from '../utils/monitoring';
// Note: Direct provider imports removed - health checks use HTTP endpoints instead

export interface ProviderHealthCheck {
  provider: string;
  endpoint: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  lastCheck: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface SystemHealthCheck {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  providers: ProviderHealthCheck[];
  services: Record<string, HealthStatus>;
  metrics: {
    swapOperations: {
      totalCount: number;
      successCount: number;
      failureCount: number;
      averageDuration: number;
      maxDuration: number;
      minDuration: number;
      successRate: number;
    };
    quoteOperations: {
      totalCount: number;
      successCount: number;
      failureCount: number;
      averageDuration: number;
      maxDuration: number;
      minDuration: number;
      successRate: number;
    };
  };
  timestamp: string;
}

/**
 * Health Check Service for monitoring external DEX provider APIs
 * Provides comprehensive health monitoring for production readiness
 */
export class HealthCheckService {
  private static instance: HealthCheckService;
  private readonly logger = logger.child({ service: 'HealthCheckService' });
  private readonly healthCheckTimeout = 10000; // 10 seconds
  private readonly providerHealthCache = new Map<string, ProviderHealthCheck>();
  private readonly cacheExpiry = 30000; // 30 seconds

  static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }

  /**
   * Check health of all DEX providers
   */
  async checkAllProviders(): Promise<ProviderHealthCheck[]> {
    const providers = [
      { name: '1inch', checker: () => this.check1inchHealth() },
      { name: 'paraswap', checker: () => this.checkParaswapHealth() },
      { name: '0x', checker: () => this.check0xHealth() },
    ];

    const healthChecks = await Promise.allSettled(
      providers.map(async ({ name, checker }) => {
        try {
          return await checker();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Health check failed for ${name}`, { error: errorMessage });

          return {
            provider: name,
            endpoint: this.getProviderEndpoint(name),
            status: 'unhealthy' as const,
            responseTime: 0,
            lastCheck: new Date().toISOString(),
            error: errorMessage,
          };
        }
      })
    );

    const results = healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const providerName = providers[index]?.name || 'unknown';
        return {
          provider: providerName,
          endpoint: this.getProviderEndpoint(providerName),
          status: 'unhealthy' as const,
          responseTime: 0,
          lastCheck: new Date().toISOString(),
          error: 'Health check promise rejected',
        };
      }
    });

    // Update monitoring service with health statuses
    results.forEach(result => {
      const healthStatus: HealthStatus = {
        service: result.provider,
        status: result.status,
        lastCheck: result.lastCheck,
        responseTime: result.responseTime,
      };

      if (result.error) {
        healthStatus.error = result.error;
      }

      monitoring.updateHealthStatus(result.provider, healthStatus);
    });

    return results;
  }

  /**
   * Check 1inch API health
   */
  private async check1inchHealth(): Promise<ProviderHealthCheck> {
    const cacheKey = '1inch';
    const cached = this.getCachedHealth(cacheKey);
    if (cached) return cached;

    const startTime = Date.now();
    const endpoint = 'https://api.1inch.dev/swap/v6.0/1/healthcheck';

    try {
      this.logger.debug('Checking 1inch health', { endpoint });

      // Use a simple test call to verify 1inch API availability
      // We'll call the supported chains endpoint as a lightweight health check
      await this.makeHealthCheckRequest(
        'https://api.1inch.dev/swap/v6.0/1/liquidity-sources',
        '1inch'
      );

      const responseTime = Date.now() - startTime;
      const status = this.determineHealthStatus(responseTime, true);

      const healthCheck: ProviderHealthCheck = {
        provider: '1inch',
        endpoint,
        status,
        responseTime,
        lastCheck: new Date().toISOString(),
        metadata: {
          apiVersion: 'v6.0',
          chainSupport: true,
        },
      };

      this.setCachedHealth(cacheKey, healthCheck);
      return healthCheck;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const healthCheck: ProviderHealthCheck = {
        provider: '1inch',
        endpoint,
        status: 'unhealthy',
        responseTime,
        lastCheck: new Date().toISOString(),
        error: errorMessage,
      };

      this.setCachedHealth(cacheKey, healthCheck);
      return healthCheck;
    }
  }

  /**
   * Check Paraswap API health
   */
  private async checkParaswapHealth(): Promise<ProviderHealthCheck> {
    const cacheKey = 'paraswap';
    const cached = this.getCachedHealth(cacheKey);
    if (cached) return cached;

    const startTime = Date.now();
    const endpoint = 'https://api.paraswap.io/adapters/list';

    try {
      this.logger.debug('Checking Paraswap health', { endpoint });

      const testResponse = await this.makeHealthCheckRequest(endpoint, 'paraswap');
      const responseTime = Date.now() - startTime;
      const status = this.determineHealthStatus(responseTime, true);

      const healthCheck: ProviderHealthCheck = {
        provider: 'paraswap',
        endpoint,
        status,
        responseTime,
        lastCheck: new Date().toISOString(),
        metadata: {
          apiVersion: 'v5',
          adaptersAvailable: Array.isArray(testResponse) ? testResponse.length : 0,
        },
      };

      this.setCachedHealth(cacheKey, healthCheck);
      return healthCheck;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const healthCheck: ProviderHealthCheck = {
        provider: 'paraswap',
        endpoint,
        status: 'unhealthy',
        responseTime,
        lastCheck: new Date().toISOString(),
        error: errorMessage,
      };

      this.setCachedHealth(cacheKey, healthCheck);
      return healthCheck;
    }
  }

  /**
   * Check 0x API health
   */
  private async check0xHealth(): Promise<ProviderHealthCheck> {
    const cacheKey = '0x';
    const cached = this.getCachedHealth(cacheKey);
    if (cached) return cached;

    const startTime = Date.now();
    const endpoint = 'https://api.0x.org/sources';

    try {
      this.logger.debug('Checking 0x health', { endpoint });

      const testResponse = await this.makeHealthCheckRequest(endpoint, '0x');
      const responseTime = Date.now() - startTime;
      const status = this.determineHealthStatus(responseTime, true);

      const healthCheck: ProviderHealthCheck = {
        provider: '0x',
        endpoint,
        status,
        responseTime,
        lastCheck: new Date().toISOString(),
        metadata: {
          apiVersion: 'v1',
          sourcesAvailable: Array.isArray(testResponse?.sources) ? testResponse.sources.length : 0,
        },
      };

      this.setCachedHealth(cacheKey, healthCheck);
      return healthCheck;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const healthCheck: ProviderHealthCheck = {
        provider: '0x',
        endpoint,
        status: 'unhealthy',
        responseTime,
        lastCheck: new Date().toISOString(),
        error: errorMessage,
      };

      this.setCachedHealth(cacheKey, healthCheck);
      return healthCheck;
    }
  }

  /**
   * Get comprehensive system health status
   */
  async getSystemHealth(): Promise<SystemHealthCheck> {
    const [providerHealth, systemHealth] = await Promise.all([
      this.checkAllProviders(),
      Promise.resolve(monitoring.getSystemHealth()),
    ]);

    // Determine overall system status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check provider health
    const unhealthyProviders = providerHealth.filter(p => p.status === 'unhealthy');
    const degradedProviders = providerHealth.filter(p => p.status === 'degraded');

    if (unhealthyProviders.length >= 2) {
      overallStatus = 'unhealthy';
    } else if (unhealthyProviders.length === 1 || degradedProviders.length >= 2) {
      overallStatus = 'degraded';
    }

    // Factor in system health from monitoring service
    if (systemHealth.status === 'unhealthy') {
      overallStatus = 'unhealthy';
    } else if (systemHealth.status === 'degraded' && overallStatus === 'healthy') {
      overallStatus = 'degraded';
    }

    return {
      overall: overallStatus,
      providers: providerHealth,
      services: systemHealth.services,
      metrics: systemHealth.metrics,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Make HTTP request for health check with timeout
   */
  private async makeHealthCheckRequest(url: string, _provider: string): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.healthCheckTimeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Intent-Engine-Health-Check/1.0',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Determine health status based on response time and success
   */
  private determineHealthStatus(
    responseTime: number,
    success: boolean
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (!success) {
      return 'unhealthy';
    }

    if (responseTime > 5000) {
      // 5 seconds
      return 'unhealthy';
    } else if (responseTime > 2000) {
      // 2 seconds
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Get provider endpoint for display purposes
   */
  private getProviderEndpoint(provider: string): string {
    switch (provider) {
      case '1inch':
        return 'https://api.1inch.dev/swap/v6.0';
      case 'paraswap':
        return 'https://api.paraswap.io';
      case '0x':
        return 'https://api.0x.org';
      default:
        return 'unknown';
    }
  }

  /**
   * Cache management for health checks
   */
  private getCachedHealth(provider: string): ProviderHealthCheck | null {
    const cached = this.providerHealthCache.get(provider);
    if (!cached) return null;

    const now = Date.now();
    const lastCheck = new Date(cached.lastCheck).getTime();

    if (now - lastCheck > this.cacheExpiry) {
      this.providerHealthCache.delete(provider);
      return null;
    }

    return cached;
  }

  private setCachedHealth(provider: string, health: ProviderHealthCheck): void {
    this.providerHealthCache.set(provider, health);
  }

  /**
   * Clear cached health data (useful for testing)
   */
  clearCache(): void {
    this.providerHealthCache.clear();
  }
}

export const healthCheckService = HealthCheckService.getInstance();
