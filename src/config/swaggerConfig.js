const fs = require('fs');
const path = require('path');
const swaggerDefinitions = require('./swagger');

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
  apis: ['./src/routes/*.js', './src/app.js'],
};

const resolveSpecPath = () =>
  path.resolve(__dirname, '..', '..', 'docs', 'swagger.json');

const loadSwaggerSpec = () => {
  const specPath = resolveSpecPath();

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (fs.existsSync(specPath)) {
      // The spec path is project-internal and derived from __dirname
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const content = fs.readFileSync(specPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn(
      `Failed to load Swagger spec from ${specPath}:`,
      error.message
    );
  }

  // Fallback: return base definition without generated paths
  return {
    ...swaggerOptions.definition,
    paths: {},
  };
};

const swaggerSpec = loadSwaggerSpec();

module.exports = {
  swaggerOptions,
  swaggerSpec,
};
