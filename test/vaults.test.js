/**
 * Vault Metadata Endpoint Tests
 * Tests for /api/v1/vaults and /api/v1/vaults/:vaultId/strategy endpoints
 */

const request = require('supertest');
const app = require('../src/app');
const {
  TEST_DATA,
  expectValidResponse,
  expectErrorResponse,
} = require('./utils/testHelpers');

describe('Vault Metadata API', () => {
  describe('GET /api/v1/vaults', () => {
    test('should return list of available vaults', async () => {
      const response = await request(app).get('/api/v1/vaults').expect(200);

      expectValidResponse(response, ['vaults', 'total']);

      expect(response.body.vaults).toBeInstanceOf(Array);
      expect(response.body.vaults.length).toBeGreaterThan(0);
      expect(response.body.total).toBe(response.body.vaults.length);

      // Validate vault structure
      const vault = response.body.vaults[0];
      expect(vault).toHaveProperty('id');
      expect(vault).toHaveProperty('name');
      expect(vault).toHaveProperty('description');
      expect(vault).toHaveProperty('riskLevel');
      expect(vault).toHaveProperty('expectedAPR');
      expect(vault).toHaveProperty('supportedChains');
      expect(vault).toHaveProperty('status');

      // Validate expectedAPR structure
      expect(vault.expectedAPR).toHaveProperty('min');
      expect(vault.expectedAPR).toHaveProperty('max');
      expect(typeof vault.expectedAPR.min).toBe('number');
      expect(typeof vault.expectedAPR.max).toBe('number');

      // Validate supportedChains is array of numbers
      expect(Array.isArray(vault.supportedChains)).toBe(true);
      vault.supportedChains.forEach(chainId => {
        expect(typeof chainId).toBe('number');
      });
    });

    test('should include all expected vault types', async () => {
      const response = await request(app).get('/api/v1/vaults').expect(200);

      const vaultIds = response.body.vaults.map(v => v.id);

      TEST_DATA.VAULT_IDS.forEach(expectedVaultId => {
        expect(vaultIds).toContain(expectedVaultId);
      });
    });

    test('should return consistent data structure', async () => {
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
    test('should return strategy for valid vault', async () => {
      const vaultId = 'stablecoin-vault';
      const response = await request(app)
        .get(`/api/v1/vaults/${vaultId}/strategy`)
        .expect(200);

      expectValidResponse(response, ['vaultId', 'strategy']);

      expect(response.body.vaultId).toBe(vaultId);

      const strategy = response.body.strategy;
      expect(strategy).toHaveProperty('description');
      expect(strategy).toHaveProperty('weightMapping');
      expect(strategy).toHaveProperty('protocols');
      expect(strategy).toHaveProperty('rebalanceThreshold');

      // Validate weightMapping
      expect(typeof strategy.weightMapping).toBe('object');
      const totalWeight = Object.values(strategy.weightMapping).reduce(
        (sum, weight) => sum + weight,
        0
      );
      expect(totalWeight).toBeCloseTo(1.0, 2); // Should sum to 1.0

      // Validate protocols array
      expect(Array.isArray(strategy.protocols)).toBe(true);
      expect(strategy.protocols.length).toBeGreaterThan(0);

      strategy.protocols.forEach(protocol => {
        expect(protocol).toMatchObject({
          protocol: expect.any(String),
          chain: expect.any(String),
          weight: expect.any(Number),
          tokens: expect.any(Array),
          type: expect.any(String),
        });

        // Weight should be reasonable
        expect(protocol.weight).toBeGreaterThanOrEqual(0);
        expect(protocol.weight).toBeLessThanOrEqual(1);
      });
    });

    test('should return strategy for each vault type', async () => {
      for (const vaultId of TEST_DATA.VAULT_IDS) {
        const response = await request(app)
          .get(`/api/v1/vaults/${vaultId}/strategy`)
          .expect(200);

        expect(response.body.vaultId).toBe(vaultId);
        expect(response.body.strategy).toBeDefined();
      }
    });

    test('should return 404 for unknown vault', async () => {
      const response = await request(app)
        .get('/api/v1/vaults/unknown-vault/strategy')
        .expect(404);

      expectErrorResponse(response, 'VAULT_NOT_FOUND');
      expect(response.body.error).toHaveProperty('availableVaults');
      expect(Array.isArray(response.body.error.availableVaults)).toBe(true);
    });

    test('should handle special characters in vault ID', async () => {
      const response = await request(app)
        .get('/api/v1/vaults/vault-with-special-chars/strategy')
        .expect(404);

      expectErrorResponse(response, 'VAULT_NOT_FOUND');
    });

    test('should validate protocol weights sum correctly for each vault', async () => {
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

    test('should include supported chains for each protocol', async () => {
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
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.any(String),
        },
      });
    });
  });

  describe('Performance', () => {
    test('should respond within reasonable time', async () => {
      const startTime = Date.now();

      await request(app).get('/api/v1/vaults').expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });

    test('should handle multiple concurrent requests', async () => {
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
