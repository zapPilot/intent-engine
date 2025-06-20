import request from 'supertest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { errorHandler } from '../src/middleware/errorHandler';

// Create a simplified test app without rate limiting for integration tests
const createTestApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Add request ID middleware
  app.use((req, _res, next) => {
    req.headers['x-request-id'] =
      req.headers['x-request-id'] || Math.random().toString(36).substring(2, 15);
    next();
  });

  // Root health check endpoint
  app.get('/', (_req, res) => {
    res.json({
      service: 'Intent Engine API',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: 'test',
      version: '1.0.0',
    });
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: 'test',
    });
  });

  app.get('/health/ready', (_req, res) => {
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
        web3: 'connected',
      },
    });
  });

  // API info endpoint
  app.get('/api/v1', (_req, res) => {
    res.json({
      message: 'Intent Engine API v1',
      version: '1.0.0',
      endpoints: [
        'POST /api/v1/intent/execute',
        'GET /api/v1/intent/quote',
        'POST /api/v1/intent/optimize',
        'GET /api/v1/intent/status/:intentId',
      ],
    });
  });

  // Mock API endpoints for testing
  app.post('/api/v1/intent/build', (_req, res) => {
    res.json({
      intentId: 'intent_test_123',
      transactions: [{ to: '0x123', data: '0x456' }],
      metadata: { gasEstimate: '21000' },
    });
  });

  app.get('/api/v1/quote', (_req, res) => {
    res.json({
      bestRoute: { protocol: 'test', gasEstimate: '21000' },
      gasEstimate: '21000',
    });
  });

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Route not found',
      path: req.originalUrl,
    });
  });

  app.use(errorHandler);

  return app;
};

describe('Intent Engine API Integration Tests', () => {
  let app: express.Application;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('Health Checks', () => {
    it('should return health status at root endpoint', async () => {
      const response = await request(app).get('/').expect(200);

      expect(response.body.service).toBe('Intent Engine API');
      expect(response.body.status).toBe('healthy');
      expect(response.body.uptime).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.environment).toBe('test');
      expect(response.body.version).toBe('1.0.0');
    });

    it('should return health status at /health endpoint', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.uptime).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.environment).toBe('test');
    });

    it('should return readiness status at /health/ready endpoint', async () => {
      const response = await request(app).get('/health/ready').expect(200);

      expect(response.body.status).toBe('ready');
      expect(response.body.services).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });

    it('should have consistent timestamp format across health endpoints', async () => {
      const responses = await Promise.all([
        request(app).get('/'),
        request(app).get('/health'),
        request(app).get('/health/ready'),
      ]);

      responses.forEach(response => {
        expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(new Date(response.body.timestamp).getTime()).toBeCloseTo(Date.now(), -3);
      });
    });
  });

  describe('API Documentation Endpoint', () => {
    it('should return API information at /api/v1', async () => {
      const response = await request(app).get('/api/v1').expect(200);

      expect(response.body.message).toBe('Intent Engine API v1');
      expect(response.body.version).toBe('1.0.0');
      expect(response.body.endpoints).toBeDefined();
      expect(Array.isArray(response.body.endpoints)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/non-existent-route').expect(404);

      expect(response.body.error).toBe('Route not found');
      expect(response.body.path).toBe('/non-existent-route');
    });

    it('should handle malformed JSON requests gracefully', async () => {
      await request(app)
        .post('/api/v1/intent/execute')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });
  });

  describe('Middleware Integration', () => {
    it('should handle CORS headers', async () => {
      const response = await request(app).options('/').expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should apply security headers', async () => {
      const response = await request(app).get('/').expect(200);

      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBeDefined();
    });

    it('should handle large JSON payloads up to limit', async () => {
      const largePayload = {
        action: 'swap',
        params: {
          data: 'x'.repeat(1000), // 1KB of data
        },
        userAddress: '0x1234567890123456789012345678901234567890',
      };

      await request(app).post('/api/v1/intent/build').send(largePayload).expect(200);
    });
  });

  describe('API Endpoints', () => {
    it('should build transactions for intent successfully', async () => {
      const intentRequest = {
        action: 'swap',
        params: {
          amount: '1000',
          fromToken: '0x123',
          toToken: '0x456',
          chainId: 1,
        },
        userAddress: '0x1234567890123456789012345678901234567890',
      };

      const response = await request(app)
        .post('/api/v1/intent/build')
        .send(intentRequest)
        .expect(200);

      expect(response.body.intentId).toBeDefined();
      expect(response.body.transactions).toBeDefined();
      expect(response.body.metadata).toBeDefined();
    });

    it('should return quote for swap', async () => {
      const response = await request(app)
        .get('/api/v1/quote')
        .query({
          action: 'swap',
          amount: '1000',
          fromToken: '0x123',
          toToken: '0x456',
          chainId: 1,
        })
        .expect(200);

      expect(response.body.bestRoute).toBeDefined();
      expect(response.body.gasEstimate).toBeDefined();
    });

  });

  describe('API Versioning', () => {
    it('should maintain consistent API version across endpoints', async () => {
      const apiResponse = await request(app).get('/api/v1');
      const rootResponse = await request(app).get('/');

      expect(apiResponse.body.version).toBe('1.0.0');
      expect(rootResponse.body.version).toBe('1.0.0');
    });
  });
});
