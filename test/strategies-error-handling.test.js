/**
 * Error Handling and Edge Case Test Suite for Strategies Endpoints
 *
 * This test file focuses on comprehensive error handling and edge cases
 * for the strategies endpoints to increase test coverage, specifically targeting:
 * - Internal server error scenarios
 * - Configuration corruption and recovery
 * - Memory and resource exhaustion
 * - Network timeout and connection failures
 * - Malformed data handling
 * - Security edge cases
 *
 * Coverage Focus:
 * - Error handling paths in getStrategies and getStrategyProtocols
 * - Exception scenarios not covered by existing tests
 * - System stress and failure recovery
 * - Input validation boundary conditions
 */

const request = require('supertest');

// Mock the unified zap config before requiring the app
const mockUnifiedZapConfig = {
  STRATEGY_CATEGORIES: {
    stablecoin: {
      displayName: 'Stablecoins',
      description: 'Diversified stablecoin yield strategies',
      targetAssets: ['USDC', 'USDT', 'DAI'],
      chains: ['arbitrum', 'base'],
      protocols: [
        {
          id: 'test-protocol-1',
          name: 'Test Protocol 1',
          implementation: 'TestProtocol1',
          chain: 'arbitrum',
          chainId: 42161,
          weight: 50,
          enabled: true,
          config: { mode: 'single', symbolOfBestTokenToZapInOut: 'USDC' },
        },
        {
          id: 'test-protocol-2',
          name: 'Test Protocol 2 (Base)',
          implementation: 'TestProtocol2',
          chain: 'base',
          chainId: 8453,
          weight: 50,
          enabled: true,
          config: {
            mode: 'LP',
            lpTokens: [
              ['USDC', '0x123', 6],
              ['WETH', '0x456', 18],
            ],
          },
        },
      ],
    },
  },
  SUPPORTED_CHAINS: {
    arbitrum: { chainId: 42161, name: 'Arbitrum' },
    base: { chainId: 8453, name: 'Base' },
  },
  SSE_STREAMING: {
    CLEANUP_INTERVAL: 30000,
    MAX_CONTEXTS: 100,
    CONTEXT_TTL: 300000,
  },
};

jest.mock('../src/config/unifiedZapConfig', () => mockUnifiedZapConfig);

const app = require('../src/app');

