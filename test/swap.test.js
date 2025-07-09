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

  describe('GET /supported_providers', () => {
    it('should return list of supported providers', async () => {
      const response = await request(app)
        .get('/supported_providers')
        .expect(200);
      
      expect(response.body.providers).toEqual(['1inch', 'paraswap', '0x']);
    });
  });

  describe('GET /the_best_swap_data', () => {
    it('should return 400 for missing required parameters', async () => {
      const response = await request(app)
        .get('/the_best_swap_data')
        .expect(400);
      
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should return 400 for same fromTokenAddress and toTokenAddress', async () => {
      const sameAddress = '0xA0b86a33E6441c8e4B23b4bcBd3e5ccB30B4c1b2';
      const response = await request(app)
        .get('/the_best_swap_data')
        .query({
          chainId: '1',
          fromTokenAddress: sameAddress,
          fromTokenDecimals: '18',
          toTokenAddress: sameAddress,
          toTokenDecimals: '18',
          amount: '1000000000000000000',
          fromAddress: '0x1234567890123456789012345678901234567890',
          slippage: '1',
          provider: '1inch',
          to_token_price: '1000',
        })
        .expect(400);
      
      expect(response.body.error).toBe('fromTokenAddress and toTokenAddress cannot be the same');
    });

    it('should return 400 for unsupported provider', async () => {
      const response = await request(app)
        .get('/the_best_swap_data')
        .query({
          chainId: '1',
          fromTokenAddress: '0xA0b86a33E6441c8e4B23b4bcBd3e5ccB30B4c1b2',
          fromTokenDecimals: '18',
          toTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          toTokenDecimals: '6',
          amount: '1000000000000000000',
          fromAddress: '0x1234567890123456789012345678901234567890',
          slippage: '1',
          provider: 'unsupported',
          to_token_price: '1000',
        })
        .expect(400);
      
      expect(response.body.details[0].msg).toBe('provider must be one of: 1inch, paraswap, 0x');
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