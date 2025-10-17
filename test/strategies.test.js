/**
 * Test suite for /api/v1/strategies endpoint
 *
 * This test file comprehensively validates the IntentController.getStrategies method
 * which returns strategy data with protocol details including:
 * - Protocol name cleaning (removing chain suffixes like "(Arbitrum)")
 * - Target token extraction from zap token strategy definitions and legacy fields
 * - LP token handling from lpTokens array
 * - Proper formatting of protocol details using the _formatProtocolDetails private method
 *
 * Test Coverage:
 * - Response structure validation
 * - Strategy and protocol field validation
 * - Protocol name cleaning functionality
 * - Target tokens extraction (both single and LP modes)
 * - Configuration consistency with unifiedZapConfig
 * - Error handling and edge cases
 * - Performance and concurrent request handling
 * - Data validation for special characters and duplicates
 */

const request = require('supertest');
const app = require('../src/app');

describe('GET /api/v1/strategies', () => {
  describe('Successful responses', () => {
    let response;

    beforeAll(async () => {
      response = await request(app).get('/api/v1/strategies');
    });

    it('should return 200 status code', () => {
      expect(response.status).toBe(200);
    });

    it('should return success: true', () => {
      expect(response.body.success).toBe(true);
    });

    it('should return strategies array', () => {
      expect(response.body).toHaveProperty('strategies');
      expect(Array.isArray(response.body.strategies)).toBe(true);
    });

    it('should return total count', () => {
      expect(response.body).toHaveProperty('total');
      expect(typeof response.body.total).toBe('number');
      expect(response.body.total).toBe(response.body.strategies.length);
    });

    it('should return supportedChains array', () => {
      expect(response.body).toHaveProperty('supportedChains');
      expect(Array.isArray(response.body.supportedChains)).toBe(true);
    });

    it('should return lastUpdated timestamp', () => {
      expect(response.body).toHaveProperty('lastUpdated');
      expect(new Date(response.body.lastUpdated)).toBeInstanceOf(Date);
      expect(
        Date.now() - new Date(response.body.lastUpdated).getTime()
      ).toBeLessThan(5000); // Within 5 seconds
    });

    it('should have at least one strategy', () => {
      expect(response.body.strategies.length).toBeGreaterThan(0);
    });
  });

  describe('Strategy structure validation', () => {
    let strategies;

    beforeAll(async () => {
      const response = await request(app).get('/api/v1/strategies');
      strategies = response.body.strategies;
    });

    it('should have required strategy fields', () => {
      strategies.forEach(strategy => {
        expect(strategy).toHaveProperty('id');
        expect(strategy).toHaveProperty('displayName');
        expect(strategy).toHaveProperty('description');
        expect(strategy).toHaveProperty('targetAssets');
        expect(strategy).toHaveProperty('chains');
        expect(strategy).toHaveProperty('protocolCount');
        expect(strategy).toHaveProperty('enabledProtocolCount');
        expect(strategy).toHaveProperty('protocols');
      });
    });

    it('should have correct field types', () => {
      strategies.forEach(strategy => {
        expect(typeof strategy.id).toBe('string');
        expect(typeof strategy.displayName).toBe('string');
        expect(typeof strategy.description).toBe('string');
        expect(Array.isArray(strategy.targetAssets)).toBe(true);
        expect(Array.isArray(strategy.chains)).toBe(true);
        expect(typeof strategy.protocolCount).toBe('number');
        expect(typeof strategy.enabledProtocolCount).toBe('number');
        expect(Array.isArray(strategy.protocols)).toBe(true);
      });
    });

    it('should have accurate protocol counts', () => {
      strategies.forEach(strategy => {
        expect(strategy.protocolCount).toBe(strategy.protocols.length);

        const enabledProtocols = strategy.protocols.filter(p => p.enabled);
        expect(strategy.enabledProtocolCount).toBe(enabledProtocols.length);
      });
    });
  });

  describe('Protocol structure validation', () => {
    let protocols;

    beforeAll(async () => {
      const response = await request(app).get('/api/v1/strategies');
      protocols = response.body.strategies.flatMap(s => s.protocols);
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
        expect([1, 10, 8453, 42161]).toContain(protocol.chainId); // Ethereum, Optimism, Base, Arbitrum
      });
    });
  });

  describe('Protocol name cleaning', () => {
    let protocols;

    beforeAll(async () => {
      const response = await request(app).get('/api/v1/strategies');
      protocols = response.body.strategies.flatMap(s => s.protocols);
    });

    it('should remove chain suffixes from protocol names', () => {
      protocols.forEach(protocol => {
        // Protocol names should not contain chain suffixes like (Arbitrum), (Base), etc.
        expect(protocol.name).not.toMatch(/\s\([^)]+\)$/);
      });
    });

    it('should preserve chain information in dedicated fields', () => {
      protocols.forEach(protocol => {
        expect(typeof protocol.chain).toBe('string');
        expect(protocol.chain.length).toBeGreaterThan(0);
        expect(typeof protocol.chainId).toBe('number');
        expect(protocol.chainId).toBeGreaterThan(0);
      });
    });

    it('should have clean protocol names without redundant chain info', () => {
      const chainNames = ['Arbitrum', 'Base', 'Optimism', 'Ethereum'];

      protocols.forEach(protocol => {
        chainNames.forEach(chainName => {
          const pattern = `\\s\\(${chainName}\\)$`;
          // eslint-disable-next-line security/detect-non-literal-regexp
          const regex = new RegExp(pattern);
          expect(protocol.name).not.toMatch(regex);
        });
      });
    });
  });

  describe('Target tokens extraction', () => {
    let protocols;

    beforeAll(async () => {
      const response = await request(app).get('/api/v1/strategies');
      protocols = response.body.strategies.flatMap(s => s.protocols);
    });

    it('should extract target tokens correctly', () => {
      protocols.forEach(protocol => {
        expect(Array.isArray(protocol.targetTokens)).toBe(true);
        expect(protocol.targetTokens.length).toBeGreaterThan(0);

        protocol.targetTokens.forEach(token => {
          expect(typeof token).toBe('string');
          expect(token.length).toBeGreaterThan(0);
          // Tokens should be valid symbol format (no special chars except allowed ones)
          expect(token).toMatch(/^[a-zA-Z0-9_.-]+$/);
        });
      });
    });

    it('should handle LP tokens correctly', () => {
      const lpProtocols = protocols.filter(p => p.mode === 'LP');

      lpProtocols.forEach(protocol => {
        expect(protocol.targetTokens.length).toBeGreaterThanOrEqual(2);
        // LP tokens should not have duplicates
        const uniqueTokens = [...new Set(protocol.targetTokens)];
        expect(uniqueTokens.length).toBe(protocol.targetTokens.length);
      });
    });

    it('should handle single tokens correctly', () => {
      const singleProtocols = protocols.filter(p => p.mode === 'single');

      singleProtocols.forEach(protocol => {
        expect(protocol.targetTokens.length).toBeGreaterThan(0);
        protocol.targetTokens.forEach(token => {
          expect(typeof token).toBe('string');
        });
      });
    });

    it('should include zap token strategy symbols when configured', () => {
      const UNIFIED_ZAP_CONFIG = require('../src/config/unifiedZapConfig');
      const {
        normalizeZapTokenStrategy,
        deriveLegacyStrategyDefaults,
        getStrategyTokenSymbols,
      } = require('../src/utils/zapTokenStrategy');

      const allProtocols = Object.values(
        UNIFIED_ZAP_CONFIG.STRATEGY_CATEGORIES
      ).flatMap(strategy => strategy.protocols);

      allProtocols.forEach(protocol => {
        const strategy = normalizeZapTokenStrategy(
          protocol.config?.zapTokenStrategy,
          deriveLegacyStrategyDefaults(protocol.config || {})
        );

        const expectedSymbols = getStrategyTokenSymbols(strategy).filter(
          symbol => symbol && symbol.toLowerCase() !== 'any'
        );

        if (expectedSymbols.length === 0) {
          return;
        }

        const responseProtocol = protocols.find(p => p.id === protocol.id);
        expect(responseProtocol).toBeDefined();
        expectedSymbols.forEach(symbol => {
          expect(responseProtocol.targetTokens).toContain(symbol);
        });
      });
    });

    it('should filter out empty/undefined tokens', () => {
      protocols.forEach(protocol => {
        protocol.targetTokens.forEach(token => {
          expect(token).toBeTruthy();
          expect(token).not.toBe('');
          expect(token).not.toBe(null);
          expect(token).not.toBe(undefined);
        });
      });
    });
  });

  describe('Protocol formatting', () => {
    it('should correctly format protocol details using _formatProtocolDetails', () => {
      const IntentController = require('../src/controllers/IntentController');

      // Test protocol with chain suffix in name
      const mockProtocolWithSuffix = {
        id: 'test-protocol',
        name: 'Test Protocol (Arbitrum)',
        implementation: 'TestProtocol',
        chain: 'arbitrum',
        chainId: 42161,
        weight: 25,
        enabled: true,
        config: {
          mode: 'single',
          zapTokenStrategy: {
            type: 'fixed',
            token: {
              symbol: 'USDC',
              address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
              decimals: 6,
            },
          },
        },
      };

      const formatted = IntentController._formatProtocolDetails(
        mockProtocolWithSuffix
      );

      expect(formatted.name).toBe('Test Protocol'); // Chain suffix removed
      expect(formatted.targetTokens).toEqual(['USDC']);
      expect(formatted.enabled).toBe(true);
      expect(formatted.mode).toBe('single');
    });

    it('should handle protocol with default output token strategy', () => {
      const IntentController = require('../src/controllers/IntentController');

      const mockProtocol = {
        id: 'test-protocol-2',
        name: 'Test Protocol 2',
        implementation: 'TestProtocol2',
        chain: 'base',
        chainId: 8453,
        weight: 30,
        enabled: false,
        config: {
          mode: 'single',
          zapTokenStrategy: {
            type: 'passthrough',
            defaultOutputToken: {
              symbol: 'WETH',
              address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
              decimals: 18,
            },
          },
        },
      };

      const formatted = IntentController._formatProtocolDetails(mockProtocol);

      expect(formatted.targetTokens).toEqual(['WETH']);
      expect(formatted.enabled).toBe(false);
    });

    it('should handle LP protocol with lpTokens', () => {
      const IntentController = require('../src/controllers/IntentController');

      const mockLPProtocol = {
        id: 'test-lp-protocol',
        name: 'Test LP Protocol (Base)',
        implementation: 'TestLPProtocol',
        chain: 'base',
        chainId: 8453,
        weight: 40,
        config: {
          mode: 'LP',
          lpTokens: [
            ['USDC', '0x123...', 6],
            ['WETH', '0x456...', 18],
          ],
        },
      };

      const formatted = IntentController._formatProtocolDetails(mockLPProtocol);

      expect(formatted.name).toBe('Test LP Protocol'); // Chain suffix removed
      expect(formatted.targetTokens).toEqual(['USDC', 'WETH']);
      expect(formatted.mode).toBe('LP');
      expect(formatted.enabled).toBe(true); // Default when not specified
    });

    it('should handle protocol with missing optional fields', () => {
      const IntentController = require('../src/controllers/IntentController');

      const mockMinimalProtocol = {
        id: 'minimal-protocol',
        name: 'Minimal Protocol',
        implementation: 'MinimalProtocol',
        chain: 'ethereum',
        chainId: 1,
        weight: 10,
        // No config or enabled field
      };

      const formatted =
        IntentController._formatProtocolDetails(mockMinimalProtocol);

      expect(formatted.targetTokens).toEqual(['ANY']);
      expect(formatted.enabled).toBe(true); // Default enabled
      expect(formatted.mode).toBe('single'); // Default mode
    });

    // Enhanced edge cases for _formatProtocolDetails
    it('should handle null protocol object', () => {
      const IntentController = require('../src/controllers/IntentController');

      expect(() => {
        IntentController._formatProtocolDetails(null);
      }).toThrow();
    });

    it('should handle undefined protocol object', () => {
      const IntentController = require('../src/controllers/IntentController');

      expect(() => {
        IntentController._formatProtocolDetails(undefined);
      }).toThrow();
    });

    it('should handle protocol with null config', () => {
      const IntentController = require('../src/controllers/IntentController');

      const mockProtocol = {
        id: 'null-config-protocol',
        name: 'Null Config Protocol',
        implementation: 'NullProtocol',
        chain: 'arbitrum',
        chainId: 42161,
        weight: 50,
        enabled: true,
        config: null,
      };

      const formatted = IntentController._formatProtocolDetails(mockProtocol);

      expect(formatted.mode).toBe('single'); // Default mode
      expect(formatted.targetTokens).toEqual(['ANY']);
      expect(formatted.enabled).toBe(true);
    });

    it('should handle protocol with undefined config', () => {
      const IntentController = require('../src/controllers/IntentController');

      const mockProtocol = {
        id: 'undefined-config-protocol',
        name: 'Undefined Config Protocol',
        implementation: 'UndefinedProtocol',
        chain: 'base',
        chainId: 8453,
        weight: 50,
        // config: undefined (implicit)
      };

      const formatted = IntentController._formatProtocolDetails(mockProtocol);

      expect(formatted.mode).toBe('single');
      expect(formatted.targetTokens).toEqual(['ANY']);
      expect(formatted.enabled).toBe(true); // Default when not specified
    });

    it('should handle protocol with empty lpTokens array', () => {
      const IntentController = require('../src/controllers/IntentController');

      const mockProtocol = {
        id: 'empty-lp-protocol',
        name: 'Empty LP Protocol',
        implementation: 'EmptyLPProtocol',
        chain: 'ethereum',
        chainId: 1,
        weight: 25,
        config: {
          mode: 'LP',
          lpTokens: [], // Empty array
        },
      };

      const formatted = IntentController._formatProtocolDetails(mockProtocol);

      expect(formatted.mode).toBe('LP');
      expect(formatted.targetTokens).toEqual(['ANY']);
    });

    it('should handle protocol with malformed lpTokens', () => {
      const IntentController = require('../src/controllers/IntentController');

      const mockProtocol = {
        id: 'malformed-lp-protocol',
        name: 'Malformed LP Protocol',
        implementation: 'MalformedProtocol',
        chain: 'ethereum',
        chainId: 1,
        weight: 25,
        config: {
          mode: 'LP',
          lpTokens: [
            'invalid_format', // Not an array
            ['USDC'], // Missing elements
            ['WETH', '0x456', 18], // Valid format
          ],
        },
      };

      const formatted = IntentController._formatProtocolDetails(mockProtocol);

      expect(formatted.mode).toBe('LP');
      // Should handle malformed entries gracefully
      expect(Array.isArray(formatted.targetTokens)).toBe(true);
    });

    it('should handle protocol with multiple zap token options', () => {
      const IntentController = require('../src/controllers/IntentController');

      const mockProtocol = {
        id: 'dual-token-protocol',
        name: 'Dual Token Protocol',
        implementation: 'DualProtocol',
        chain: 'optimism',
        chainId: 10,
        weight: 50,
        config: {
          mode: 'single',
          zapTokenStrategy: {
            type: 'options',
            tokens: [
              {
                symbol: 'USDC',
                address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
                decimals: 6,
              },
              {
                symbol: 'WETH',
                address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
                decimals: 18,
              },
            ],
            defaultInputToken: {
              symbol: 'USDC',
              address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
              decimals: 6,
            },
            defaultOutputToken: {
              symbol: 'WETH',
              address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
              decimals: 18,
            },
          },
        },
      };

      const formatted = IntentController._formatProtocolDetails(mockProtocol);

      expect(formatted.targetTokens).toEqual(['USDC', 'WETH']);
    });

    it('should handle protocol with complex chain suffix patterns', () => {
      const IntentController = require('../src/controllers/IntentController');

      const testCases = [
        { name: 'Protocol (Arbitrum One)', expected: 'Protocol' },
        { name: 'Protocol (Base Mainnet)', expected: 'Protocol' },
        { name: 'Protocol (Optimism Goerli)', expected: 'Protocol' },
        { name: 'Protocol (L2)', expected: 'Protocol' },
        { name: 'Protocol (Test Network)', expected: 'Protocol' },
        { name: 'Protocol V2 (Mainnet)', expected: 'Protocol V2' },
        { name: 'Protocol (No Suffix', expected: 'Protocol (No Suffix' }, // Malformed
      ];

      testCases.forEach(({ name, expected }) => {
        const mockProtocol = {
          id: 'test-protocol',
          name,
          implementation: 'TestProtocol',
          chain: 'arbitrum',
          chainId: 42161,
          weight: 50,
        };

        const formatted = IntentController._formatProtocolDetails(mockProtocol);
        expect(formatted.name).toBe(expected);
      });
    });

    it('should handle protocol with enabled field as different types', () => {
      const IntentController = require('../src/controllers/IntentController');

      const testCases = [
        { enabled: true, expected: true },
        { enabled: false, expected: false },
        { enabled: 'true', expected: true }, // Truthy string
        { enabled: 'false', expected: true }, // Truthy string (not false)
        { enabled: 1, expected: true }, // Truthy number
        { enabled: 0, expected: true }, // 0 !== false, so true
        { enabled: null, expected: true }, // null !== false, so true
        { enabled: undefined, expected: true }, // Default when undefined
      ];

      testCases.forEach(({ enabled, expected }, index) => {
        const mockProtocol = {
          id: `test-protocol-${index}`,
          name: 'Test Protocol',
          implementation: 'TestProtocol',
          chain: 'ethereum',
          chainId: 1,
          weight: 50,
          enabled,
        };

        // Handle undefined case by not including the field
        if (enabled === undefined) {
          delete mockProtocol.enabled;
        }

        const formatted = IntentController._formatProtocolDetails(mockProtocol);
        expect(formatted.enabled).toBe(expected);
      });
    });

    it('should handle protocol with unusual weight values', () => {
      const IntentController = require('../src/controllers/IntentController');

      const testCases = [
        { weight: 0, valid: true },
        { weight: 100, valid: true },
        { weight: 0.5, valid: true },
        { weight: 999.99, valid: true },
        { weight: -10, valid: true }, // Negative weights should still work
        { weight: '50', valid: true }, // String numbers
        { weight: null, valid: true }, // Should preserve null
        { weight: undefined, valid: true }, // Should preserve undefined
      ];

      testCases.forEach(({ weight, valid }) => {
        const mockProtocol = {
          id: 'test-protocol',
          name: 'Test Protocol',
          implementation: 'TestProtocol',
          chain: 'ethereum',
          chainId: 1,
          weight,
        };

        if (valid) {
          const formatted =
            IntentController._formatProtocolDetails(mockProtocol);
          expect(formatted.weight).toBe(weight);
        }
      });
    });
  });

  describe('Configuration consistency', () => {
    it('should match strategies from unified zap config', async () => {
      const UNIFIED_ZAP_CONFIG = require('../src/config/unifiedZapConfig');
      const response = await request(app).get('/api/v1/strategies');

      const configStrategyIds = Object.keys(
        UNIFIED_ZAP_CONFIG.STRATEGY_CATEGORIES
      );
      const responseStrategyIds = response.body.strategies.map(s => s.id);

      expect(responseStrategyIds.sort()).toEqual(configStrategyIds.sort());
    });

    it('should have consistent supported chains', async () => {
      const UNIFIED_ZAP_CONFIG = require('../src/config/unifiedZapConfig');
      const response = await request(app).get('/api/v1/strategies');

      const configChains = Object.keys(UNIFIED_ZAP_CONFIG.SUPPORTED_CHAINS);
      const responseChains = response.body.supportedChains;

      expect(responseChains.sort()).toEqual(configChains.sort());
    });
  });

  describe('Error handling', () => {
    it('should have proper error handling structure in controller', () => {
      // This test validates that the controller method has try-catch structure
      // by checking the source code structure rather than mocking
      const IntentController = require('../src/controllers/IntentController');
      expect(typeof IntentController.getStrategies).toBe('function');

      // Validate that the function string contains error handling patterns
      const funcString = IntentController.getStrategies.toString();
      expect(funcString).toMatch(/try/);
      expect(funcString).toMatch(/catch/);
      expect(funcString).toMatch(/error/);
    });

    it('should return proper error response format on internal server error', () => {
      // Mock the UNIFIED_ZAP_CONFIG to simulate an error condition
      const originalConfig = require('../src/config/unifiedZapConfig');
      const IntentController = require('../src/controllers/IntentController');

      // Temporarily replace config with invalid data
      const mockReq = {};
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      // Save original config
      const originalStrategyCategories = originalConfig.STRATEGY_CATEGORIES;

      try {
        // Mock a problematic config that would cause an error
        originalConfig.STRATEGY_CATEGORIES = null;

        IntentController.getStrategies(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get available strategies',
          },
        });
      } finally {
        // Restore original config
        originalConfig.STRATEGY_CATEGORIES = originalStrategyCategories;
      }
    });
  });

  describe('Protocol name extraction', () => {
    let protocols;

    beforeAll(async () => {
      const response = await request(app).get('/api/v1/strategies');
      protocols = response.body.strategies.flatMap(s => s.protocols);
    });

    it('should extract correct protocol names from IDs', () => {
      const protocolMappings = {
        'aave-usdc-base': 'aave',
        'pendle-pt-gusdc-arbitrum': 'pendle',
        'velodrome-bold-usdc-base': 'velodrome',
        'velodrome-usdc-susd-optimism': 'velodrome',
        'lido-steth-ethereum': 'lido',
        'rocketpool-reth-ethereum': 'rocketpool',
      };

      protocols.forEach(protocol => {
        if (protocolMappings[protocol.id]) {
          expect(protocol.protocol).toBe(protocolMappings[protocol.id]);
        }
      });
    });

    it('should have lowercase protocol names', () => {
      protocols.forEach(protocol => {
        expect(protocol.protocol).toBe(protocol.protocol.toLowerCase());
      });
    });

    it('should not have empty protocol names', () => {
      protocols.forEach(protocol => {
        expect(protocol.protocol).toBeTruthy();
        expect(protocol.protocol.length).toBeGreaterThan(0);
        expect(protocol.protocol).not.toBe('unknown');
      });
    });

    it('should extract protocol names consistently across chains', () => {
      // Group protocols by their core name
      const protocolsByName = {};
      protocols.forEach(protocol => {
        if (!protocolsByName[protocol.protocol]) {
          protocolsByName[protocol.protocol] = [];
        }
        protocolsByName[protocol.protocol].push(protocol);
      });

      // Check that protocols with the same name have consistent extraction
      Object.keys(protocolsByName).forEach(protocolName => {
        const protocolGroup = protocolsByName[protocolName];
        if (protocolGroup.length > 1) {
          // All protocols in this group should have the same protocol name
          protocolGroup.forEach(protocol => {
            expect(protocol.protocol).toBe(protocolName);
          });
        }
      });
    });

    it('should match protocol names with implementations', () => {
      protocols.forEach(protocol => {
        const implLower = protocol.implementation
          .replace(/Protocol$/, '')
          .toLowerCase();

        // For most cases, protocol name should match implementation prefix
        if (!['pendlept', 'rocketpool'].includes(implLower)) {
          expect(implLower).toContain(protocol.protocol);
        }
      });
    });
  });

  describe('Protocol name extraction edge cases', () => {
    const IntentController = require('../src/controllers/IntentController');

    it('should extract protocol name from id correctly', () => {
      const testCases = [
        { id: 'aave-usdc-base', expected: 'aave' },
        { id: 'pendle-pt-gusdc-arbitrum', expected: 'pendle' },
        { id: 'velodrome-bold-usdc-base', expected: 'velodrome' },
        { id: 'compound-eth-mainnet', expected: 'compound' },
      ];

      testCases.forEach(({ id, expected }) => {
        const protocol = {
          id,
          name: 'Test Protocol',
          implementation: 'TestProtocol',
        };
        const result = IntentController._extractProtocolName(protocol);
        expect(result).toBe(expected);
      });
    });

    it('should fallback to name extraction when id is missing', () => {
      const protocol = {
        name: 'Uniswap V3 Pool',
        implementation: 'UniswapProtocol',
      };
      const result = IntentController._extractProtocolName(protocol);
      expect(result).toBe('uniswap');
    });

    it('should fallback to implementation when id and name are missing', () => {
      const protocol = { implementation: 'SushiswapProtocol' };
      const result = IntentController._extractProtocolName(protocol);
      expect(result).toBe('sushiswap');
    });

    it('should return unknown when all fields are missing', () => {
      const protocol = {};
      const result = IntentController._extractProtocolName(protocol);
      expect(result).toBe('unknown');
    });

    it('should handle special implementation names', () => {
      const testCases = [
        { implementation: 'PendlePTProtocol', expected: 'pendlept' },
        { implementation: 'RocketPoolProtocol', expected: 'rocketpool' },
        { implementation: 'CompoundV2Protocol', expected: 'compoundv2' },
      ];

      testCases.forEach(({ implementation, expected }) => {
        const protocol = { implementation };
        const result = IntentController._extractProtocolName(protocol);
        expect(result).toBe(expected);
      });
    });

    // Enhanced edge cases for better coverage
    it('should handle null and undefined protocol objects', () => {
      // These should throw errors since the method doesn't handle null/undefined gracefully
      expect(() => IntentController._extractProtocolName(null)).toThrow();
      expect(() => IntentController._extractProtocolName(undefined)).toThrow();
    });

    it('should handle empty string values', () => {
      const testCases = [
        { id: '', name: 'Test', implementation: 'Test', expected: 'test' },
        { id: 'test', name: '', implementation: 'Test', expected: 'test' },
        { id: 'test', name: 'Test', implementation: '', expected: 'test' },
        { id: '', name: '', implementation: '', expected: 'unknown' },
      ];

      testCases.forEach(({ id, name, implementation, expected }) => {
        const protocol = { id, name, implementation };
        const result = IntentController._extractProtocolName(protocol);
        expect(result).toBe(expected);
      });
    });

    it('should handle whitespace-only values', () => {
      const testCases = [
        { id: '   ', name: 'Test', implementation: 'Test', expected: '   ' }, // Method returns first part of split
        { id: 'test', name: '   ', implementation: 'Test', expected: 'test' },
        { id: 'test', name: 'Test', implementation: '   ', expected: 'test' },
        { id: '\t\n', name: '\t\n', implementation: '\t\n', expected: '\t\n' },
      ];

      testCases.forEach(({ id, name, implementation, expected }) => {
        const protocol = { id, name, implementation };
        const result = IntentController._extractProtocolName(protocol);
        expect(result).toBe(expected);
      });
    });

    it('should handle special characters in protocol names', () => {
      const testCases = [
        { id: 'test@protocol-v2', expected: 'test@protocol' }, // Splits on '-', takes first part
        { id: 'protocol_v3.1-beta', expected: 'protocol_v3.1' }, // Splits on '-', takes first part
        {
          name: 'Test Protocol (v2)',
          implementation: 'Test',
          expected: 'test',
        }, // Splits on space, takes first part
        {
          name: 'Protocol-X.Y.Z',
          implementation: 'Test',
          expected: 'protocol-x.y.z',
        }, // No space split, takes whole thing
        { implementation: 'Test@Protocol#1', expected: 'test@protocol#1' }, // Removes 'Protocol' suffix from end only
      ];

      testCases.forEach(({ id, name, implementation, expected }) => {
        const protocol = { id, name, implementation };
        const result = IntentController._extractProtocolName(protocol);
        expect(result).toBe(expected);
      });
    });

    it('should handle Unicode and international characters', () => {
      const testCases = [
        { id: 'aavé-protocol', expected: 'aavé' },
        { name: 'Uniswap 中文', implementation: 'Test', expected: 'uniswap' },
        { implementation: 'ProtocolΩ', expected: 'protocolω' },
        { id: 'протокол-test', expected: 'протокол' },
      ];

      testCases.forEach(({ id, name, implementation, expected }) => {
        const protocol = { id, name, implementation };
        const result = IntentController._extractProtocolName(protocol);
        expect(result).toBe(expected);
      });
    });

    it('should handle very long protocol names', () => {
      const longId = `${'a'.repeat(1000)}-test-protocol`;
      const protocol = { id: longId };
      const result = IntentController._extractProtocolName(protocol);
      expect(result).toBe('a'.repeat(1000));
      expect(result.length).toBe(1000);
    });

    it('should handle protocol names with numbers', () => {
      const testCases = [
        { id: 'v3-uniswap-protocol', expected: 'v3' },
        { id: '1inch-v4-router', expected: '1inch' },
        { name: 'Protocol V2.1', implementation: 'Test', expected: 'protocol' },
        { implementation: 'V3Protocol2022', expected: 'v3protocol2022' },
      ];

      testCases.forEach(({ id, name, implementation, expected }) => {
        const protocol = { id, name, implementation };
        const result = IntentController._extractProtocolName(protocol);
        expect(result).toBe(expected);
      });
    });

    it('should handle protocols with multiple hyphens in id', () => {
      const testCases = [
        { id: 'aave-v2-lending-pool-arbitrum', expected: 'aave' },
        { id: 'compound-v3-usdc-base-mainnet', expected: 'compound' },
        { id: 'uniswap-v3-swap-router-optimism', expected: 'uniswap' },
        { id: 'curve-3pool-metapool-ethereum', expected: 'curve' },
      ];

      testCases.forEach(({ id, expected }) => {
        const protocol = { id, name: 'Test', implementation: 'Test' };
        const result = IntentController._extractProtocolName(protocol);
        expect(result).toBe(expected);
      });
    });

    it('should handle protocols with underscores and dots', () => {
      const testCases = [
        {
          name: 'Test_Protocol.v2',
          implementation: 'Test',
          expected: 'test_protocol.v2',
        }, // Splits on space, takes first part
        {
          name: 'Protocol.io V3',
          implementation: 'Test',
          expected: 'protocol.io',
        }, // Splits on space, takes first part
        {
          implementation: 'Test_Protocol_V2.sol',
          expected: 'test_protocol_v2.sol',
        }, // Removes 'Protocol' suffix
      ];

      testCases.forEach(({ name, implementation, expected }) => {
        const protocol = { name, implementation };
        const result = IntentController._extractProtocolName(protocol);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Data validation edge cases', () => {
    let strategies;

    beforeAll(async () => {
      const response = await request(app).get('/api/v1/strategies');
      strategies = response.body.strategies;
    });

    it('should handle empty target assets gracefully', () => {
      strategies.forEach(strategy => {
        expect(Array.isArray(strategy.targetAssets)).toBe(true);
        // Even if empty, should be an array
      });
    });

    it('should handle missing protocol config gracefully', () => {
      const protocols = strategies.flatMap(s => s.protocols);

      protocols.forEach(protocol => {
        // Should have default mode if not specified
        expect(['single', 'LP']).toContain(protocol.mode);

        // Should have enabled status (default true if not specified)
        expect(typeof protocol.enabled).toBe('boolean');
      });
    });

    it('should handle special characters in protocol names', () => {
      const protocols = strategies.flatMap(s => s.protocols);

      protocols.forEach(protocol => {
        // Names should be safe for JSON
        expect(typeof protocol.name).toBe('string');
        expect(protocol.name.length).toBeGreaterThan(0);

        // Should not contain control characters (null, tabs, etc.)
        // Using string-based validation to avoid ESLint control-regex issues
        const hasNullChar = protocol.name.includes('\u0000');
        const hasControlChar = protocol.name.includes('\u0001');
        expect(hasNullChar).toBe(false);
        expect(hasControlChar).toBe(false);
      });
    });

    it('should have consistent protocol IDs (no duplicates across strategies)', () => {
      const allProtocols = strategies.flatMap(s => s.protocols);
      const protocolIds = allProtocols.map(p => p.id);
      const uniqueIds = [...new Set(protocolIds)];

      expect(uniqueIds.length).toBe(protocolIds.length);
    });

    it('should have valid strategy display names', () => {
      strategies.forEach(strategy => {
        expect(strategy.displayName).toBeTruthy();
        expect(typeof strategy.displayName).toBe('string');
        expect(strategy.displayName.length).toBeGreaterThan(0);
        expect(strategy.displayName.length).toBeLessThan(100); // Reasonable limit
      });
    });

    it('should have non-empty descriptions', () => {
      strategies.forEach(strategy => {
        expect(strategy.description).toBeTruthy();
        expect(typeof strategy.description).toBe('string');
        expect(strategy.description.length).toBeGreaterThan(10); // Meaningful description
      });
    });
  });

  describe('Performance and async behavior', () => {
    it('should respond within reasonable time', async () => {
      const startTime = Date.now();
      const response = await request(app).get('/api/v1/strategies');
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeLessThan(1000); // Should respond within 1 second
    });

    it('should handle concurrent requests properly', async () => {
      const requests = Array(5)
        .fill()
        .map(() => request(app).get('/api/v1/strategies'));

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.strategies)).toBe(true);
      });

      // All responses should be identical (deterministic)
      const firstResponse = responses[0].body;
      responses.slice(1).forEach(response => {
        expect(response.body.strategies.length).toBe(
          firstResponse.strategies.length
        );
        expect(response.body.total).toBe(firstResponse.total);
      });
    });

    it('should maintain consistent structure across multiple calls', async () => {
      const response1 = await request(app).get('/api/v1/strategies');
      const response2 = await request(app).get('/api/v1/strategies');

      expect(response1.body.strategies.length).toBe(
        response2.body.strategies.length
      );
      expect(response1.body.total).toBe(response2.body.total);
      expect(response1.body.supportedChains.length).toBe(
        response2.body.supportedChains.length
      );

      // Strategy IDs should be the same
      const ids1 = response1.body.strategies.map(s => s.id).sort();
      const ids2 = response2.body.strategies.map(s => s.id).sort();
      expect(ids1).toEqual(ids2);
    });
  });
});
