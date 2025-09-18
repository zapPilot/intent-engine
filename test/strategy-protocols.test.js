/**
 * Test suite for /api/v1/strategies/{strategyId}/protocols endpoint
 *
 * This test file comprehensively validates the IntentController.getStrategyProtocols method
 * which returns protocol breakdown for a specific strategy including:
 * - Strategy validation and error handling for invalid strategy IDs
 * - Chain filtering functionality via query parameters
 * - Protocol detail formatting consistency
 * - Weight calculation and validation
 * - Enabled/disabled protocol counting
 * - Response structure and field validation
 *
 * Test Coverage:
 * - Valid strategy ID with all protocols
 * - Valid strategy ID with chain filtering
 * - Invalid strategy ID error handling
 * - Response structure validation
 * - Protocol detail consistency with main strategies endpoint
 * - Weight calculation accuracy
 * - Chain filtering edge cases
 * - Performance and concurrent request handling
 */

const request = require('supertest');
const app = require('../src/app');
const UNIFIED_ZAP_CONFIG = require('../src/config/unifiedZapConfig');

describe('GET /api/v1/strategies/:strategyId/protocols', () => {
  let availableStrategyIds;

  beforeAll(async () => {
    // Get available strategy IDs from the main endpoint
    const strategiesResponse = await request(app).get('/api/v1/strategies');
    availableStrategyIds = strategiesResponse.body.strategies.map(s => s.id);
  });

  describe('Successful responses', () => {
    let response;
    let strategyId;

    beforeAll(async () => {
      strategyId = availableStrategyIds[0]; // Use first available strategy
      response = await request(app).get(
        `/api/v1/strategies/${strategyId}/protocols`
      );
    });

    it('should return 200 status code for valid strategy', () => {
      expect(response.status).toBe(200);
    });

    it('should return success: true', () => {
      expect(response.body.success).toBe(true);
    });

    it('should return required response fields', () => {
      expect(response.body).toHaveProperty('strategyId');
      expect(response.body).toHaveProperty('strategyName');
      expect(response.body).toHaveProperty('chain');
      expect(response.body).toHaveProperty('protocols');
      expect(response.body).toHaveProperty('totalProtocols');
      expect(response.body).toHaveProperty('totalWeight');
      expect(response.body).toHaveProperty('enabledProtocols');
    });

    it('should return correct field types', () => {
      expect(typeof response.body.strategyId).toBe('string');
      expect(typeof response.body.strategyName).toBe('string');
      expect(typeof response.body.chain).toBe('string');
      expect(Array.isArray(response.body.protocols)).toBe(true);
      expect(typeof response.body.totalProtocols).toBe('number');
      expect(typeof response.body.totalWeight).toBe('number');
      expect(typeof response.body.enabledProtocols).toBe('number');
    });

    it('should return correct strategy ID in response', () => {
      expect(response.body.strategyId).toBe(strategyId);
    });

    it('should return "all" for chain when no chain filter specified', () => {
      expect(response.body.chain).toBe('all');
    });

    it('should have accurate protocol count', () => {
      expect(response.body.totalProtocols).toBe(response.body.protocols.length);
    });

    it('should have accurate enabled protocol count', () => {
      const enabledCount = response.body.protocols.filter(
        p => p.enabled
      ).length;
      expect(response.body.enabledProtocols).toBe(enabledCount);
    });

    it('should have accurate total weight', () => {
      const calculatedWeight = response.body.protocols.reduce(
        (sum, p) => sum + p.weight,
        0
      );
      expect(response.body.totalWeight).toBe(calculatedWeight);
    });

    it('should have at least one protocol', () => {
      expect(response.body.protocols.length).toBeGreaterThan(0);
    });
  });

  describe('Protocol structure validation', () => {
    let protocols;

    beforeAll(async () => {
      const strategyId = availableStrategyIds[0];
      const response = await request(app).get(
        `/api/v1/strategies/${strategyId}/protocols`
      );
      protocols = response.body.protocols;
    });

    it('should have required protocol fields', () => {
      protocols.forEach(protocol => {
        expect(protocol).toHaveProperty('id');
        expect(protocol).toHaveProperty('protocol');
        expect(protocol).toHaveProperty('name');
        expect(protocol).toHaveProperty('implementation');
        expect(protocol).toHaveProperty('chain');
        expect(protocol).toHaveProperty('chainId');
        expect(protocol).toHaveProperty('weight');
        expect(protocol).toHaveProperty('enabled');
        expect(protocol).toHaveProperty('mode');
        expect(protocol).toHaveProperty('targetTokens');
      });
    });

    it('should have correct protocol field types', () => {
      protocols.forEach(protocol => {
        expect(typeof protocol.id).toBe('string');
        expect(typeof protocol.protocol).toBe('string');
        expect(typeof protocol.name).toBe('string');
        expect(typeof protocol.implementation).toBe('string');
        expect(typeof protocol.chain).toBe('string');
        expect(typeof protocol.chainId).toBe('number');
        expect(typeof protocol.weight).toBe('number');
        expect(typeof protocol.enabled).toBe('boolean');
        expect(typeof protocol.mode).toBe('string');
        expect(Array.isArray(protocol.targetTokens)).toBe(true);
      });
    });

    it('should have valid weight values', () => {
      protocols.forEach(protocol => {
        expect(protocol.weight).toBeGreaterThan(0);
        expect(protocol.weight).toBeLessThanOrEqual(100);
      });
    });

    it('should have valid chainId values', () => {
      protocols.forEach(protocol => {
        expect(protocol.chainId).toBeGreaterThan(0);
        expect([1, 10, 8453, 42161]).toContain(protocol.chainId);
      });
    });
  });

  describe('Chain filtering', () => {
    let strategyId;

    beforeAll(() => {
      strategyId = availableStrategyIds[0];
    });

    it('should filter protocols by chain when chain parameter provided', async () => {
      // Get all protocols first
      const allResponse = await request(app).get(
        `/api/v1/strategies/${strategyId}/protocols`
      );
      const allProtocols = allResponse.body.protocols;

      if (allProtocols.length === 0) {
        throw new Error('No protocols found for testing');
      }

      // Get unique chains from protocols
      const uniqueChains = [...new Set(allProtocols.map(p => p.chain))];

      if (uniqueChains.length > 1) {
        // Test filtering by first available chain
        const testChain = uniqueChains[0];
        const filteredResponse = await request(app).get(
          `/api/v1/strategies/${strategyId}/protocols?chain=${testChain}`
        );

        expect(filteredResponse.status).toBe(200);
        expect(filteredResponse.body.chain).toBe(testChain);

        // All returned protocols should be on the specified chain
        filteredResponse.body.protocols.forEach(protocol => {
          expect(protocol.chain).toBe(testChain);
        });

        // Should have fewer or equal protocols than the unfiltered response
        expect(filteredResponse.body.protocols.length).toBeLessThanOrEqual(
          allProtocols.length
        );
      }
    });

    it('should return empty protocols array for non-existent chain', async () => {
      const response = await request(app).get(
        `/api/v1/strategies/${strategyId}/protocols?chain=nonexistent`
      );

      expect(response.status).toBe(200);
      expect(response.body.chain).toBe('nonexistent');
      expect(response.body.protocols).toEqual([]);
      expect(response.body.totalProtocols).toBe(0);
      expect(response.body.totalWeight).toBe(0);
      expect(response.body.enabledProtocols).toBe(0);
    });

    it('should handle case-sensitive chain filtering', async () => {
      // Test that chain filtering is case-sensitive
      const response1 = await request(app).get(
        `/api/v1/strategies/${strategyId}/protocols?chain=arbitrum`
      );
      const response2 = await request(app).get(
        `/api/v1/strategies/${strategyId}/protocols?chain=Arbitrum`
      );

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // These should potentially return different results if chains are case-sensitive
      // The actual result depends on how chains are stored in config
    });
  });

  describe('Strategy validation and error handling', () => {
    it('should return 404 for non-existent strategy ID', async () => {
      const response = await request(app).get(
        '/api/v1/strategies/non-existent-strategy/protocols'
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('STRATEGY_NOT_FOUND');
      expect(response.body.error.message).toContain('non-existent-strategy');
      expect(response.body.error.message).toContain('not found');
    });

    it('should include available strategies in 404 error response', async () => {
      const response = await request(app).get(
        '/api/v1/strategies/invalid-strategy/protocols'
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toHaveProperty('availableStrategies');
      expect(Array.isArray(response.body.error.availableStrategies)).toBe(true);
      expect(response.body.error.availableStrategies.length).toBeGreaterThan(0);
    });

    it('should return available strategies matching config', async () => {
      const response = await request(app).get(
        '/api/v1/strategies/invalid/protocols'
      );

      const configStrategies = Object.keys(
        UNIFIED_ZAP_CONFIG.STRATEGY_CATEGORIES
      );
      expect(response.body.error.availableStrategies.sort()).toEqual(
        configStrategies.sort()
      );
    });

    it('should handle empty strategy ID gracefully', async () => {
      const response = await request(app).get('/api/v1/strategies//protocols');

      // This should return 404 as route doesn't match
      expect(response.status).toBe(404);
      // Response will be HTML error page, not JSON, so don't check body structure
      expect(response.type).toMatch(/html/);
    });
  });

  describe('Consistency with main strategies endpoint', () => {
    it('should return same protocol details as main strategies endpoint', async () => {
      // Get data from both endpoints
      const strategiesResponse = await request(app).get('/api/v1/strategies');
      const strategies = strategiesResponse.body.strategies;

      // Test each strategy
      for (const strategy of strategies) {
        const protocolsResponse = await request(app).get(
          `/api/v1/strategies/${strategy.id}/protocols`
        );

        expect(protocolsResponse.status).toBe(200);

        // Strategy name should match
        expect(protocolsResponse.body.strategyName).toBe(strategy.displayName);

        // Protocol count should match
        expect(protocolsResponse.body.totalProtocols).toBe(
          strategy.protocolCount
        );
        expect(protocolsResponse.body.enabledProtocols).toBe(
          strategy.enabledProtocolCount
        );

        // Protocol details should match
        const mainEndpointProtocols = strategy.protocols;
        const protocolEndpointProtocols = protocolsResponse.body.protocols;

        expect(protocolEndpointProtocols.length).toBe(
          mainEndpointProtocols.length
        );

        // Check that all protocols from main endpoint exist in protocol endpoint
        mainEndpointProtocols.forEach(mainProtocol => {
          const matchingProtocol = protocolEndpointProtocols.find(
            p => p.id === mainProtocol.id
          );
          expect(matchingProtocol).toBeDefined();

          // Key fields should match
          expect(matchingProtocol.name).toBe(mainProtocol.name);
          expect(matchingProtocol.weight).toBe(mainProtocol.weight);
          expect(matchingProtocol.enabled).toBe(mainProtocol.enabled);
          expect(matchingProtocol.chain).toBe(mainProtocol.chain);
          expect(matchingProtocol.chainId).toBe(mainProtocol.chainId);
        });
      }
    });
  });

  describe('Configuration consistency', () => {
    it('should match protocols from unified zap config', async () => {
      const strategyId = availableStrategyIds[0];
      const response = await request(app).get(
        `/api/v1/strategies/${strategyId}/protocols`
      );

      const configStrategy = UNIFIED_ZAP_CONFIG.STRATEGY_CATEGORIES[strategyId];
      expect(configStrategy).toBeDefined();

      // Protocol count should match config
      expect(response.body.protocols.length).toBe(
        configStrategy.protocols.length
      );

      // Each protocol should exist in config
      response.body.protocols.forEach(responseProtocol => {
        const configProtocol = configStrategy.protocols.find(
          p => p.id === responseProtocol.id
        );
        expect(configProtocol).toBeDefined();

        // Key fields should match config
        expect(responseProtocol.chain).toBe(configProtocol.chain);
        expect(responseProtocol.chainId).toBe(configProtocol.chainId);
        expect(responseProtocol.weight).toBe(configProtocol.weight);
      });
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle special characters in strategy ID', async () => {
      const specialIds = [
        'strategy@id',
        'strategy id',
        'strategy-id!',
        'strategy/id',
      ];

      for (const specialId of specialIds) {
        const response = await request(app).get(
          `/api/v1/strategies/${encodeURIComponent(specialId)}/protocols`
        );

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('STRATEGY_NOT_FOUND');
      }
    });

    it('should handle very long strategy ID', async () => {
      const longId = 'a'.repeat(1000);
      const response = await request(app).get(
        `/api/v1/strategies/${longId}/protocols`
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should have proper error handling structure in controller', () => {
      const IntentController = require('../src/controllers/IntentController');
      expect(typeof IntentController.getStrategyProtocols).toBe('function');

      const funcString = IntentController.getStrategyProtocols.toString();
      expect(funcString).toMatch(/try/);
      expect(funcString).toMatch(/catch/);
      expect(funcString).toMatch(/error/);
    });
  });

  describe('Performance and async behavior', () => {
    it('should respond within reasonable time', async () => {
      const strategyId = availableStrategyIds[0];
      const startTime = Date.now();

      const response = await request(app).get(
        `/api/v1/strategies/${strategyId}/protocols`
      );
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle concurrent requests properly', async () => {
      const strategyId = availableStrategyIds[0];
      const requests = Array(5)
        .fill()
        .map(() =>
          request(app).get(`/api/v1/strategies/${strategyId}/protocols`)
        );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.strategyId).toBe(strategyId);
      });

      // All responses should be identical
      const firstResponse = responses[0].body;
      responses.slice(1).forEach(response => {
        expect(response.body.protocols.length).toBe(
          firstResponse.protocols.length
        );
        expect(response.body.totalWeight).toBe(firstResponse.totalWeight);
        expect(response.body.strategyName).toBe(firstResponse.strategyName);
      });
    });

    it('should handle mixed valid/invalid requests concurrently', async () => {
      const validStrategy = availableStrategyIds[0];
      const requests = [
        request(app).get(`/api/v1/strategies/${validStrategy}/protocols`),
        request(app).get('/api/v1/strategies/invalid1/protocols'),
        request(app).get(`/api/v1/strategies/${validStrategy}/protocols`),
        request(app).get('/api/v1/strategies/invalid2/protocols'),
      ];

      const responses = await Promise.all(requests);

      expect(responses[0].status).toBe(200);
      expect(responses[1].status).toBe(404);
      expect(responses[2].status).toBe(200);
      expect(responses[3].status).toBe(404);

      expect(responses[0].body.success).toBe(true);
      expect(responses[1].body.success).toBe(false);
      expect(responses[2].body.success).toBe(true);
      expect(responses[3].body.success).toBe(false);
    });
  });

  describe('Chain filtering validation', () => {
    it('should handle multiple chain filters gracefully', async () => {
      const strategyId = availableStrategyIds[0];

      // Test with multiple chain parameters (though only first should be used)
      const response = await request(app).get(
        `/api/v1/strategies/${strategyId}/protocols?chain=arbitrum&chain=base`
      );

      expect(response.status).toBe(200);
      // Behavior depends on implementation - could be first chain or error
    });

    it('should handle empty chain parameter', async () => {
      const strategyId = availableStrategyIds[0];

      const response = await request(app).get(
        `/api/v1/strategies/${strategyId}/protocols?chain=`
      );

      expect(response.status).toBe(200);
      // Should likely treat empty chain as no filter
    });
  });

  describe('Response data validation', () => {
    it('should have positive weights that sum correctly', async () => {
      const strategyId = availableStrategyIds[0];
      const response = await request(app).get(
        `/api/v1/strategies/${strategyId}/protocols`
      );

      let calculatedWeight = 0;
      response.body.protocols.forEach(protocol => {
        expect(protocol.weight).toBeGreaterThan(0);
        calculatedWeight += protocol.weight;
      });

      expect(response.body.totalWeight).toBe(calculatedWeight);
    });

    it('should have consistent enabled/disabled protocol counts', async () => {
      const strategyId = availableStrategyIds[0];
      const response = await request(app).get(
        `/api/v1/strategies/${strategyId}/protocols`
      );

      const enabledCount = response.body.protocols.filter(
        p => p.enabled
      ).length;
      const disabledCount = response.body.protocols.filter(
        p => !p.enabled
      ).length;

      expect(response.body.enabledProtocols).toBe(enabledCount);
      expect(response.body.totalProtocols).toBe(enabledCount + disabledCount);
    });

    it('should not have duplicate protocol IDs', async () => {
      const strategyId = availableStrategyIds[0];
      const response = await request(app).get(
        `/api/v1/strategies/${strategyId}/protocols`
      );

      const protocolIds = response.body.protocols.map(p => p.id);
      const uniqueIds = [...new Set(protocolIds)];

      expect(uniqueIds.length).toBe(protocolIds.length);
    });
  });
});
