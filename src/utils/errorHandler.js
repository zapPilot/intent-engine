/**
 * Centralized Error Handling Utilities
 * Provides custom error classes and standardized error formatting
 */

/**
 * Base API Error class
 */
class ApiError extends Error {
  constructor(
    message,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details = {}
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        details: this.details,
        timestamp: this.timestamp,
      },
    };
  }
}

/**
 * Validation Error - for request validation failures
 */
class ValidationError extends ApiError {
  constructor(message, errors = []) {
    super(message, 400, 'VALIDATION_ERROR', { errors });
    this.name = 'ValidationError';
  }
}

/**
 * Not Found Error - for resource not found
 */
class NotFoundError extends ApiError {
  constructor(resource, identifier) {
    super(`${resource} not found: ${identifier}`, 404, 'NOT_FOUND', {
      resource,
      identifier,
    });
    this.name = 'NotFoundError';
  }
}

/**
 * External Service Error - for third-party API failures
 */
class ExternalServiceError extends ApiError {
  constructor(service, message, originalError = null) {
    super(`${service} error: ${message}`, 503, 'EXTERNAL_SERVICE_ERROR', {
      service,
      originalError: originalError?.message,
    });
    this.name = 'ExternalServiceError';
    this.service = service;
    this.originalError = originalError;
  }
}

/**
 * Rate Limit Error - for rate limiting
 */
class RateLimitError extends ApiError {
  constructor(service, retryAfter = null) {
    super(`Rate limit exceeded for ${service}`, 429, 'RATE_LIMIT_EXCEEDED', {
      service,
      retryAfter,
    });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Insufficient Liquidity Error - for DEX operations
 */
class InsufficientLiquidityError extends ApiError {
  constructor(provider, tokenPair) {
    super(
      `Insufficient liquidity on ${provider} for ${tokenPair}`,
      400,
      'INSUFFICIENT_LIQUIDITY',
      { provider, tokenPair }
    );
    this.name = 'InsufficientLiquidityError';
  }
}

/**
 * Token Not Supported Error
 */
class TokenNotSupportedError extends ApiError {
  constructor(token, provider = null) {
    const message = provider
      ? `Token ${token} not supported by ${provider}`
      : `Token ${token} not supported`;
    super(message, 400, 'TOKEN_NOT_SUPPORTED', { token, provider });
    this.name = 'TokenNotSupportedError';
  }
}

/**
 * Standardized error response formatter
 * @param {Error} error - The error to format
 * @returns {Object} - Formatted error response
 */
function formatErrorResponse(error) {
  // If it's already an ApiError, use its toJSON method
  if (error instanceof ApiError) {
    return error.toJSON();
  }

  // For other errors, create a generic response
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
      statusCode: 500,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Extract status code from error
 * @param {Error} error - The error
 * @returns {number} - HTTP status code
 */
function getErrorStatusCode(error) {
  if (error instanceof ApiError) {
    return error.statusCode;
  }

  // Check for common error properties
  if (error.status) {
    return error.status;
  }
  if (error.statusCode) {
    return error.statusCode;
  }
  if (error.response?.status) {
    return error.response.status;
  }

  return 500;
}

/**
 * Async error wrapper for route handlers
 * @param {Function} fn - Async route handler function
 * @returns {Function} - Wrapped function
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error logger
 * @param {Error} error - The error to log
 * @param {Object} context - Additional context
 */
function logError(error, context = {}) {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.statusCode,
    },
    context,
  };

  // In production, you might want to send this to a logging service
  console.error('Error occurred:', JSON.stringify(errorInfo, null, 2));
}

/**
 * Create error from external service response
 * @param {string} service - Service name
 * @param {Object} error - Axios error or similar
 * @returns {ExternalServiceError} - Formatted external service error
 */
function createExternalServiceError(service, error) {
  let message = 'Unknown error';

  if (error.response) {
    // Extract message from various possible locations
    const data = error.response.data;
    message =
      data?.message ||
      data?.error ||
      data?.error_message ||
      data?.status?.error_message ||
      error.message;
  } else if (error.request) {
    message = `Network error: ${error.message}`;
  } else {
    message = error.message;
  }

  return new ExternalServiceError(service, message, error);
}

module.exports = {
  // Error classes
  ApiError,
  ValidationError,
  NotFoundError,
  ExternalServiceError,
  RateLimitError,
  InsufficientLiquidityError,
  TokenNotSupportedError,

  // Utility functions
  formatErrorResponse,
  getErrorStatusCode,
  asyncHandler,
  logError,
  createExternalServiceError,
};
