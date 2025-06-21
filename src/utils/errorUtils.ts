import { logger } from './logger';
import { monitoring } from './monitoring';

export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface ErrorDetails {
  type: ErrorType;
  message: string;
  provider?: string;
  operation?: string;
  statusCode?: number;
  retryable?: boolean;
  metadata?: Record<string, any>;
}

export class IntentEngineError extends Error {
  public readonly type: ErrorType;
  public readonly provider?: string;
  public readonly operation?: string;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly metadata?: Record<string, any>;
  public readonly timestamp: string;

  constructor(details: ErrorDetails) {
    super(details.message);
    this.name = 'IntentEngineError';
    this.type = details.type;
    if (details.provider) this.provider = details.provider;
    if (details.operation) this.operation = details.operation;
    this.statusCode = details.statusCode || 500;
    this.retryable = details.retryable || false;
    if (details.metadata) this.metadata = details.metadata;
    this.timestamp = new Date().toISOString();

    // Ensure proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, IntentEngineError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      provider: this.provider,
      operation: this.operation,
      statusCode: this.statusCode,
      retryable: this.retryable,
      metadata: this.metadata,
      timestamp: this.timestamp,
    };
  }
}

export class ErrorHandler {
  private static instance: ErrorHandler;

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Handle and classify errors from external providers
   */
  handleProviderError(error: any, provider: string, operation: string): IntentEngineError {
    let errorType = ErrorType.PROVIDER_ERROR;
    let statusCode = 500;
    let retryable = false;
    let message = 'Provider error occurred';

    if (error.response) {
      // HTTP error response
      statusCode = error.response.status;
      message = error.response.data?.message || error.message || 'HTTP error';

      // Classify based on status code
      if (statusCode >= 400 && statusCode < 500) {
        if (statusCode === 429) {
          errorType = ErrorType.RATE_LIMIT_ERROR;
          retryable = true;
        } else {
          errorType = ErrorType.VALIDATION_ERROR;
          retryable = false;
        }
      } else if (statusCode >= 500) {
        errorType = ErrorType.PROVIDER_ERROR;
        retryable = true;
      }
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      errorType = ErrorType.TIMEOUT_ERROR;
      retryable = true;
      message = 'Request timed out';
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      errorType = ErrorType.NETWORK_ERROR;
      retryable = true;
      message = 'Network connection failed';
    } else {
      message = error.message || 'Unknown provider error';
    }

    const intentError = new IntentEngineError({
      type: errorType,
      message: `${provider} ${operation}: ${message}`,
      provider,
      operation,
      statusCode,
      retryable,
      metadata: {
        originalError: error.message,
        errorCode: error.code,
        statusCode: error.response?.status,
        responseData: error.response?.data,
      },
    });

    // Log the error
    logger.error('Provider error handled', {
      error: intentError.toJSON(),
      originalStack: error.stack,
    });

    // Record monitoring metric
    monitoring.recordMetric({
      operation: `${provider}_${operation}`,
      duration: 0,
      success: false,
      provider,
      error: intentError.message,
      metadata: {
        errorType: errorType,
        statusCode,
        retryable,
      },
    });

    return intentError;
  }

  /**
   * Handle validation errors
   */
  handleValidationError(message: string, field?: string): IntentEngineError {
    return new IntentEngineError({
      type: ErrorType.VALIDATION_ERROR,
      message,
      statusCode: 400,
      retryable: false,
      metadata: { field },
    });
  }

  /**
   * Handle configuration errors
   */
  handleConfigurationError(message: string, component?: string): IntentEngineError {
    return new IntentEngineError({
      type: ErrorType.CONFIGURATION_ERROR,
      message,
      statusCode: 500,
      retryable: false,
      metadata: { component },
    });
  }

  /**
   * Handle internal errors
   */
  handleInternalError(error: any, operation?: string): IntentEngineError {
    const message = error instanceof Error ? error.message : 'Internal server error';
    
    const errorDetails: ErrorDetails = {
      type: ErrorType.INTERNAL_ERROR,
      message,
      statusCode: 500,
      retryable: false,
      metadata: {
        originalError: error.message,
        stack: error.stack,
      },
    };
    
    if (operation) {
      errorDetails.operation = operation;
    }
    
    const intentError = new IntentEngineError(errorDetails);

    logger.error('Internal error handled', {
      error: intentError.toJSON(),
      originalStack: error.stack,
    });

    return intentError;
  }

  /**
   * Determine if an error should be retried
   */
  shouldRetry(error: IntentEngineError, attemptCount: number, maxRetries: number = 3): boolean {
    if (attemptCount >= maxRetries) {
      return false;
    }

    if (!error.retryable) {
      return false;
    }

    // Specific retry logic for different error types
    switch (error.type) {
      case ErrorType.RATE_LIMIT_ERROR:
        return attemptCount < 2; // Only retry once for rate limits
      case ErrorType.TIMEOUT_ERROR:
      case ErrorType.NETWORK_ERROR:
      case ErrorType.PROVIDER_ERROR:
        return true;
      default:
        return false;
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  getRetryDelay(attemptCount: number, baseDelay: number = 1000): number {
    // Exponential backoff with jitter
    const exponentialDelay = baseDelay * Math.pow(2, attemptCount);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
  }
}

// Singleton instance
export const errorHandler = ErrorHandler.getInstance();

/**
 * Circuit breaker for external service calls
 */
export class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly recoveryTimeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(operation: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime < this.recoveryTimeout) {
        if (fallback) {
          logger.warn('Circuit breaker OPEN, using fallback');
          return fallback();
        }
        throw new IntentEngineError({
          type: ErrorType.PROVIDER_ERROR,
          message: 'Circuit breaker is OPEN',
          statusCode: 503,
          retryable: true,
        });
      } else {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker transitioning to HALF_OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.failures = 0;
      this.state = 'CLOSED';
      logger.info('Circuit breaker recovered, transitioning to CLOSED');
    } else {
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn(`Circuit breaker tripped, transitioning to OPEN after ${this.failures} failures`);
    }
  }

  getState(): string {
    return this.state;
  }

  getFailureCount(): number {
    return this.failures;
  }
}

/**
 * Retry wrapper with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    operation?: string;
    provider?: string;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, operation: opName, provider } = options;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Handle and classify the error
      const intentError = error instanceof IntentEngineError 
        ? error 
        : errorHandler.handleProviderError(error, provider || 'unknown', opName || 'unknown');

      // Check if we should retry
      if (attempt === maxRetries || !errorHandler.shouldRetry(intentError, attempt, maxRetries)) {
        throw intentError;
      }

      // Calculate delay and wait
      const delay = errorHandler.getRetryDelay(attempt, baseDelay);
      logger.warn(`Retrying operation after ${delay}ms`, {
        attempt: attempt + 1,
        maxRetries,
        operation: opName,
        provider,
        error: intentError.message,
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}