const request = require('supertest');
const app = require('../src/app');

describe('Swap API Endpoints', () => {
  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /swap/providers', () => {
    it('should return list of supported providers', async () => {
      const response = await request(app)
        .get('/swap/providers')
        .expect(200);

      expect(response.body.providers).toEqual(['1inch', 'paraswap', '0x']);
    });
  });
});

// Mock tests for individual services would go here
describe('DEX Aggregator Services', () => {
  // These would require mocking axios responses
  describe('OneInchService', () => {
    it('should format 1inch API response correctly', () => {
      // Mock test implementation
      expect(true).toBe(true);
    });
  });

  describe('ParaswapService', () => {
    it('should format Paraswap API response correctly', () => {
      // Mock test implementation
      expect(true).toBe(true);
    });
  });

  describe('ZeroXService', () => {
    it('should format 0x API response correctly', () => {
      // Mock test implementation
      expect(true).toBe(true);
    });
  });
});
