/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, _next) => {
  console.error('Error:', err);

  // Axios error
  if (err.response) {
    return res.status(err.response.status || 500).json({
      error: 'External API error',
      message: err.response.data?.message || err.message,
      provider: req.query?.provider || 'unknown',
    });
  }

  // Network error
  if (err.request) {
    return res.status(503).json({
      error: 'Network error',
      message: 'Unable to connect to external service',
      provider: req.query?.provider || 'unknown',
    });
  }

  // Application error
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    provider: req.query?.provider || 'unknown',
  });
};

module.exports = errorHandler;
