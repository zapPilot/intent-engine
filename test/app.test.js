const request = require('supertest');
const app = require('../src/app');

// Mock the modules
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

jest.mock('../src/config/swaggerConfig', () => ({
  swaggerSpec: {
    info: {
      title: 'Test API',
      version: '1.0.0',
    },
  },
}));

describe('App', () => {
  // Store reference to any intentService instances for cleanup
  let isolatedIntentService;

  // Clean up timers after each test to prevent Jest from hanging
  afterEach(() => {
    jest.clearAllTimers();
  });

  // Clean up any isolated module instances and main intentService
  afterAll(() => {
    // Clean up the isolated intentService instance
    if (
      isolatedIntentService &&
      typeof isolatedIntentService.cleanup === 'function'
    ) {
      isolatedIntentService.cleanup();
    }

    // Clean up the main intentService instance
    try {
      const intentRoutes = require('../src/routes/intents');
      if (
        intentRoutes.intentService &&
        typeof intentRoutes.intentService.cleanup === 'function'
      ) {
        intentRoutes.intentService.cleanup();
      }
    } catch (error) {
      // Ignore cleanup errors
      console.error('Error cleaning up intentService:', error);
    }
  });
  describe('Health Check Endpoint', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('API Documentation', () => {
    it('should serve swagger UI at /api-docs', async () => {
      const response = await request(app).get('/api-docs/');

      // Swagger UI redirects to /api-docs/ with trailing slash
      expect([200, 301, 302]).toContain(response.status);
    });
  });

  describe('Middleware', () => {
    it('should handle JSON requests', async () => {
      const testData = { test: 'data' };
      const response = await request(app)
        .post('/test-endpoint-that-does-not-exist')
        .send(testData)
        .set('Content-Type', 'application/json');

      // Should get 404 since endpoint doesn't exist, but JSON should be parsed
      expect(response.status).toBe(404);
    });

    it('should handle URL-encoded requests', async () => {
      const response = await request(app)
        .post('/test-endpoint-that-does-not-exist')
        .send('key=value')
        .set('Content-Type', 'application/x-www-form-urlencoded');

      // Should get 404 since endpoint doesn't exist, but form data should be parsed
      expect(response.status).toBe(404);
    });
  });

  describe('Server startup', () => {
    it('should not start server when imported as module', () => {
      // Since we're importing app.js in tests, require.main !== module
      // so the server should not start
      const mockListen = jest.spyOn(app, 'listen');

      // Re-require the module to test the condition
      jest.isolateModules(() => {
        require('../src/app');
        // Capture isolated intentService for cleanup
        const isolatedIntentRoutes = require('../src/routes/intents');
        isolatedIntentService = isolatedIntentRoutes.intentService;
      });

      expect(mockListen).not.toHaveBeenCalled();
      mockListen.mockRestore();
    });
  });

  describe('Error handling', () => {
    it('should handle errors with error middleware', async () => {
      // Test that error handler is properly configured
      // This is implicitly tested by other tests, but we can verify
      // the middleware is in place
      const response = await request(app).get('/non-existent-endpoint');
      expect(response.status).toBe(404);
    });
  });
});
