require('dotenv').config();
const express = require('express');
const corsMiddleware = require('./middleware/cors');
const errorHandler = require('./middleware/errorHandler');
const swapRoutes = require('./routes/swap');
const intentRoutes = require('./routes/intents');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/', swapRoutes);
app.use('/', intentRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Only start server if this file is run directly, not when imported
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Intent Engine Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Supported DEX providers: 1inch, paraswap, 0x`);
    console.log(
      `Supported intents: dustZap (zapIn, zapOut, rebalance coming soon)`
    );
  });
}

module.exports = app;
