/**
 * Integration Tests
 * End-to-end testing of complete workflows
 */

const request = require('supertest');
const app = require('../src/app');
const intentRoutes = require('../src/routes/intents');
const {
  TEST_ADDRESSES,
  buildOptimizeRequest,
  expectValidResponse,
} = require('./utils/testHelpers');

describe('Integration Tests', () => {
  // Clean up timers to prevent Jest hanging
  afterAll(() => {
    if (intentRoutes.intentService) {
      intentRoutes.intentService.cleanup();
    }
    jest.clearAllTimers();
  });
  describe('Complete Vault Workflow', () => {
    test.skip('should discover vaults and get strategy', async () => {
      // Step 1: Discover available vaults
      const vaultsResponse = await request(app)
        .get('/api/v1/vaults')
        .expect(200);

      expectValidResponse(vaultsResponse, ['vaults']);
      expect(vaultsResponse.body.vaults.length).toBeGreaterThan(0);

      // Step 2: Get strategy for first vault
      const firstVault = vaultsResponse.body.vaults[0];
      const strategyResponse = await request(app)
        .get(`/api/v1/vaults/${firstVault.id}/strategy`)
        .expect(200);

      expectValidResponse(strategyResponse, ['strategy']);
      expect(strategyResponse.body.vaultId).toBe(firstVault.id);
    });
  });

  describe('Multi-Operation Optimize Workflow', () => {
    test('should handle complex optimize request with placeholder operations', async () => {
      const request_data = buildOptimizeRequest(['rebalance', 'compound'], {
        vault: 'stablecoin-vault',
        rebalanceThreshold: 5,
        slippageTolerance: 0.5,
      });

      const response = await request(app)
        .post('/api/v1/intents/optimize')
        .send(request_data)
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('operations');
      expect(response.body).toHaveProperty('summary');

      // Verify all operations are present
      expect(response.body.operations).toHaveProperty('rebalance');
      expect(response.body.operations).toHaveProperty('compound');

      // Verify summary
      expect(response.body.summary.totalOperations).toBe(2);
      expect(response.body.summary).toHaveProperty('executedOperations');
      expect(response.body.summary).toHaveProperty('estimatedGasUSD');
      expect(response.body.summary).toHaveProperty('transactions');

      // Verify each operation has proper structure
      Object.values(response.body.operations).forEach(operation => {
        expect(operation).toHaveProperty('success');
        if (!operation.success) {
          expect(operation).toHaveProperty('error');
        }
      });
    });
  });

  describe('Error Recovery Scenarios', () => {
    test('should handle partial failures in optimize operations', async () => {
      // This tests that if one operation fails, others can still proceed
      const request_data = buildOptimizeRequest(['rebalance']);

      const response = await request(app)
        .post('/api/v1/intents/optimize')
        .send(request_data)
        .expect(200);

      // Optimize should still succeed overall
      expect(response.body.success).toBe(true);
      expect(response.body.operations).toHaveProperty('rebalance');

      // Rebalance should be placeholder (not implemented)
      expect(response.body.operations.rebalance.success).toBe(false);
      expect(response.body.operations.rebalance.error).toContain(
        'not yet implemented'
      );
    });

    test('should handle invalid vault ID gracefully', async () => {
      const vaultResponse = await request(app)
        .get('/api/v1/vaults/invalid-vault-id/strategy')
        .expect(501);

      expect(vaultResponse.body.success).toBe(false);
      expect(vaultResponse.body.error.code).toBe('NOT_IMPLEMENTED');

    });
  });

  describe('Cross-Chain Scenarios', () => {
    test('should handle different chain IDs in optimize requests', async () => {
      const chainIds = [1, 42161, 8453]; // Ethereum, Arbitrum, Base

      for (const chainId of chainIds) {
        const request_data = buildOptimizeRequest(['rebalance']);
        request_data.chainId = chainId;

        const response = await request(app)
          .post('/api/v1/intents/optimize')
          .send(request_data)
          .expect(200);

        expect(response.body.chainId).toBe(chainId);
        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('API Consistency', () => {
    test.skip('should return consistent timestamp format across all endpoints', async () => {
      const endpoints = [
        () => request(app).get('/api/v1/vaults'),
        () => request(app).get('/api/v1/vaults/stablecoin-vault/strategy'),
        () =>
          request(app)
            .post('/api/v1/intents/optimize')
            .send(buildOptimizeRequest(['rebalance'])),
      ];

      for (const endpointCall of endpoints) {
        const response = await endpointCall().expect(200);

        // Only check timestamp for endpoints that include it (not optimize)
        if (response.body.timestamp) {
          expect(typeof response.body.timestamp).toBe('string');
          // Should be valid ISO date
          const date = new Date(response.body.timestamp);
          expect(date.toISOString()).toBe(response.body.timestamp);
        }
      }
    });

    test('should return consistent error format across endpoints', async () => {
      const errorRequests = [
        () => request(app).get('/api/v1/vaults/invalid/strategy'),
        () =>
          request(app).post('/api/v1/intents/zapIn').send({
            userAddress: 'invalid',
            chainId: 1,
            params: {},
          }),
        () =>
          request(app)
            .post('/api/v1/intents/optimize')
            .send({
              userAddress: TEST_ADDRESSES.VALID_USER,
              chainId: 1,
              params: { operations: ['invalid-op'] },
            }),
      ];

      for (const errorRequest of errorRequests) {
        const response = await errorRequest();

        expect(response.body.success).toBe(false);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error).toHaveProperty('message');
        expect(typeof response.body.error.code).toBe('string');
        expect(typeof response.body.error.message).toBe('string');
      }
    });
  });

  describe('Performance Integration', () => {
    test('should handle multiple concurrent optimize requests', async () => {
      const concurrentRequests = 3;
      const requests = Array(concurrentRequests)
        .fill()
        .map(
          () =>
            request(app)
              .post('/api/v1/intents/optimize')
              .send(buildOptimizeRequest(['rebalance'])) // Use fast placeholder
        );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Should handle concurrent requests reasonably fast
      expect(totalTime).toBeLessThan(5000); // 5 seconds for 3 concurrent requests
    });
  });

  describe('Data Validation Integration', () => {
    test.skip('should maintain data consistency between vault list and strategy endpoints', async () => {
      const vaultsResponse = await request(app)
        .get('/api/v1/vaults')
        .expect(200);

      // Test each vault has a working strategy endpoint
      for (const vault of vaultsResponse.body.vaults) {
        const strategyResponse = await request(app)
          .get(`/api/v1/vaults/${vault.id}/strategy`)
          .expect(200);

        expect(strategyResponse.body.vaultId).toBe(vault.id);

        // Supported chains should be consistent
        const strategyChains = strategyResponse.body.strategy.protocols.map(
          p => p.chain
        );
        const uniqueChains = [...new Set(strategyChains)];

        // This is informational - not all vault chains need to be in strategy
        expect(uniqueChains.length).toBeGreaterThan(0);
      }
    });
  });
});
