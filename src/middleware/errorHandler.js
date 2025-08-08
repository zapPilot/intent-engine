const {
  formatErrorResponse,
  getErrorStatusCode,
  logError,
} = require('../utils/errorHandler');

/**
 * Global error handling middleware
 * Handles all errors in a consistent format
 */
const errorHandler = (err, req, res, _next) => {
  // Log error with context
  logError(err, {
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
    user: req.user?.id,
  });

  // Get appropriate status code
  const statusCode = getErrorStatusCode(err);

  // Format error response
  const errorResponse = formatErrorResponse(err);

  // Send response
  res.status(statusCode).json(errorResponse);
};

module.exports = errorHandler;
