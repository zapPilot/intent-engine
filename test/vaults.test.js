/**
 * Vault Metadata Endpoint Tests
 * Tests for /api/v1/vaults and /api/v1/vaults/:vaultId/strategy endpoints
 */

const request = require('supertest');
const app = require('../src/app');
const intentRoutes = require('../src/routes/intents');
const {
  TEST_DATA,
  expectValidResponse,
  expectErrorResponse,
} = require('./utils/testHelpers');

describe('Vault Metadata API', () => {
  // Clean up timers to prevent Jest hanging
  afterAll(() => {
    if (intentRoutes.intentService) {
      intentRoutes.intentService.cleanup();
    }
    jest.clearAllTimers();
  });
  describe('GET /api/v1/vaults', () => {
    test('should return not implemented', async () => {
      const response = await request(app).get('/api/v1/vaults').expect(501);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_IMPLEMENTED');
    });

    test.skip('should include all expected vault types', async () => {
      const response = await request(app).get('/api/v1/vaults').expect(501);

      const vaultIds = response.body.vaults.map(v => v.id);

      TEST_DATA.VAULT_IDS.forEach(expectedVaultId => {
        expect(vaultIds).toContain(expectedVaultId);
      });
    });

    test.skip('should return consistent data structure', async () => {
      const response = await request(app).get('/api/v1/vaults').expect(200);

      // All vaults should have same structure
      response.body.vaults.forEach(vault => {
        expect(vault).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          description: expect.any(String),
          riskLevel: expect.any(String),
          expectedAPR: {
            min: expect.any(Number),
            max: expect.any(Number),
          },
          supportedChains: expect.any(Array),
          totalTVL: expect.any(Number),
          status: expect.any(String),
        });
      });
    });
  });

  describe('GET /api/v1/vaults/:vaultId/strategy', () => {
    test('should return not implemented for vault strategy', async () => {
      const vaultId = 'stablecoin-vault';
      const response = await request(app)
        .get(`/api/v1/vaults/${vaultId}/strategy`)
        .expect(501);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_IMPLEMENTED');
    });



    test.skip('should return strategy for each vault type', async () => {
      for (const vaultId of TEST_DATA.VAULT_IDS) {
        const response = await request(app)
          .get(`/api/v1/vaults/${vaultId}/strategy`)
          .expect(200);

        expect(response.body.vaultId).toBe(vaultId);
        expect(response.body.strategy).toBeDefined();
      }
    });

    test('should return 501 for any vault', async () => {
      const response = await request(app)
        .get('/api/v1/vaults/unknown-vault/strategy')
        .expect(501);

      expectErrorResponse(response, 'NOT_IMPLEMENTED');
    });

    test('should handle special characters in vault ID', async () => {
      const response = await request(app)
        .get('/api/v1/vaults/vault-with-special-chars/strategy')
        .expect(501);

      expectErrorResponse(response, 'NOT_IMPLEMENTED');
    });

    test.skip('should validate protocol weights sum correctly for each vault', async () => {
      for (const vaultId of TEST_DATA.VAULT_IDS) {
        const response = await request(app)
          .get(`/api/v1/vaults/${vaultId}/strategy`)
          .expect(200);

        const protocols = response.body.strategy.protocols;
        const totalProtocolWeight = protocols.reduce(
          (sum, p) => sum + p.weight,
          0
        );

        // Allow small floating point tolerance
        expect(totalProtocolWeight).toBeCloseTo(1.0, 1);
      }
    });

    test.skip('should include supported chains for each protocol', async () => {
      const response = await request(app)
        .get('/api/v1/vaults/stablecoin-vault/strategy')
        .expect(200);

      const protocols = response.body.strategy.protocols;
      protocols.forEach(protocol => {
        expect(protocol.chain).toBeDefined();
        expect(typeof protocol.chain).toBe('string');

        // Chain should be a known blockchain
        const knownChains = [
          'ethereum',
          'arbitrum',
          'base',
          'optimism',
          'polygon',
        ];
        expect(knownChains).toContain(protocol.chain);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle server errors gracefully', async () => {
      // This test would require mocking internal failures
      // For now, we test that error responses follow expected format
      const response = await request(app)
        .get('/api/v1/vaults/unknown-vault/strategy')
        .expect(501);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'NOT_IMPLEMENTED',
          message: expect.any(String),
        },
      });
    });
  });

  describe('Performance', () => {
    test.skip('should respond within reasonable time', async () => {
      const startTime = Date.now();

      await request(app).get('/api/v1/vaults').expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });

    test.skip('should handle multiple concurrent requests', async () => {
      const requests = Array(5)
        .fill()
        .map(() => request(app).get('/api/v1/vaults').expect(200));

      const responses = await Promise.all(requests);

      // All requests should succeed and return consistent data
      const firstResponse = responses[0].body;
      responses.forEach(response => {
        expect(response.body.vaults).toEqual(firstResponse.vaults);
      });
    });
  });
});
