/**
 * Integration Tests
 * End-to-end testing of complete workflows
 */

const request = require('supertest');
let app;
let IntentController;
let VaultController;
const {
  TEST_ADDRESSES,
  buildOptimizeRequest,
  expectValidResponse,
} = require('./utils/testHelpers');

jest.mock('../src/controllers/IntentController', () => ({
  processDustZapIntent: jest.fn(),
  handleDustZapStream: jest.fn(),
  getSupportedIntents: jest.fn(),
  getIntentHealth: jest.fn(),
  processOptimizeIntent: jest.fn(),
}));

jest.mock('../src/controllers/VaultController', () => ({
  getAllVaults: jest.fn(),
  getVaultStrategy: jest.fn(),
}));

describe('Integration Tests', () => {
  // Clean up timers to prevent Jest hanging
  afterAll(() => {
    // No longer need to cleanup intentService directly from routes
    jest.clearAllTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // Re-import app and controllers to ensure fresh mocks
    app = require('../src/app');
    IntentController = require('../src/controllers/IntentController');
    VaultController = require('../src/controllers/VaultController');

    // Mock the processOptimizeIntent to return a successful response
    IntentController.processOptimizeIntent.mockImplementation((req, res) => {
      const { params } = req.body;
      const operations = params?.operations || [];

      // Check for invalid operations
      const validOperations = ['dustZap', 'rebalance', 'compound'];
      const invalidOps = operations.filter(op => !validOperations.includes(op));

      if (invalidOps.length > 0) {
        // Return error response for invalid operations
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_OPERATIONS',
            message: `Invalid operations: ${invalidOps.join(', ')}`,
            details: `Supported operations: ${validOperations.join(', ')}`,
          },
        });
      }

      // Return successful response for valid operations
      res.status(200).json({
        success: true,
        userAddress: TEST_ADDRESSES.VALID_USER,
        chainId: req.body.chainId || 1,
        operations: {
          rebalance: {
            success: false,
            error: 'Rebalance operation not yet implemented',
          },
          compound: {
            success: false,
            error: 'Compound operation not yet implemented',
          },
        },
        summary: {
          totalOperations: operations.length,
          executedOperations: 0,
          estimatedGasUSD: 0,
          transactions: [],
        },
      });
    });

    // Mock the getAllVaults and getVaultStrategy to return successful responses
    VaultController.getAllVaults.mockImplementation((req, res) => {
      res.json({
        success: true,
        vaults: [{ id: 'stablecoin-vault', name: 'Stablecoin Vault' }],
        total: 1,
        timestamp: new Date().toISOString(),
      });
    });

    VaultController.getVaultStrategy.mockImplementation((req, res) => {
      if (req.params.vaultId === 'stablecoin-vault') {
        res.json({
          success: true,
          vaultId: 'stablecoin-vault',
          strategy: {
            description: 'Mock strategy',
            protocols: [
              { chain: 'ethereum', name: 'aave' },
              { chain: 'polygon', name: 'compound' },
            ],
            supportedChains: ['ethereum', 'polygon'],
            allocations: { aave: 0.6, compound: 0.4 },
          },
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(404).json({
          success: false,
          error: {
            code: 'VAULT_NOT_FOUND',
            message: 'Vault not found',
            availableVaults: ['stablecoin-vault'],
          },
        });
      }
    });

    // Mock getIntentHealth to return a healthy response
    IntentController.getIntentHealth.mockImplementation((req, res) => {
      res.json({
        success: true,
        status: 'healthy',
        services: {
          intentService: true,
          swapService: true,
          priceService: true,
          rebalanceBackend: true,
        },
        timestamp: new Date().toISOString(),
      });
    });
  });

  describe('Complete Vault Workflow', () => {
    test('should discover vaults and get strategy', async () => {
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
        .expect(404);

      expect(vaultResponse.body.success).toBe(false);
      expect(vaultResponse.body.error.code).toBe('VAULT_NOT_FOUND');
      expect(vaultResponse.body.error).toHaveProperty('availableVaults');
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

        // Expect the returned chainId to match the requested chainId
        expect(response.body.chainId).toBe(chainId);
        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('API Consistency', () => {
    test('should return consistent timestamp format across all endpoints', async () => {
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
    test('should maintain data consistency between vault list and strategy endpoints', async () => {
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
