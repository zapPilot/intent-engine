import { logger } from './logger';

export interface PerformanceMetric {
  operation: string;
  duration: number;
  success: boolean;
  provider?: string;
  error?: string;
  metadata?: Record<string, any>;
  timestamp?: string;
}

export interface HealthStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: string;
  responseTime?: number;
  error?: string;
}

export class MonitoringService {
  private static instance: MonitoringService;
  private metrics: PerformanceMetric[] = [];
  private healthStatuses: Map<string, HealthStatus> = new Map();
  private readonly maxMetricsInMemory = 1000;

  static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: PerformanceMetric): void {
    const enrichedMetric = {
      ...metric,
      timestamp: new Date().toISOString(),
    };

    this.metrics.push(enrichedMetric);

    // Log performance metrics
    logger.info('Performance metric recorded', enrichedMetric);

    // Keep only recent metrics in memory
    if (this.metrics.length > this.maxMetricsInMemory) {
      this.metrics = this.metrics.slice(-this.maxMetricsInMemory);
    }

    // Log warnings for slow operations
    if (metric.duration > 10000) {
      // 10 seconds
      logger.warn('Slow operation detected', {
        operation: metric.operation,
        duration: metric.duration,
        provider: metric.provider,
      });
    }

    // Log errors
    if (!metric.success) {
      logger.error('Operation failed', {
        operation: metric.operation,
        provider: metric.provider,
        error: metric.error,
        duration: metric.duration,
      });
    }
  }

  /**
   * Time a function execution and record metrics
   */
  async timeOperation<T>(
    operation: string,
    provider: string | undefined,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      const result = await fn();
      success = true;
      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      throw err;
    } finally {
      const duration = Date.now() - startTime;
      const metric: PerformanceMetric = {
        operation,
        duration,
        success,
        ...(provider && { provider }),
        ...(error && { error }),
        ...(metadata && { metadata }),
      };
      this.recordMetric(metric);
    }
  }

  /**
   * Update health status for a service
   */
  updateHealthStatus(service: string, status: HealthStatus): void {
    this.healthStatuses.set(service, {
      ...status,
      lastCheck: new Date().toISOString(),
    });

    // Log health status changes
    if (status.status !== 'healthy') {
      logger.warn('Service health degraded', {
        service,
        status: status.status,
        error: status.error,
        responseTime: status.responseTime,
      });
    }
  }

  /**
   * Get current health status for all services
   */
  getHealthStatuses(): Record<string, HealthStatus> {
    const statuses: Record<string, HealthStatus> = {};
    for (const [service, status] of this.healthStatuses.entries()) {
      statuses[service] = status;
    }
    return statuses;
  }

  /**
   * Get recent performance metrics
   */
  getRecentMetrics(limit: number = 100): PerformanceMetric[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Get aggregated metrics for an operation
   */
  getOperationMetrics(
    operation: string,
    timeRangeMs: number = 300000
  ): {
    totalCount: number;
    successCount: number;
    failureCount: number;
    averageDuration: number;
    maxDuration: number;
    minDuration: number;
    successRate: number;
  } {
    const now = Date.now();
    const cutoff = now - timeRangeMs;

    const relevantMetrics = this.metrics.filter(
      metric => metric.operation === operation && new Date(metric.timestamp || 0).getTime() > cutoff
    );

    if (relevantMetrics.length === 0) {
      return {
        totalCount: 0,
        successCount: 0,
        failureCount: 0,
        averageDuration: 0,
        maxDuration: 0,
        minDuration: 0,
        successRate: 0,
      };
    }

    const successCount = relevantMetrics.filter(m => m.success).length;
    const failureCount = relevantMetrics.length - successCount;
    const durations = relevantMetrics.map(m => m.duration);

    return {
      totalCount: relevantMetrics.length,
      successCount,
      failureCount,
      averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      successRate: successCount / relevantMetrics.length,
    };
  }

  /**
   * Check if system is healthy based on recent metrics
   */
  getSystemHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
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
  } {
    const services = this.getHealthStatuses();
    const swapOperations = this.getOperationMetrics('enhanced_swap');
    const quoteOperations = this.getOperationMetrics('quote');

    // Determine overall system health
    let systemStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check service health
    const serviceStatuses = Object.values(services);
    if (serviceStatuses.some(s => s.status === 'unhealthy')) {
      systemStatus = 'unhealthy';
    } else if (serviceStatuses.some(s => s.status === 'degraded')) {
      systemStatus = 'degraded';
    }

    // Check operation success rates
    if (swapOperations.successRate < 0.9 || quoteOperations.successRate < 0.9) {
      systemStatus = systemStatus === 'healthy' ? 'degraded' : 'unhealthy';
    }

    // Check response times
    if (swapOperations.averageDuration > 10000 || quoteOperations.averageDuration > 5000) {
      systemStatus = systemStatus === 'healthy' ? 'degraded' : systemStatus;
    }

    return {
      status: systemStatus,
      services,
      metrics: {
        swapOperations,
        quoteOperations,
      },
    };
  }

  /**
   * Clear old metrics to prevent memory leaks
   */
  clearOldMetrics(maxAgeMs: number = 3600000): void {
    // 1 hour default
    const cutoff = Date.now() - maxAgeMs;
    this.metrics = this.metrics.filter(
      metric => new Date(metric.timestamp || 0).getTime() > cutoff
    );
  }
}

// Singleton instance
export const monitoring = MonitoringService.getInstance();

// Cleanup old metrics every 5 minutes (only in production)
if (process.env['NODE_ENV'] === 'production') {
  setInterval(
    () => {
      monitoring.clearOldMetrics();
    },
    5 * 60 * 1000
  );
}
