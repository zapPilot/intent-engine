/**
 * Custom error classes for standardized error handling
 */

/**
 * Base error class for all application errors
 */
class AppError extends Error {
  constructor(
    message,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details = null
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        ...(process.env.NODE_ENV === 'development' && { stack: this.stack }),
      },
    };
  }
}

/**
 * Validation error - 400
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Authentication error - 401
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization error - 403
 */
class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not found error - 404
 */
class NotFoundError extends AppError {
  constructor(resource, identifier) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * Conflict error - 409
 */
class ConflictError extends AppError {
  constructor(message, details = null) {
    super(message, 409, 'CONFLICT_ERROR', details);
  }
}

/**
 * External API error - 502
 */
class ExternalAPIError extends AppError {
  constructor(provider, originalError, details = null) {
    const message = `External API error from ${provider}: ${originalError.message || 'Unknown error'}`;
    super(message, 502, 'EXTERNAL_API_ERROR', {
      provider,
      originalStatus: originalError.response?.status,
      originalMessage: originalError.message,
      ...details,
    });
  }
}

/**
 * Service unavailable error - 503
 */
class ServiceUnavailableError extends AppError {
  constructor(service, reason = 'Service temporarily unavailable') {
    super(`${service}: ${reason}`, 503, 'SERVICE_UNAVAILABLE');
  }
}

/**
 * Rate limit error - 429
 */
class RateLimitError extends AppError {
  constructor(retryAfter = null) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', {
      retryAfter,
    });
  }
}

/**
 * Timeout error - 408
 */
class TimeoutError extends AppError {
  constructor(operation, timeout) {
    super(
      `Operation '${operation}' timed out after ${timeout}ms`,
      408,
      'TIMEOUT_ERROR',
      { operation, timeout }
    );
  }
}

/**
 * Business logic error - 422
 */
class BusinessLogicError extends AppError {
  constructor(message, code, details = null) {
    super(message, 422, code, details);
  }
}

/**
 * Configuration error - 500
 */
class ConfigurationError extends AppError {
  constructor(message) {
    super(message, 500, 'CONFIGURATION_ERROR');
    this.isOperational = false; // Configuration errors are not operational
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  ExternalAPIError,
  ServiceUnavailableError,
  RateLimitError,
  TimeoutError,
  BusinessLogicError,
  ConfigurationError,
};
