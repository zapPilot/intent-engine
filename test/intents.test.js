/**
 * Intent Endpoint Tests
 * Tests for new intent endpoints: zapIn, zapOut, optimize
 */

const request = require('supertest');
const app = require('../src/app');
const {
  TEST_ADDRESSES,
  buildZapInRequest,
  buildZapOutRequest,
  buildOptimizeRequest,
  expectErrorResponse,
} = require('./utils/testHelpers');

describe('Intent API Endpoints', () => {
  describe('POST /api/v1/intents/zapIn', () => {
    describe('Input Validation', () => {
      test('should validate required parameters', async () => {
        const response = await request(app)
          .post('/api/v1/intents/zapIn')
          .send({
            userAddress: TEST_ADDRESSES.VALID_USER,
            chainId: 1,
            params: {}, // Missing required params
          })
          .expect(400);

        expectErrorResponse(response, 'INVALID_INPUT');
        expect(response.body.error.message).toContain(
          'fromToken, vault, and amount are required'
        );
      });

      test('should validate userAddress format', async () => {
        const response = await request(app)
          .post('/api/v1/intents/zapIn')
          .send({
            userAddress: 'invalid-address',
            chainId: 1,
            params: {
              fromToken: TEST_ADDRESSES.VALID_TOKEN,
              vault: 'stablecoin-vault',
              amount: '1000000000000000000',
            },
          })
          .expect(400);

        expectErrorResponse(response, 'INVALID_INPUT');
        expect(response.body.error.message).toContain('Invalid userAddress');
      });

      test('should validate chainId', async () => {
        const response = await request(app)
          .post('/api/v1/intents/zapIn')
          .send({
            userAddress: TEST_ADDRESSES.VALID_USER,
            chainId: 'invalid',
            params: {
              fromToken: TEST_ADDRESSES.VALID_TOKEN,
              vault: 'stablecoin-vault',
              amount: '1000000000000000000',
            },
          })
          .expect(400);

        expectErrorResponse(response, 'INVALID_INPUT');
        expect(response.body.error.message).toContain('Invalid chainId');
      });

      test('should accept valid zapIn request', async () => {
        const validRequest = buildZapInRequest();

        const response = await request(app)
          .post('/api/v1/intents/zapIn')
          .send(validRequest)
          .expect(501); // Not implemented yet

        expectErrorResponse(response, 'NOT_IMPLEMENTED');
        expect(response.body.error).toHaveProperty('expectedParams');
      });
    });

    describe('Parameter Validation', () => {
      test('should validate vault parameter', async () => {
        const request_data = buildZapInRequest({ vault: '' });

        const response = await request(app)
          .post('/api/v1/intents/zapIn')
          .send(request_data)
          .expect(400);

        expectErrorResponse(response, 'INVALID_INPUT');
      });

      test('should validate amount parameter', async () => {
        const request_data = buildZapInRequest({ amount: '' });

        const response = await request(app)
          .post('/api/v1/intents/zapIn')
          .send(request_data)
          .expect(400);

        expectErrorResponse(response, 'INVALID_INPUT');
      });

      test('should validate fromToken parameter', async () => {
        const request_data = buildZapInRequest({ fromToken: '' });

        const response = await request(app)
          .post('/api/v1/intents/zapIn')
          .send(request_data)
          .expect(400);

        expectErrorResponse(response, 'INVALID_INPUT');
      });
    });
  });

  describe('POST /api/v1/intents/zapOut', () => {
    describe('Input Validation', () => {
      test('should validate required parameters', async () => {
        const response = await request(app)
          .post('/api/v1/intents/zapOut')
          .send({
            userAddress: TEST_ADDRESSES.VALID_USER,
            chainId: 1,
            params: {}, // Missing required params
          })
          .expect(400);

        expectErrorResponse(response, 'INVALID_INPUT');
        expect(response.body.error.message).toContain(
          'vault, percentage, and toToken are required'
        );
      });

      test('should validate percentage range', async () => {
        const request_data = buildZapOutRequest({ percentage: 150 });

        const response = await request(app)
          .post('/api/v1/intents/zapOut')
          .send(request_data)
          .expect(400);

        expectErrorResponse(response, 'INVALID_INPUT');
        expect(response.body.error.message).toContain(
          'percentage must be between 0 and 100'
        );
      });

      test('should validate negative percentage', async () => {
        const request_data = buildZapOutRequest({ percentage: -10 });

        const response = await request(app)
          .post('/api/v1/intents/zapOut')
          .send(request_data)
          .expect(400);

        expectErrorResponse(response, 'INVALID_INPUT');
        expect(response.body.error.message).toContain(
          'percentage must be between 0 and 100'
        );
      });

      test('should accept valid zapOut request', async () => {
        const validRequest = buildZapOutRequest();

        const response = await request(app)
          .post('/api/v1/intents/zapOut')
          .send(validRequest)
          .expect(501);

        expectErrorResponse(response, 'NOT_IMPLEMENTED');
        expect(response.body.error).toHaveProperty('expectedParams');
      });
    });

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
    describe('Input Validation', () => {
      test('should validate operations parameter', async () => {
        const response = await request(app)
          .post('/api/v1/intents/optimize')
          .send({
            userAddress: TEST_ADDRESSES.VALID_USER,
            chainId: 1,
            params: {
              operations: 'invalid', // Should be array
            },
          })
          .expect(400);

        expectErrorResponse(response, 'INVALID_INPUT');
        expect(response.body.error.message).toContain(
          'operations must be a non-empty array'
        );
      });

      test('should validate operations content', async () => {
        const response = await request(app)
          .post('/api/v1/intents/optimize')
          .send({
            userAddress: TEST_ADDRESSES.VALID_USER,
            chainId: 1,
            params: {
              operations: ['invalid-operation'],
            },
          })
          .expect(400);

        expectErrorResponse(response, 'INVALID_INPUT');
        expect(response.body.error.message).toContain('Invalid operations');
        expect(response.body.error.details).toHaveProperty('validOperations');
        expect(response.body.error.details).toHaveProperty('invalidOperations');
      });

      test('should reject empty operations array', async () => {
        const response = await request(app)
          .post('/api/v1/intents/optimize')
          .send({
            userAddress: TEST_ADDRESSES.VALID_USER,
            chainId: 1,
            params: {
              operations: [],
            },
          })
          .expect(400);

        expectErrorResponse(response, 'INVALID_INPUT');
        expect(response.body.error.message).toContain(
          'operations must be a non-empty array'
        );
      });
    });

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
});
