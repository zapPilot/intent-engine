/**
 * Utility for creating standardized error responses
 */

/**
 * Create a standardized error response
 * @param {Error} error - The error object
 * @param {Object} req - Express request object
 * @returns {Object} Standardized error response
 */
const createErrorResponse = (error, req = null) => {
  const timestamp = new Date().toISOString();
  const requestId = req?.headers?.['x-request-id'] || generateRequestId();
  
  // Base error response structure
  const response = {
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
      timestamp,
      requestId,
    },
  };

  // Add details if available
  if (error.details) {
    response.error.details = error.details;
  }

  // Add request context in development
  if (process.env.NODE_ENV === 'development' && req) {
    response.error.request = {
      method: req.method,
      url: req.originalUrl,
      params: req.params,
      query: req.query,
    };
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development' && error.stack) {
    response.error.stack = error.stack.split('\n');
  }

  // Add provider information if available
  if (req?.query?.provider || error.provider) {
    response.error.provider = req?.query?.provider || error.provider;
  }

  return response;
};

/**
 * Create a standardized success response
 * @param {*} data - The response data
 * @param {Object} meta - Additional metadata
 * @returns {Object} Standardized success response
 */
const createSuccessResponse = (data, meta = {}) => {
  return {
    success: true,
    data,
    ...(Object.keys(meta).length > 0 && { meta }),
  };
};

/**
 * Generate a unique request ID
 * @returns {string} Request ID
 */
const generateRequestId = () => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Log error with context
 * @param {Error} error - The error object
 * @param {Object} req - Express request object
 */
const logError = (error, req = null) => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    level: 'error',
    message: error.message,
    code: error.code,
    statusCode: error.statusCode,
    stack: error.stack,
  };

  if (req) {
    errorLog.request = {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      params: req.params,
      query: req.query,
      body: req.body,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };
  }

  // Log to console in structured format
  console.error(JSON.stringify(errorLog, null, 2));
};

/**
 * Sanitize error messages for production
 * @param {Error} error - The error object
 * @returns {string} Sanitized error message
 */
const sanitizeErrorMessage = (error) => {
  // In production, hide sensitive error details
  if (process.env.NODE_ENV === 'production') {
    // Map specific error types to user-friendly messages
    const errorMessageMap = {
      ECONNREFUSED: 'Service temporarily unavailable',
      ETIMEDOUT: 'Request timed out',
      ENOTFOUND: 'Service not found',
      VALIDATION_ERROR: error.message, // Keep validation errors
      AUTHENTICATION_ERROR: 'Authentication failed',
      AUTHORIZATION_ERROR: 'Access denied',
      NOT_FOUND: error.message, // Keep not found messages
      RATE_LIMIT_EXCEEDED: 'Too many requests',
    };

    return errorMessageMap[error.code] || 'An error occurred while processing your request';
  }

  return error.message;
};

module.exports = {
  createErrorResponse,
  createSuccessResponse,
  generateRequestId,
  logError,
  sanitizeErrorMessage,
};