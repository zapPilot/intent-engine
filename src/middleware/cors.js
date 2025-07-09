const cors = require('cors');

/**
 * CORS configuration for the API
 */
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
};

module.exports = cors(corsOptions);
