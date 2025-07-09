require('dotenv').config();
const express = require('express');
const corsMiddleware = require('./middleware/cors');
const errorHandler = require('./middleware/errorHandler');
const swapRoutes = require('./routes/swap');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/', swapRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Only start server if this file is run directly, not when imported
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Swap API Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Supported providers: 1inch, paraswap, 0x`);
  });
}

module.exports = app;