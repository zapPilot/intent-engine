/**
 * Token Routes Unit Tests
 */

jest.mock('../../src/config/tokenConfig');

const express = require('express');
const request = require('supertest');
const tokensRouter = require('../../src/routes/tokens');
const { TokenConfigService } = require('../../src/config/tokenConfig');

describe('Token Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/tokens', tokensRouter);

    // Mock TokenConfigService
    TokenConfigService.getZapTokens = jest.fn();
    TokenConfigService.getSupportedChains = jest.fn().mockReturnValue([1, 137, 42161, 8453]);
  });

  describe('GET /tokens/zap/:chainId', () => {
    test('should return zap tokens for valid chain', async () => {
      const mockTokens = {
        chainId: 1,
        chainName: 'ethereum',
        nativeToken: 'ETH',
        tokens: [
          {
            symbol: 'USDC',
            name: 'USD Coin',
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            decimals: 6,
            type: 'stablecoin',
          },
        ],
      };

      TokenConfigService.getZapTokens.mockReturnValue(mockTokens);

      const res = await request(app).get('/tokens/zap/1');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(mockTokens);
      expect(TokenConfigService.getZapTokens).toHaveBeenCalledWith(1);
    });

    test('should handle invalid chainId', async () => {
      TokenConfigService.getZapTokens.mockReturnValue(null);

      const res = await request(app).get('/tokens/zap/999');

      expect(res.status).toBe(404);
    });

    test('should handle non-numeric chainId', async () => {
      const res = await request(app).get('/tokens/zap/invalid');

      expect(res.status).toBe(400);
    });

    test('should return tokens for Arbitrum', async () => {
      const mockTokens = {
        chainId: 42161,
        chainName: 'arbitrum',
        nativeToken: 'ETH',
        tokens: [],
      };

      TokenConfigService.getZapTokens.mockReturnValue(mockTokens);

      const res = await request(app).get('/tokens/zap/42161');

      expect(res.status).toBe(200);
      expect(res.body.chainId).toBe(42161);
    });

    test('should return tokens for Base', async () => {
      const mockTokens = {
        chainId: 8453,
        chainName: 'base',
        nativeToken: 'ETH',
        tokens: [],
      };

      TokenConfigService.getZapTokens.mockReturnValue(mockTokens);

      const res = await request(app).get('/tokens/zap/8453');

      expect(res.status).toBe(200);
      expect(res.body.chainId).toBe(8453);
    });

    test('should include token metadata', async () => {
      const mockTokens = {
        chainId: 1,
        chainName: 'ethereum',
        nativeToken: 'ETH',
        tokens: [
          {
            symbol: 'USDC',
            name: 'USD Coin',
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            decimals: 6,
            type: 'stablecoin',
            coingeckoId: 'usd-coin',
          },
        ],
      };

      TokenConfigService.getZapTokens.mockReturnValue(mockTokens);

      const res = await request(app).get('/tokens/zap/1');

      expect(res.body.tokens[0]).toHaveProperty('symbol');
      expect(res.body.tokens[0]).toHaveProperty('address');
      expect(res.body.tokens[0]).toHaveProperty('decimals');
    });
  });
});
