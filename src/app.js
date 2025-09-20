require('dotenv').config();
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { swaggerSpec } = require('./config/swaggerConfig');
const corsMiddleware = require('./middleware/cors');
const errorHandler = require('./middleware/errorHandler');
const swapRoutes = require('./routes/swap');
const intentRoutes = require('./routes/intents');
const tokenRoutes = require('./routes/tokens');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger documentation middleware - separate serve and setup for proper static asset handling
app.use('/api-docs', swaggerUi.serve);
app.use(
  '/api-docs',
  swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Intent Engine API Documentation',
    swaggerOptions: {
      // Ensure we use the inline spec, not external URL
      url: undefined,
    },
  })
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/', swapRoutes);
app.use('/', intentRoutes);
app.use('/tokens', tokenRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Only start server if this file is run directly, not when imported
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Intent Engine Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
    console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
    console.log(`Supported DEX providers: 1inch, paraswap, 0x`);
    console.log(
      `Supported intents: dustZap, unifiedZap (zapIn, zapOut, rebalance coming soon)`
    );
    console.log(`🪙  Token endpoints: /tokens/zap/{chainId}, /tokens/chains`);
  });
}

module.exports = app;
