import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { healthCheckService } from '../services/HealthCheckService';

/**
 * Health Controller for monitoring system and provider health
 * Provides production-ready health check endpoints for operational monitoring
 */
export class HealthController {
  private readonly logger = logger.child({ controller: 'HealthController' });

  /**
   * Basic health check endpoint
   * GET /health
   */
  async getHealth(_req: Request, res: Response): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Basic system check
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env['npm_package_version'] || '1.0.0',
        environment: process.env['NODE_ENV'] || 'development',
        uptime: process.uptime(),
        responseTime: `${Date.now() - startTime}ms`,
      };

      this.logger.debug('Basic health check completed', health);
      res.status(200).json(health);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Health check failed', { error: errorMessage });
      
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: errorMessage,
      });
    }
  }

  /**
   * Comprehensive system health check
   * GET /health/system
   */
  async getSystemHealth(req: Request, res: Response): Promise<void> {
    try {
      const startTime = Date.now();
      const requestId = req.headers['x-request-id'] || `health_${Date.now()}`;

      this.logger.info('System health check started', { requestId });

      const systemHealth = await healthCheckService.getSystemHealth();
      const responseTime = Date.now() - startTime;

      // Add response metadata
      const response = {
        ...systemHealth,
        metadata: {
          requestId,
          responseTime: `${responseTime}ms`,
          version: process.env['npm_package_version'] || '1.0.0',
          environment: process.env['NODE_ENV'] || 'development',
        },
      };

      // Determine HTTP status based on overall health
      const statusCode = this.getStatusCodeFromHealth(systemHealth.overall);
      
      this.logger.info('System health check completed', {
        requestId,
        overall: systemHealth.overall,
        responseTime,
        providersChecked: systemHealth.providers.length,
      });

      res.status(statusCode).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('System health check failed', { error: errorMessage });
      
      res.status(503).json({
        overall: 'unhealthy',
        error: errorMessage,
        timestamp: new Date().toISOString(),
        metadata: {
          requestId: req.headers['x-request-id'] || `health_error_${Date.now()}`,
          responseTime: '0ms',
        },
      });
    }
  }

  /**
   * Provider-specific health check
   * GET /health/providers
   */
  async getProvidersHealth(req: Request, res: Response): Promise<void> {
    try {
      const startTime = Date.now();
      const requestId = req.headers['x-request-id'] || `providers_${Date.now()}`;

      this.logger.info('Providers health check started', { requestId });

      const providers = await healthCheckService.checkAllProviders();
      const responseTime = Date.now() - startTime;

      // Determine overall provider status
      const unhealthyCount = providers.filter(p => p.status === 'unhealthy').length;
      const degradedCount = providers.filter(p => p.status === 'degraded').length;
      
      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (unhealthyCount >= 2) {
        overallStatus = 'unhealthy';
      } else if (unhealthyCount === 1 || degradedCount >= 2) {
        overallStatus = 'degraded';
      }

      const response = {
        overall: overallStatus,
        providers,
        summary: {
          total: providers.length,
          healthy: providers.filter(p => p.status === 'healthy').length,
          degraded: providers.filter(p => p.status === 'degraded').length,
          unhealthy: providers.filter(p => p.status === 'unhealthy').length,
        },
        metadata: {
          requestId,
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString(),
        },
      };

      const statusCode = this.getStatusCodeFromHealth(overallStatus);

      this.logger.info('Providers health check completed', {
        requestId,
        overall: overallStatus,
        responseTime,
        summary: response.summary,
      });

      res.status(statusCode).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Providers health check failed', { error: errorMessage });
      
      res.status(503).json({
        overall: 'unhealthy',
        error: errorMessage,
        timestamp: new Date().toISOString(),
        metadata: {
          requestId: req.headers['x-request-id'] || `providers_error_${Date.now()}`,
          responseTime: '0ms',
        },
      });
    }
  }

  /**
   * Individual provider health check
   * GET /health/providers/:provider
   */
  async getProviderHealth(req: Request, res: Response): Promise<void> {
    try {
      const provider = req.params['provider'] as string;
      const startTime = Date.now();
      const requestId = req.headers['x-request-id'] || `provider_${provider}_${Date.now()}`;

      // Validate provider parameter
      const validProviders = ['1inch', 'paraswap', '0x'];
      if (!validProviders.includes(provider)) {
        res.status(400).json({
          error: 'Invalid provider',
          validProviders,
          metadata: {
            requestId,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      this.logger.info('Individual provider health check started', { requestId, provider });

      const providers = await healthCheckService.checkAllProviders();
      const providerHealth = providers.find(p => p.provider === provider);

      if (!providerHealth) {
        res.status(404).json({
          error: 'Provider not found',
          provider,
          metadata: {
            requestId,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const responseTime = Date.now() - startTime;
      const response = {
        ...providerHealth,
        metadata: {
          ...providerHealth.metadata,
          requestId,
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString(),
        },
      };

      const statusCode = this.getStatusCodeFromHealth(providerHealth.status);

      this.logger.info('Individual provider health check completed', {
        requestId,
        provider,
        status: providerHealth.status,
        providerResponseTime: providerHealth.responseTime,
        totalResponseTime: responseTime,
      });

      res.status(statusCode).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Individual provider health check failed', {
        provider: req.params['provider'],
        error: errorMessage,
      });
      
      res.status(503).json({
        status: 'unhealthy',
        error: errorMessage,
        provider: req.params['provider'],
        metadata: {
          requestId: req.headers['x-request-id'] || `provider_error_${Date.now()}`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  /**
   * Readiness probe for Kubernetes/container orchestration
   * GET /health/ready
   */
  async getReadiness(_req: Request, res: Response): Promise<void> {
    try {
      const startTime = Date.now();
      const systemHealth = await healthCheckService.getSystemHealth();
      const responseTime = Date.now() - startTime;

      // For readiness, we're more strict - require all providers to be at least degraded
      const isReady = systemHealth.providers.every(p => p.status !== 'unhealthy') &&
                     systemHealth.overall !== 'unhealthy';

      const response = {
        ready: isReady,
        overall: systemHealth.overall,
        providers: systemHealth.providers.map(p => ({
          provider: p.provider,
          status: p.status,
        })),
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
      };

      const statusCode = isReady ? 200 : 503;

      this.logger.info('Readiness probe completed', {
        ready: isReady,
        overall: systemHealth.overall,
        responseTime,
      });

      res.status(statusCode).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Readiness probe failed', { error: errorMessage });
      
      res.status(503).json({
        ready: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Liveness probe for Kubernetes/container orchestration
   * GET /health/live
   */
  async getLiveness(_req: Request, res: Response): Promise<void> {
    try {
      // Simple liveness check - just verify the service is responding
      const response = {
        alive: true,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env['npm_package_version'] || '1.0.0',
      };

      this.logger.debug('Liveness probe completed');
      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Liveness probe failed', { error: errorMessage });
      
      res.status(503).json({
        alive: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Convert health status to HTTP status code
   */
  private getStatusCodeFromHealth(status: 'healthy' | 'degraded' | 'unhealthy'): number {
    switch (status) {
      case 'healthy':
        return 200;
      case 'degraded':
        return 200; // Still operational but with warnings
      case 'unhealthy':
        return 503;
      default:
        return 500;
    }
  }
}

export const healthController = new HealthController();