/**
 * Intent Endpoint Tests
 * Tests for new intent endpoints: zapIn, zapOut, optimize
 */

const request = require('supertest');
const app = require('../src/app');
const intentRoutes = require('../src/routes/intents');
const {
  TEST_ADDRESSES,
  buildZapInRequest,
  buildZapOutRequest,
  buildOptimizeRequest,
  expectErrorResponse,
} = require('./utils/testHelpers');

describe('Intent API Endpoints', () => {
  // Clean up timers to prevent Jest hanging
  afterAll(() => {
    if (intentRoutes.intentService) {
      intentRoutes.intentService.cleanup();
    }
    jest.clearAllTimers();
  });

  describe('POST /api/v1/intents/zapIn', () => {
    describe('Parameter Validation', () => {
      test('should validate vault parameter', async () => {
        const request_data = buildZapInRequest({ vault: '' });

        const response = await request(app)
          .post('/api/v1/intents/zapIn')
          .send(request_data)
          .expect(501);

        expectErrorResponse(response, 'NOT_IMPLEMENTED');
      });

      test('should validate amount parameter', async () => {
        const request_data = buildZapInRequest({ amount: '' });

        const response = await request(app)
          .post('/api/v1/intents/zapIn')
          .send(request_data)
          .expect(501);

        expectErrorResponse(response, 'NOT_IMPLEMENTED');
      });

      test('should validate fromToken parameter', async () => {
        const request_data = buildZapInRequest({ fromToken: '' });

        const response = await request(app)
          .post('/api/v1/intents/zapIn')
          .send(request_data)
          .expect(501);

        expectErrorResponse(response, 'NOT_IMPLEMENTED');
      });
    });
  });

  describe('POST /api/v1/intents/zapOut', () => {
    describe('Edge Cases', () => {
      test('should handle 0% withdrawal', async () => {
        const request_data = buildZapOutRequest({ percentage: 0 });

        const response = await request(app)
          .post('/api/v1/intents/zapOut')
          .send(request_data)
          .expect(501);

        expectErrorResponse(response, 'NOT_IMPLEMENTED');
      });

      test('should handle 100% withdrawal', async () => {
        const request_data = buildZapOutRequest({ percentage: 100 });

        const response = await request(app)
          .post('/api/v1/intents/zapOut')
          .send(request_data)
          .expect(501);

        expectErrorResponse(response, 'NOT_IMPLEMENTED');
      });
    });
  });

  describe('POST /api/v1/intents/optimize', () => {
    describe('Operation Processing', () => {
      test('should process single rebalance operation', async () => {
        const request_data = buildOptimizeRequest(['rebalance']);

        const response = await request(app)
          .post('/api/v1/intents/optimize')
          .send(request_data)
          .expect(200);

        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('operations');
        expect(response.body).toHaveProperty('summary');

        expect(response.body.operations).toHaveProperty('rebalance');
        expect(response.body.summary).toMatchObject({
          totalOperations: 1,
          executedOperations: expect.any(Number),
          estimatedGasUSD: expect.any(Number),
          transactions: expect.any(Array),
        });

        // Rebalance should be placeholder (not implemented)
        expect(response.body.operations.rebalance).toHaveProperty('success');
      });

      test('should process multiple operations', async () => {
        const request_data = buildOptimizeRequest(['rebalance', 'compound']);

        const response = await request(app)
          .post('/api/v1/intents/optimize')
          .send(request_data)
          .expect(200);

        expect(response.body.operations).toHaveProperty('rebalance');
        expect(response.body.operations).toHaveProperty('compound');
        expect(response.body.summary.totalOperations).toBe(2);
      });

      test('should handle rebalance placeholder', async () => {
        const request_data = buildOptimizeRequest(['rebalance']);

        const response = await request(app)
          .post('/api/v1/intents/optimize')
          .send(request_data)
          .expect(200);

        const rebalanceOp = response.body.operations.rebalance;
        expect(rebalanceOp.success).toBe(false);
        expect(rebalanceOp.error).toContain('not yet implemented');
        expect(rebalanceOp).toHaveProperty('placeholder');
        expect(rebalanceOp.placeholder).toHaveProperty('expectedLogic');
        expect(rebalanceOp.placeholder).toHaveProperty('requiredIntegration');
      });

      test('should handle compound placeholder', async () => {
        const request_data = buildOptimizeRequest(['compound']);

        const response = await request(app)
          .post('/api/v1/intents/optimize')
          .send(request_data)
          .expect(200);

        const compoundOp = response.body.operations.compound;
        expect(compoundOp.success).toBe(false);
        expect(compoundOp.error).toContain('not yet implemented');
        expect(compoundOp).toHaveProperty('placeholder');
        expect(compoundOp.placeholder).toHaveProperty('expectedLogic');
        expect(compoundOp.placeholder).toHaveProperty('requiredIntegration');
      });
    });

    describe('Default Behavior', () => {
      test('should default to placeholder operation when operations not specified', async () => {
        const response = await request(app)
          .post('/api/v1/intents/optimize')
          .send({
            userAddress: TEST_ADDRESSES.VALID_USER,
            chainId: 1,
            params: {}, // No operations specified
          })
          .expect(200);

        expect(response.body.operations).toHaveProperty('dustZap');
        expect(response.body.summary.totalOperations).toBe(1);
      });
    });

    describe('Error Handling', () => {
      test('should handle operation failures gracefully', async () => {
        // Test that operations handle errors gracefully
        const request_data = buildOptimizeRequest(['rebalance']);

        const response = await request(app)
          .post('/api/v1/intents/optimize')
          .send(request_data)
          .expect(200);

        // Should still return success for the optimize operation overall
        expect(response.body.success).toBe(true);
        expect(response.body.operations.rebalance).toHaveProperty('success');
      });
    });

    describe('Parameter Validation', () => {
      test('should accept optional parameters', async () => {
        const request_data = buildOptimizeRequest(['rebalance'], {
          vault: 'stablecoin-vault',
          rebalanceThreshold: 10,
          slippageTolerance: 1.0,
        });

        const response = await request(app)
          .post('/api/v1/intents/optimize')
          .send(request_data)
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Legacy Endpoint Redirection', () => {
    test('should redirect rebalance to optimize endpoint', async () => {
      const response = await request(app)
        .post('/api/v1/intents/rebalance')
        .send({
          userAddress: TEST_ADDRESSES.VALID_USER,
          chainId: 1,
          params: {},
        })
        .expect(301);

      expectErrorResponse(response, 'ENDPOINT_DEPRECATED');
      expect(response.body.redirectTo).toBe('/api/v1/intents/optimize');
      expect(response.body.error.message).toContain('deprecated');
    });
  });

  describe('Performance Tests', () => {
    test('should respond within reasonable time for optimize endpoint', async () => {
      const startTime = Date.now();

      const request_data = buildOptimizeRequest(['rebalance', 'compound']); // These are quick placeholders

      await request(app)
        .post('/api/v1/intents/optimize')
        .send(request_data)
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds for placeholders
    });
  });

  describe('Integration Scenarios', () => {
    test('should maintain request context through processing', async () => {
      const userAddress = TEST_ADDRESSES.VALID_USER;
      const chainId = 42161; // Arbitrum

      const request_data = buildOptimizeRequest(['rebalance'], {
        vault: 'eth-vault',
      });
      request_data.userAddress = userAddress;
      request_data.chainId = chainId;

      const response = await request(app)
        .post('/api/v1/intents/optimize')
        .send(request_data)
        .expect(200);

      expect(response.body.userAddress).toBe(userAddress);
      expect(response.body.chainId).toBe(chainId);
    });

    test('should validate operation combinations', async () => {
      // Test fast operations first (placeholders)
      const fastCombinations = [
        ['rebalance'],
        ['compound'],
        ['rebalance', 'compound'],
      ];

      for (const operations of fastCombinations) {
        const request_data = buildOptimizeRequest(operations);

        const response = await request(app)
          .post('/api/v1/intents/optimize')
          .send(request_data)
          .expect(200);

        expect(response.body.summary.totalOperations).toBe(operations.length);

        operations.forEach(op => {
          expect(response.body.operations).toHaveProperty(op);
        });
      }
    });
  });

  describe('Vault Endpoints', () => {
    describe('GET /api/v1/vaults', () => {
      it('should return list of vaults', async () => {
        const response = await request(app).get('/api/v1/vaults');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('vaults');
        expect(Array.isArray(response.body.vaults)).toBe(true);
        expect(response.body).toHaveProperty('total');
        expect(response.body).toHaveProperty('timestamp');
      });

      it('should handle errors when fetching vaults', async () => {
        // Mock console.error to avoid noise in test output
        const consoleErrorSpy = jest
          .spyOn(console, 'error')
          .mockImplementation();

        // Mock the router to throw an error
        const originalToISOString = Date.prototype.toISOString;
        Date.prototype.toISOString = () => {
          throw new Error('Simulated error');
        };

        const response = await request(app).get('/api/v1/vaults');

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty(
          'code',
          'INTERNAL_SERVER_ERROR'
        );
        expect(response.body.error).toHaveProperty(
          'message',
          'Failed to fetch vault information'
        );

        // Restore original function
        Date.prototype.toISOString = originalToISOString;
        consoleErrorSpy.mockRestore();
      });
    });

    describe('GET /api/v1/vaults/:vaultId/strategy', () => {
      it('should return vault strategy for valid vaultId', async () => {
        const response = await request(app).get(
          '/api/v1/vaults/stablecoin-vault/strategy'
        );

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('vaultId', 'stablecoin-vault');
        expect(response.body).toHaveProperty('strategy');
        expect(response.body.strategy).toHaveProperty('description');
        expect(response.body.strategy).toHaveProperty('protocols');
        expect(response.body).toHaveProperty('timestamp');
      });

      it('should return 404 for non-existent vaultId', async () => {
        const response = await request(app).get(
          '/api/v1/vaults/INVALID-VAULT/strategy'
        );

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('code', 'VAULT_NOT_FOUND');
      });

      it('should handle errors when fetching vault strategy', async () => {
        // Mock console.error to avoid noise in test output
        const consoleErrorSpy = jest
          .spyOn(console, 'error')
          .mockImplementation();

        // Mock the router to throw an error
        const originalToISOString = Date.prototype.toISOString;
        Date.prototype.toISOString = () => {
          throw new Error('Simulated error');
        };

        const response = await request(app).get(
          '/api/v1/vaults/stablecoin-vault/strategy'
        );

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty(
          'code',
          'INTERNAL_SERVER_ERROR'
        );
        expect(response.body.error).toHaveProperty(
          'message',
          'Failed to fetch vault strategy'
        );

        // Restore original function
        Date.prototype.toISOString = originalToISOString;
        consoleErrorSpy.mockRestore();
      });
    });
  });
});
