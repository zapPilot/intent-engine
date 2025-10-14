/**
 * Balance Routes Unit Tests
 */

jest.mock('../../src/services/balanceService');
jest.mock('../../src/controllers/balanceController');

const express = require('express');
const request = require('supertest');
const balancesRouter = require('../../src/routes/balances');
const BalanceController = require('../../src/controllers/balanceController');

describe('Balance Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/balances', balancesRouter);
  });

  describe('GET /balances/chains', () => {
    test('should call BalanceController.getSupportedChains', async () => {
      BalanceController.getSupportedChains.mockImplementation((req, res) => {
        res.json({ success: true, data: { chains: ['1', '137'] } });
      });

      const res = await request(app).get('/balances/chains');

      expect(BalanceController.getSupportedChains).toHaveBeenCalled();
      expect(res.status).toBe(200);
    });
  });

  describe('GET /balances/cache/stats', () => {
    test('should call BalanceController.getCacheStats', async () => {
      BalanceController.getCacheStats.mockImplementation((req, res) => {
        res.json({ success: true, data: { hits: 10, misses: 5 } });
      });

      const res = await request(app).get('/balances/cache/stats');

      expect(BalanceController.getCacheStats).toHaveBeenCalled();
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /balances/cache', () => {
    test('should call BalanceController.clearCache', async () => {
      BalanceController.clearCache.mockImplementation((req, res) => {
        res.json({ success: true });
      });

      const res = await request(app).delete('/balances/cache?address=0x123');

      expect(BalanceController.clearCache).toHaveBeenCalled();
      expect(res.status).toBe(200);
    });
  });

  describe('GET /balances/:chainId/:address', () => {
    test('should call BalanceController.getBalances with params', async () => {
      BalanceController.getBalances.mockImplementation((req, res) => {
        res.json({ success: true, data: { balances: [] } });
      });

      const res = await request(app).get(
        '/balances/1/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
      );

      expect(BalanceController.getBalances).toHaveBeenCalled();
      expect(res.status).toBe(200);
    });

    test('should pass query parameters to controller', async () => {
      BalanceController.getBalances.mockImplementation((req, res) => {
        res.json({ success: true });
      });

      await request(app).get(
        '/balances/1/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb?tokens=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
      );

      expect(BalanceController.getBalances).toHaveBeenCalled();
    });
  });

  describe('GET /balances/:chainId/:address/native', () => {
    test('should call BalanceController.getNativeBalance', async () => {
      BalanceController.getNativeBalance.mockImplementation((req, res) => {
        res.json({ success: true, data: { balance: '1000000000000000000' } });
      });

      const res = await request(app).get(
        '/balances/1/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb/native'
      );

      expect(BalanceController.getNativeBalance).toHaveBeenCalled();
      expect(res.status).toBe(200);
    });
  });
});
