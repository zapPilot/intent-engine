/**
 * Global error handling middleware
 */
const { AppError, ExternalAPIError, ServiceUnavailableError } = require('../utils/errors');
const { createErrorResponse, logError, sanitizeErrorMessage } = require('../utils/errorResponse');

const errorHandler = (err, req, res, _next) => {
  // Log the error with context
  logError(err, req);

  // Convert non-AppError instances to AppError
  let error = err;
  
  // Handle Axios errors (external API calls)
  if (err.isAxiosError) {
    if (err.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      error = new ExternalAPIError(
        req.query?.provider || 'external service',
        err,
        {
          status: err.response.status,
          data: err.response.data,
        }
      );
    } else if (err.request) {
      // The request was made but no response was received
      error = new ServiceUnavailableError(
        req.query?.provider || 'external service',
        'No response received from service'
      );
    } else {
      // Something happened in setting up the request that triggered an Error
      error = new AppError(
        'Failed to make external API request',
        500,
        'REQUEST_SETUP_ERROR',
        { originalError: err.message }
      );
    }
  }
  
  // Handle validation errors from express-validator
  else if (err.name === 'ValidationError' || err.type === 'entity.parse.failed') {
    error = new AppError(
      'Invalid request data',
      400,
      'VALIDATION_ERROR',
      err.errors || err.body
    );
  }
  
  // Ensure we have an AppError instance
  else if (!(error instanceof AppError)) {
    const statusCode = err.statusCode || err.status || 500;
    const message = sanitizeErrorMessage(err);
    error = new AppError(message, statusCode, err.code || 'INTERNAL_ERROR');
  }

  // Create standardized error response
  const errorResponse = createErrorResponse(error, req);
  
  // Set status code and send response
  res.status(error.statusCode).json(errorResponse);
};

module.exports = errorHandler;
