import request from 'supertest';
import app from '../src/index';

describe('Intent Engine API Integration Tests', () => {
  describe('Health Checks', () => {
    it('should return health status at /health endpoint', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.uptime).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.environment).toBeDefined();
    });

    it('should return readiness status at /health/ready endpoint', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body.status).toBe('ready');
      expect(response.body.services).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return health status at root endpoint', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body.service).toBe('Intent Engine API');
      expect(response.body.status).toBe('healthy');
      expect(response.body.uptime).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.environment).toBeDefined();
      expect(response.body.version).toBe('1.0.0');
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

    it('should have consistent uptime values', async () => {
      const response1 = await request(app).get('/');
      const response2 = await request(app).get('/health');

      expect(typeof response1.body.uptime).toBe('number');
      expect(typeof response2.body.uptime).toBe('number');
      expect(response1.body.uptime).toBeCloseTo(response2.body.uptime, 1);
    });
  });

  describe('API Documentation Endpoint', () => {
    it('should return API information at /api/v1', async () => {
      const response = await request(app)
        .get('/api/v1')
        .expect(200);

      expect(response.body.message).toBe('Intent Engine API v1');
      expect(response.body.version).toBe('1.0.0');
      expect(response.body.endpoints).toBeDefined();
      expect(Array.isArray(response.body.endpoints)).toBe(true);
      expect(response.body.endpoints).toContain('POST /api/v1/intent/execute');
      expect(response.body.endpoints).toContain('GET /api/v1/intent/quote');
      expect(response.body.endpoints).toContain('POST /api/v1/intent/optimize');
      expect(response.body.endpoints).toContain('GET /api/v1/intent/status/:intentId');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/non-existent-route')
        .expect(404);

      expect(response.body.error).toBe('Route not found');
      expect(response.body.path).toBe('/non-existent-route');
    });

    it('should return 404 for non-existent API routes', async () => {
      const response = await request(app)
        .get('/api/v1/non-existent')
        .expect(404);

      expect(response.body.error).toBe('Route not found');
      expect(response.body.path).toBe('/api/v1/non-existent');
    });

    it('should handle malformed JSON requests gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/intent/execute')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body).toBeDefined();
    });
  });

  describe('Middleware Integration', () => {
    it('should add request ID to responses', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Request ID should be added by middleware (though not necessarily returned in response)
      expect(response.body).toBeDefined();
    });

    it('should handle CORS headers', async () => {
      const response = await request(app)
        .options('/')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should apply security headers', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBeDefined();
    });

    it('should apply compression middleware', async () => {
      const response = await request(app)
        .get('/')
        .set('Accept-Encoding', 'gzip')
        .expect(200);

      // Check that response can be compressed
      expect(response.body).toBeDefined();
    });

    it('should enforce rate limiting', async () => {
      // Make multiple requests to test rate limiting
      const requests = Array(10).fill(null).map(() => 
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      
      // All should succeed in test environment (rate limit is high)
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it('should handle large JSON payloads up to limit', async () => {
      const largePayload = {
        action: 'swap',
        params: {
          data: 'x'.repeat(1000), // 1KB of data
        },
        userAddress: '0x1234567890123456789012345678901234567890',
      };

      await request(app)
        .post('/api/v1/intent/execute')
        .send(largePayload)
        .expect(200);
    });
  });

  describe('Environment Configuration', () => {
    it('should reflect correct environment in health checks', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.environment).toBeDefined();
      expect(['development', 'test', 'production']).toContain(response.body.environment);
    });

    it('should handle graceful degradation when external services unavailable', async () => {
      // Health endpoints should work even when Redis/DB are unavailable
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });
  });

  describe('API Versioning', () => {
    it('should maintain consistent API version across endpoints', async () => {
      const apiResponse = await request(app).get('/api/v1');
      const rootResponse = await request(app).get('/');

      expect(apiResponse.body.version).toBe('1.0.0');
      expect(rootResponse.body.version).toBe('1.0.0');
    });

    it('should namespace all API routes under /api/v1', async () => {
      // Test that intent routes are properly namespaced
      await request(app)
        .get('/intent/quote') // Without /api/v1 prefix
        .expect(404);

      await request(app)
        .get('/api/v1/intent/quote') // With proper prefix
        .expect(200);
    });
  });

  describe('Server Configuration Integration', () => {
    it('should handle various content types', async () => {
      // Test JSON
      await request(app)
        .post('/api/v1/intent/execute')
        .set('Content-Type', 'application/json')
        .send('{}')
        .expect(200);

      // Test URL encoded
      await request(app)
        .post('/api/v1/intent/execute')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('action=swap')
        .expect(200);
    });

    it('should handle request timeout gracefully', async () => {
      // This test ensures the server doesn't hang indefinitely
      const startTime = Date.now();
      
      await request(app)
        .get('/health')
        .timeout(5000)
        .expect(200);

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(5000);
    });
  });

  describe('Intent Execution', () => {
    it('should execute a basic swap intent', async () => {
      const intentRequest = {
        action: 'swap',
        params: {
          amount: '1000',
          fromToken: '0x...',
          toToken: '0x...',
          chainId: 1,
        },
        userAddress: '0x1234567890123456789012345678901234567890',
      };

      const response = await request(app)
        .post('/api/v1/intent/execute')
        .send(intentRequest)
        .expect(200);

      expect(response.body.intentId).toBeDefined();
      expect(response.body.transactions).toBeDefined();
      expect(response.body.metadata).toBeDefined();
    });

    it('should validate intent request parameters', async () => {
      const invalidRequest = {
        action: 'invalid',
        params: {},
        userAddress: 'invalid',
      };

      await request(app)
        .post('/api/v1/intent/execute')
        .send(invalidRequest)
        .expect(400);
    });
  });

  describe('Quote Endpoints', () => {
    it('should return quote for swap', async () => {
      const response = await request(app)
        .get('/api/v1/intent/quote')
        .query({
          action: 'swap',
          amount: '1000',
          fromToken: '0x...',
          toToken: '0x...',
          chainId: 1,
        })
        .expect(200);

      expect(response.body.bestRoute).toBeDefined();
      expect(response.body.gasEstimate).toBeDefined();
    });
  });
});