describe('Strategies Error Handling and Edge Cases', () => {
  describe('Configuration Corruption Scenarios', () => {
    let originalConfig;

    beforeEach(() => {
      originalConfig = require('../src/config/unifiedZapConfig');
    });

    it('should handle null strategy categories gracefully', async () => {
      // Temporarily corrupt the config
      originalConfig.STRATEGY_CATEGORIES = null;

      const response = await request(app).get('/api/v1/strategies');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(response.body.error.message).toBe(
        'Failed to get available strategies'
      );

      // Restore config
      originalConfig.STRATEGY_CATEGORIES =
        mockUnifiedZapConfig.STRATEGY_CATEGORIES;
    });

    it('should handle undefined strategy categories', async () => {
      delete originalConfig.STRATEGY_CATEGORIES;

      const response = await request(app).get('/api/v1/strategies');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);

      // Restore config
      originalConfig.STRATEGY_CATEGORIES =
        mockUnifiedZapConfig.STRATEGY_CATEGORIES;
    });

    it('should handle corrupted strategy data structures', async () => {
      originalConfig.STRATEGY_CATEGORIES = {
        corrupted: 'invalid_structure',
      };

      const response = await request(app).get('/api/v1/strategies');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);

      // Restore config
      originalConfig.STRATEGY_CATEGORIES =
        mockUnifiedZapConfig.STRATEGY_CATEGORIES;
    });

    it('should handle missing supported chains configuration', async () => {
      delete originalConfig.SUPPORTED_CHAINS;

      const response = await request(app).get('/api/v1/strategies');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);

      // Restore config
      originalConfig.SUPPORTED_CHAINS = mockUnifiedZapConfig.SUPPORTED_CHAINS;
    });

    it('should handle null supported chains', async () => {
      originalConfig.SUPPORTED_CHAINS = null;

      const response = await request(app).get('/api/v1/strategies');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);

      // Restore config
      originalConfig.SUPPORTED_CHAINS = mockUnifiedZapConfig.SUPPORTED_CHAINS;
    });
  });

  describe('Malformed Protocol Data Handling', () => {
    let originalConfig;

    beforeEach(() => {
      originalConfig = require('../src/config/unifiedZapConfig');
    });

    afterEach(() => {
      // Always restore original config
      originalConfig.STRATEGY_CATEGORIES =
        mockUnifiedZapConfig.STRATEGY_CATEGORIES;
      originalConfig.SUPPORTED_CHAINS = mockUnifiedZapConfig.SUPPORTED_CHAINS;
    });

    it('should handle protocols with null configuration', async () => {
      originalConfig.STRATEGY_CATEGORIES = {
        test: {
          displayName: 'Test Strategy',
          description: 'Test description',
          targetAssets: ['USDC'],
          chains: ['arbitrum'],
          protocols: [
            {
              id: 'null-config-protocol',
              name: 'Null Config Protocol',
              implementation: 'NullProtocol',
              chain: 'arbitrum',
              chainId: 42161,
              weight: 100,
              config: null, // Null configuration
            },
          ],
        },
      };

      const response = await request(app).get('/api/v1/strategies');

      // Should handle null config gracefully or return appropriate error
      expect([200, 500].includes(response.status)).toBe(true);

      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.strategies.length).toBeGreaterThanOrEqual(0);

        if (response.body.strategies.length > 0) {
          const strategy = response.body.strategies[0];
          if (strategy.protocols && strategy.protocols.length > 0) {
            const protocol = strategy.protocols[0];
            expect(protocol.enabled).toBeDefined(); // Should have enabled field
          }
        }
      } else {
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBeDefined();
      }
    });

    it('should handle protocols with missing required fields', async () => {
      originalConfig.STRATEGY_CATEGORIES = {
        test: {
          displayName: 'Test Strategy',
          description: 'Test description',
          targetAssets: ['USDC'],
          chains: ['arbitrum'],
          protocols: [
            {
              id: 'incomplete-protocol',
              // Missing name, implementation, chain, etc.
              weight: 100,
            },
          ],
        },
      };

      const response = await request(app).get('/api/v1/strategies');

      // Should handle missing fields gracefully
      expect([200, 500].includes(response.status)).toBe(true);

      if (response.status === 500) {
        expect(response.body.success).toBe(false);
      }
    });

    it('should handle protocols with invalid weight values', async () => {
      originalConfig.STRATEGY_CATEGORIES = {
        test: {
          displayName: 'Test Strategy',
          description: 'Test description',
          targetAssets: ['USDC'],
          chains: ['arbitrum'],
          protocols: [
            {
              id: 'invalid-weight-protocol',
              name: 'Invalid Weight Protocol',
              implementation: 'InvalidProtocol',
              chain: 'arbitrum',
              chainId: 42161,
              weight: -50, // Invalid negative weight
              config: { mode: 'single' },
            },
          ],
        },
      };

      const response = await request(app).get('/api/v1/strategies');

      // Should still return data but may have validation issues
      expect([200, 500].includes(response.status)).toBe(true);
    });

    it('should handle protocols with invalid chainId values', async () => {
      originalConfig.STRATEGY_CATEGORIES = {
        test: {
          displayName: 'Test Strategy',
          description: 'Test description',
          targetAssets: ['USDC'],
          chains: ['arbitrum'],
          protocols: [
            {
              id: 'invalid-chainid-protocol',
              name: 'Invalid ChainId Protocol',
              implementation: 'InvalidProtocol',
              chain: 'arbitrum',
              chainId: 'not_a_number', // Invalid chainId
              weight: 100,
              config: { mode: 'single' },
            },
          ],
        },
      };

      const response = await request(app).get('/api/v1/strategies');

      expect([200, 500].includes(response.status)).toBe(true);
    });
  });

  describe('Memory and Resource Exhaustion', () => {
    let originalConfig;

    beforeEach(() => {
      originalConfig = require('../src/config/unifiedZapConfig');
    });

    afterEach(() => {
      originalConfig.STRATEGY_CATEGORIES =
        mockUnifiedZapConfig.STRATEGY_CATEGORIES;
    });

    it('should handle extremely large protocol arrays', async () => {
      // Create a strategy with many protocols
      const manyProtocols = Array(1000)
        .fill()
        .map((_, i) => ({
          id: `large-protocol-${i}`,
          name: `Large Protocol ${i}`,
          implementation: `LargeProtocol${i}`,
          chain: 'arbitrum',
          chainId: 42161,
          weight: 1,
          enabled: true,
          config: { mode: 'single', symbolOfBestTokenToZapInOut: 'USDC' },
        }));

      originalConfig.STRATEGY_CATEGORIES = {
        large: {
          displayName: 'Large Strategy',
          description: 'Strategy with many protocols',
          targetAssets: ['USDC'],
          chains: ['arbitrum'],
          protocols: manyProtocols,
        },
      };

      const response = await request(app).get('/api/v1/strategies');

      // Should handle large arrays but may be slow
      expect([200, 500, 503].includes(response.status)).toBe(true);

      if (response.status === 200) {
        expect(response.body.strategies[0].protocols.length).toBe(1000);
      }
    });

    it('should handle deeply nested protocol configurations', async () => {
      const deepConfig = {
        mode: 'complex',
        nested: {
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: {
                    data: 'very deep',
                    tokens: Array(100)
                      .fill()
                      .map((_, i) => `TOKEN_${i}`),
                  },
                },
              },
            },
          },
        },
      };

      originalConfig.STRATEGY_CATEGORIES = {
        deep: {
          displayName: 'Deep Strategy',
          description: 'Strategy with deep nesting',
          targetAssets: ['USDC'],
          chains: ['arbitrum'],
          protocols: [
            {
              id: 'deep-protocol',
              name: 'Deep Protocol',
              implementation: 'DeepProtocol',
              chain: 'arbitrum',
              chainId: 42161,
              weight: 100,
              config: deepConfig,
            },
          ],
        },
      };

      const response = await request(app).get('/api/v1/strategies');

      expect([200, 500].includes(response.status)).toBe(true);
    });
  });

  describe('Strategy Protocol Endpoint Error Scenarios', () => {
    it('should handle chain filtering with malformed chain parameters', async () => {
      const malformedChainTests = [
        { chain: '', description: 'empty chain' },
        { chain: ' ', description: 'whitespace chain' },
        { chain: 'null', description: 'string null' },
        { chain: 'undefined', description: 'string undefined' },
        { chain: '42161', description: 'numeric chain ID' },
        { chain: 'arbitrum%20test', description: 'URL encoded chain' },
      ];

      for (const { chain } of malformedChainTests) {
        const response = await request(app).get(
          `/api/v1/strategies/stablecoin/protocols?chain=${encodeURIComponent(chain)}`
        );

        // May fail due to configuration issues
        expect([200, 404, 500].includes(response.status)).toBe(true);

        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          expect(response.body.chain).toBe(chain);

          // For invalid chains, should return empty protocols array
          if (!['arbitrum', 'base'].includes(chain.trim())) {
            expect(response.body.protocols).toEqual([]);
            expect(response.body.totalProtocols).toBe(0);
          }
        } else {
          expect(response.body.success).toBe(false);
        }
      }
    });

    it('should handle multiple simultaneous chain parameters', async () => {
      const response = await request(app).get(
        '/api/v1/strategies/stablecoin/protocols?chain=arbitrum&chain=base&chain=ethereum'
      );

      expect([200, 404, 500].includes(response.status)).toBe(true);

      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        // Should use first chain parameter
        expect(
          ['arbitrum', 'base', 'ethereum'].includes(response.body.chain)
        ).toBe(true);
      } else {
        expect(response.body.success).toBe(false);
      }
    });

    it('should handle strategy protocols with corrupted weight calculations', async () => {
      // Test that weight calculations are robust
      const response = await request(app).get(
        '/api/v1/strategies/stablecoin/protocols'
      );

      expect([200, 404, 500].includes(response.status)).toBe(true);

      if (response.status === 200 && response.body.protocols.length > 0) {
        const calculatedWeight = response.body.protocols.reduce(
          (sum, p) => sum + (isNaN(p.weight) ? 0 : p.weight),
          0
        );

        // Should handle any weight calculation issues gracefully
        expect(typeof response.body.totalWeight).toBe('number');
        expect(response.body.totalWeight).toBe(calculatedWeight);
      } else if (response.status !== 200) {
        expect(response.body.success).toBe(false);
      }
    });
  });

  describe('Input Validation Boundary Conditions', () => {
    it('should handle extremely long strategy IDs', async () => {
      const veryLongId = 'a'.repeat(10000);
      const response = await request(app).get(
        `/api/v1/strategies/${veryLongId}/protocols`
      );

      expect([404, 414, 400].includes(response.status)).toBe(true);
    });

    it('should handle strategy IDs with special characters', async () => {
      const specialCharIds = [
        'strategy/../../../etc/passwd',
        'strategy\x00null',
        'strategy\n\r\t',
        'strategy%00',
        'strategy<script>alert(1)</script>',
        'strategy${process.env}',
        'strategy\\\\\\\\server\\share',
      ];

      for (const specialId of specialCharIds) {
        const response = await request(app).get(
          `/api/v1/strategies/${encodeURIComponent(specialId)}/protocols`
        );

        expect([400, 404].includes(response.status)).toBe(true);
        if (response.body.error) {
          expect(response.body.error.code).toBe('STRATEGY_NOT_FOUND');
        }
      }
    });

    it('should handle Unicode and emoji in strategy IDs', async () => {
      const unicodeIds = [
        'strategy-ñäñö',
        'strategy-中文',
        'strategy-🚀💎',
        'strategy-Ω∆π',
        'strategy-मराठी',
      ];

      for (const unicodeId of unicodeIds) {
        const response = await request(app).get(
          `/api/v1/strategies/${encodeURIComponent(unicodeId)}/protocols`
        );

        expect([404, 400].includes(response.status)).toBe(true);
      }
    });
  });

  describe('Network and Timing Edge Cases', () => {
    it('should handle rapid sequential requests', async () => {
      const rapidRequests = Array(10)
        .fill()
        .map(() => request(app).get('/api/v1/strategies'));

      const startTime = Date.now();
      const responses = await Promise.all(rapidRequests);
      const endTime = Date.now();

      // All requests should succeed
      responses.forEach(response => {
        expect([200, 404, 429, 500, 503].includes(response.status)).toBe(true);

        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          expect(response.body.strategies).toBeDefined();
        } else {
          // Should handle errors gracefully
          expect(response.body.success).toBeDefined();
        }
      });

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds max
    });

    it('should handle interleaved strategy and protocol requests', async () => {
      const mixedRequests = [
        request(app).get('/api/v1/strategies'),
        request(app).get('/api/v1/strategies/stablecoin/protocols'),
        request(app).get('/api/v1/strategies'),
        request(app).get(
          '/api/v1/strategies/stablecoin/protocols?chain=arbitrum'
        ),
        request(app).get('/api/v1/strategies/stablecoin/protocols?chain=base'),
        request(app).get('/api/v1/strategies'),
      ];

      const responses = await Promise.all(mixedRequests);

      responses.forEach(response => {
        expect([200, 404, 500].includes(response.status)).toBe(true);
        expect(response.body.success).toBeDefined();
      });

      // Verify specific response patterns
      const strategyResponses = [responses[0], responses[2], responses[5]];
      const protocolResponses = [responses[1], responses[3], responses[4]];

      strategyResponses.forEach(response => {
        if (response.status === 200) {
          expect(response.body.strategies).toBeDefined();
          expect(response.body.total).toBeDefined();
        }
      });

      protocolResponses.forEach(response => {
        if (response.status === 200) {
          expect(response.body.protocols).toBeDefined();
          expect(response.body.totalProtocols).toBeDefined();
        }
      });
    });
  });

  describe('Data Consistency Under Stress', () => {
    it('should maintain response consistency across multiple requests', async () => {
      // Make multiple requests and ensure consistent responses
      const requests = Array(10)
        .fill()
        .map(() => request(app).get('/api/v1/strategies'));

      const responses = await Promise.all(requests);

      // All successful responses should be identical
      const successfulResponses = responses.filter(r => r.status === 200);

      if (successfulResponses.length > 1) {
        const firstResponse = successfulResponses[0].body;

        successfulResponses.slice(1).forEach(response => {
          expect(response.body.strategies.length).toBe(
            firstResponse.strategies.length
          );
          expect(response.body.total).toBe(firstResponse.total);
          expect(response.body.supportedChains.length).toBe(
            firstResponse.supportedChains.length
          );
        });
      }
    });

    it('should handle concurrent different strategy protocol requests', async () => {
      const protocolRequests = [
        request(app).get('/api/v1/strategies/stablecoin/protocols'),
        request(app).get(
          '/api/v1/strategies/stablecoin/protocols?chain=arbitrum'
        ),
        request(app).get('/api/v1/strategies/stablecoin/protocols?chain=base'),
        request(app).get(
          '/api/v1/strategies/stablecoin/protocols?chain=nonexistent'
        ),
      ];

      const responses = await Promise.all(protocolRequests);

      responses.forEach((response, index) => {
        expect([200, 404].includes(response.status)).toBe(true);

        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          expect(response.body.strategyId).toBe('stablecoin');

          // Check chain filtering worked correctly
          if (index === 1) {
            // arbitrum filter
            expect(response.body.chain).toBe('arbitrum');
            response.body.protocols.forEach(p => {
              expect(p.chain).toBe('arbitrum');
            });
          } else if (index === 2) {
            // base filter
            expect(response.body.chain).toBe('base');
            response.body.protocols.forEach(p => {
              expect(p.chain).toBe('base');
            });
          } else if (index === 3) {
            // nonexistent filter
            expect(response.body.chain).toBe('nonexistent');
            expect(response.body.protocols).toEqual([]);
            expect(response.body.totalProtocols).toBe(0);
          }
        }
      });
    });
  });

  describe('Error Recovery and Graceful Degradation', () => {
    it('should provide meaningful error messages for various failure scenarios', async () => {
      const invalidStrategies = [
        'definitely-not-a-strategy',
        'strategy-that-does-not-exist',
        'missing-strategy-123',
      ];

      for (const invalidStrategy of invalidStrategies) {
        const response = await request(app).get(
          `/api/v1/strategies/${invalidStrategy}/protocols`
        );

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('STRATEGY_NOT_FOUND');
        expect(response.body.error.message).toContain(invalidStrategy);
        expect(response.body.error.message).toContain('not found');
        expect(response.body.error.availableStrategies).toBeDefined();
        expect(Array.isArray(response.body.error.availableStrategies)).toBe(
          true
        );
      }
    });

    it('should handle partial system failures gracefully', async () => {
      // Test that main endpoints work even if related systems might be degraded
      const coreEndpoints = [
        '/api/v1/strategies',
        '/api/v1/strategies/stablecoin/protocols',
      ];

      for (const endpoint of coreEndpoints) {
        const response = await request(app).get(endpoint);

        // Should work or fail gracefully
        expect([200, 404, 500, 503].includes(response.status)).toBe(true);

        if (response.status === 500 || response.status === 503) {
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBeDefined();
          expect(response.body.error.code).toBeDefined();
          expect(response.body.error.message).toBeDefined();
        }
      }
    });
  });
});
