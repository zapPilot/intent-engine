const swaggerJsdoc = require('swagger-jsdoc');
const swaggerDefinitions = require('./swagger');

/**
 * Swagger configuration for Intent Engine API
 * Refactored to use modular domain-specific definitions
 */
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Intent Engine API',
      version: '1.0.0',
      description:
        'A Node.js Express API server for intent-based DeFi operations, providing optimal swap execution and bulk token pricing with intelligent fallback logic.',
      contact: {
        name: 'API Support',
        url: 'https://github.com/all-weather-protocol/intent-engine',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'https://intent-engine.fly.dev',
        description: 'Production server',
      },
    ],
    components: {
      schemas: swaggerDefinitions.schemas,
      responses: swaggerDefinitions.responses,
    },
    tags: swaggerDefinitions.tags,
  },
  apis: [
    './src/routes/*.js', // Path to the API docs
    './src/app.js', // Main app file
  ],
};

// Generate Swagger specification
const swaggerSpec = swaggerJsdoc(swaggerOptions);

module.exports = {
  swaggerOptions,
  swaggerSpec,
};
