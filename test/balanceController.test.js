/**
 * Balance Controller Unit Tests
 *
 * Tests the controller layer in isolation with mocked BalanceService.
 * Focuses on:
 * - Request parameter parsing
 * - Service method invocation with correct parameters
 * - Response formatting and status codes
 * - Error handling and error code mapping
 * - Edge cases and input validation
 */

// Mock BalanceService before requiring the controller
jest.mock('../src/services/balanceService');

const BalanceController = require('../src/controllers/balanceController');

describe('BalanceController Unit Tests', () => {
  let mockRequest;
  let mockResponse;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock request object
    mockRequest = {
      params: {},
      query: {},
      body: {},
    };

    // Create mock response object
    mockResponse = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };

    // Get the mock service from the controller
    const mockService = BalanceController.balanceService;

    // Reset mock method implementations
    mockService.getBalances.mockReset();
    mockService.getNativeBalance.mockReset();
    mockService.getCacheStats.mockReset();
    mockService.clearAddressCache.mockReset();
    mockService.clearChainCache.mockReset();
    mockService.getSupportedChains.mockReset();
  });

  describe('getBalances', () => {
    beforeEach(() => {
      mockRequest.params = {
        chainId: '1',
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      };
    });

    test('should return balances for valid request', async () => {
      const mockBalanceData = {
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        chainId: '1',
        balances: [
          {
            tokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            symbol: 'USDC',
            decimals: 6,
            balance: '1000000',
            balanceFormatted: '1',
          },
        ],
        totalTokens: 1,
        timestamp: Date.now(),
        cacheHit: false,
      };

      const mockService = BalanceController.balanceService;
      mockService.getBalances.mockResolvedValue(mockBalanceData);

      await BalanceController.getBalances(mockRequest, mockResponse);

      // Verify service was called with correct parameters
      expect(mockService.getBalances).toHaveBeenCalledWith(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        {
          chainId: '1',
          tokenAddresses: null,
          includeNative: false,
          skipCache: false,
        }
      );

      // Verify response format
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockBalanceData,
        cached: false,
      });
    });

    test('should parse tokens query parameter correctly', async () => {
      mockRequest.query.tokens = '0xToken1,0xToken2,0xToken3';

      const mockBalanceData = {
        address: mockRequest.params.address,
        chainId: '1',
        balances: [],
        totalTokens: 0,
        timestamp: Date.now(),
        cacheHit: false,
      };

      BalanceController.balanceService.getBalances.mockResolvedValue(
        mockBalanceData
      );

      await BalanceController.getBalances(mockRequest, mockResponse);

      // Verify tokens were parsed and passed to service
      expect(BalanceController.balanceService.getBalances).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tokenAddresses: ['0xToken1', '0xToken2', '0xToken3'],
          includeNative: false,
        })
      );
    });

    test('should detect native flag in tokens query parameter', async () => {
      mockRequest.query.tokens = 'native,0xToken1,0xToken2';

      const mockBalanceData = {
        address: mockRequest.params.address,
        chainId: '1',
        balances: [],
        totalTokens: 0,
        timestamp: Date.now(),
        cacheHit: false,
      };

      BalanceController.balanceService.getBalances.mockResolvedValue(
        mockBalanceData
      );

      await BalanceController.getBalances(mockRequest, mockResponse);

      expect(BalanceController.balanceService.getBalances).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tokenAddresses: ['0xToken1', '0xToken2'],
          includeNative: true,
        })
      );
    });

    test('should handle skipCache query parameter', async () => {
      mockRequest.query.skipCache = 'true';

      const mockBalanceData = {
        address: mockRequest.params.address,
        chainId: '1',
        balances: [],
        totalTokens: 0,
        timestamp: Date.now(),
        cacheHit: false,
      };

      BalanceController.balanceService.getBalances.mockResolvedValue(
        mockBalanceData
      );

      await BalanceController.getBalances(mockRequest, mockResponse);

      expect(BalanceController.balanceService.getBalances).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          includeNative: false,
          skipCache: true,
        })
      );
    });

    test('should filter out empty token addresses', async () => {
      mockRequest.query.tokens = '0xToken1,,0xToken2, ,0xToken3';

      const mockBalanceData = {
        address: mockRequest.params.address,
        chainId: '1',
        balances: [],
        totalTokens: 0,
        timestamp: Date.now(),
        cacheHit: false,
      };

      BalanceController.balanceService.getBalances.mockResolvedValue(
        mockBalanceData
      );

      await BalanceController.getBalances(mockRequest, mockResponse);

      // Verify empty strings were filtered out
      expect(BalanceController.balanceService.getBalances).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tokenAddresses: ['0xToken1', '0xToken2', '0xToken3'],
          includeNative: false,
        })
      );
    });

    test('should set cached flag from cacheHit in response', async () => {
      const mockBalanceData = {
        address: mockRequest.params.address,
        chainId: '1',
        balances: [],
        totalTokens: 0,
        timestamp: Date.now(),
        cacheHit: true,
      };

      BalanceController.balanceService.getBalances.mockResolvedValue(
        mockBalanceData
      );

      await BalanceController.getBalances(mockRequest, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockBalanceData,
        cached: true,
      });
    });

    test('should default cached to false if cacheHit is undefined', async () => {
      const mockBalanceData = {
        address: mockRequest.params.address,
        chainId: '1',
        balances: [],
        totalTokens: 0,
        timestamp: Date.now(),
        // cacheHit not provided
      };

      BalanceController.balanceService.getBalances.mockResolvedValue(
        mockBalanceData
      );

      await BalanceController.getBalances(mockRequest, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockBalanceData,
        cached: false,
      });
    });

    describe('Error Handling', () => {
      test('should return 400 for invalid address error', async () => {
        const error = new Error('Invalid wallet address format');
        BalanceController.balanceService.getBalances.mockRejectedValue(error);

        await BalanceController.getBalances(mockRequest, mockResponse);

        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Invalid wallet address format',
            details: undefined,
          },
        });
      });

      test('should return 400 for unsupported chain error', async () => {
        const error = new Error('Chain ID 999 is not supported');
        BalanceController.balanceService.getBalances.mockRejectedValue(error);

        await BalanceController.getBalances(mockRequest, mockResponse);

        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'UNSUPPORTED_CHAIN',
            message: expect.stringContaining('not supported'),
            details: undefined,
          },
        });
      });

      test('should return 429 for rate limit error', async () => {
        const error = new Error('Moralis API rate limit exceeded');
        BalanceController.balanceService.getBalances.mockRejectedValue(error);

        await BalanceController.getBalances(mockRequest, mockResponse);

        expect(mockResponse.status).toHaveBeenCalledWith(429);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Moralis API rate limit exceeded',
            details: undefined,
          },
        });
      });

      test('should return 503 for RPC/provider errors', async () => {
        const error = new Error('RPC provider unavailable');
        BalanceController.balanceService.getBalances.mockRejectedValue(error);

        await BalanceController.getBalances(mockRequest, mockResponse);

        expect(mockResponse.status).toHaveBeenCalledWith(503);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'RPC_ERROR',
            message: 'RPC provider unavailable',
            details: undefined,
          },
        });
      });

      test('should return 500 for unknown errors', async () => {
        const error = new Error('Unknown error occurred');
        BalanceController.balanceService.getBalances.mockRejectedValue(error);

        await BalanceController.getBalances(mockRequest, mockResponse);

        expect(mockResponse.status).toHaveBeenCalledWith(500);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Unknown error occurred',
            details: undefined,
          },
        });
      });

      test('should use error code if already present', async () => {
        const error = new Error('Custom error message');
        error.code = 'CUSTOM_ERROR_CODE';
        BalanceController.balanceService.getBalances.mockRejectedValue(error);

        await BalanceController.getBalances(mockRequest, mockResponse);

        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'CUSTOM_ERROR_CODE',
            message: 'Custom error message',
            details: undefined,
          },
        });
      });

      test('should include error details if provided', async () => {
        const error = new Error('Invalid address provided');
        error.details = { field: 'address', reason: 'Invalid format' };
        BalanceController.balanceService.getBalances.mockRejectedValue(error);

        await BalanceController.getBalances(mockRequest, mockResponse);

        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Invalid address provided',
            details: { field: 'address', reason: 'Invalid format' },
          },
        });
      });
    });
  });

  describe('getNativeBalance', () => {
    beforeEach(() => {
      mockRequest.params = {
        chainId: '1',
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      };
    });

    test('should return native balance successfully', async () => {
      const mockNativeBalance = {
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        chainId: '1',
        balance: '1000000000000000000',
        balanceFormatted: '1',
        timestamp: Date.now(),
      };

      BalanceController.balanceService.getNativeBalance.mockResolvedValue(
        mockNativeBalance
      );

      await BalanceController.getNativeBalance(mockRequest, mockResponse);

      expect(
        BalanceController.balanceService.getNativeBalance
      ).toHaveBeenCalledWith('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', '1');

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockNativeBalance,
      });
    });

    test('should handle errors for native balance', async () => {
      const error = new Error('Failed to fetch native balance');
      BalanceController.balanceService.getNativeBalance.mockRejectedValue(
        error
      );

      await BalanceController.getNativeBalance(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch native balance',
          details: undefined,
        },
      });
    });
  });

  describe('getCacheStats', () => {
    test('should return cache statistics', async () => {
      const mockStats = {
        hits: 100,
        misses: 20,
        sets: 20,
        evictions: 5,
        size: 15,
        hitRate: '83.33%',
        memoryUsage: '7.5 KB',
      };

      BalanceController.balanceService.getCacheStats.mockReturnValue(mockStats);

      await BalanceController.getCacheStats(mockRequest, mockResponse);

      expect(BalanceController.balanceService.getCacheStats).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockStats,
      });
    });

    test('should handle errors when getting cache stats', async () => {
      const error = new Error('Failed to get cache stats');
      BalanceController.balanceService.getCacheStats.mockImplementation(() => {
        throw error;
      });

      await BalanceController.getCacheStats(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get cache stats',
        },
      });
    });
  });

  describe('clearCache', () => {
    test('should clear cache by address', async () => {
      mockRequest.query.address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      BalanceController.balanceService.clearAddressCache.mockReturnValue(5);

      await BalanceController.clearCache(mockRequest, mockResponse);

      expect(
        BalanceController.balanceService.clearAddressCache
      ).toHaveBeenCalledWith('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          cleared: 5,
          message: 'Cleared 5 cache entries',
        },
      });
    });

    test('should clear cache by chainId', async () => {
      mockRequest.query.chainId = '1';
      BalanceController.balanceService.clearChainCache.mockReturnValue(10);

      await BalanceController.clearCache(mockRequest, mockResponse);

      expect(
        BalanceController.balanceService.clearChainCache
      ).toHaveBeenCalledWith('1');

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          cleared: 10,
          message: 'Cleared 10 cache entries',
        },
      });
    });

    test('should return 400 if neither address nor chainId provided', async () => {
      await BalanceController.clearCache(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Either address or chainId parameter is required',
        },
      });

      // Verify cache methods were not called
      expect(
        BalanceController.balanceService.clearAddressCache
      ).not.toHaveBeenCalled();
      expect(
        BalanceController.balanceService.clearChainCache
      ).not.toHaveBeenCalled();
    });

    test('should handle errors when clearing cache', async () => {
      mockRequest.query.address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      const error = new Error('Failed to clear cache');
      BalanceController.balanceService.clearAddressCache.mockImplementation(
        () => {
          throw error;
        }
      );

      await BalanceController.clearCache(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to clear cache',
        },
      });
    });
  });

  describe('getSupportedChains', () => {
    test('should return list of supported chains', async () => {
      const mockChains = ['1', '137', '56', '42161', '10', '8453', '43114'];
      BalanceController.balanceService.getSupportedChains.mockReturnValue(
        mockChains
      );

      await BalanceController.getSupportedChains(mockRequest, mockResponse);

      expect(
        BalanceController.balanceService.getSupportedChains
      ).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          chains: mockChains,
          count: 7,
        },
      });
    });

    test('should handle errors when getting supported chains', async () => {
      const error = new Error('Failed to get chains');
      BalanceController.balanceService.getSupportedChains.mockImplementation(
        () => {
          throw error;
        }
      );

      await BalanceController.getSupportedChains(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get chains',
        },
      });
    });
  });

  describe('Error Code Mapping', () => {
    test('should map "Invalid" messages to INVALID_INPUT', async () => {
      const error = new Error('Invalid input detected');
      BalanceController.balanceService.getBalances.mockRejectedValue(error);

      await BalanceController.getBalances(mockRequest, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_INPUT',
          }),
        })
      );
    });

    test('should map "not supported" messages to UNSUPPORTED_CHAIN', async () => {
      const error = new Error('Chain not supported');
      BalanceController.balanceService.getBalances.mockRejectedValue(error);

      await BalanceController.getBalances(mockRequest, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'UNSUPPORTED_CHAIN',
          }),
        })
      );
    });

    test('should map RPC/provider messages to RPC_ERROR', async () => {
      const error = new Error('RPC call failed');
      BalanceController.balanceService.getBalances.mockRejectedValue(error);

      await BalanceController.getBalances(mockRequest, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'RPC_ERROR',
          }),
        })
      );
    });

    test('should map rate limit messages to RATE_LIMIT_EXCEEDED', async () => {
      const error = new Error('rate limit hit');
      BalanceController.balanceService.getBalances.mockRejectedValue(error);

      await BalanceController.getBalances(mockRequest, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'RATE_LIMIT_EXCEEDED',
          }),
        })
      );
    });
  });

  describe('Status Code Mapping', () => {
    test('should return 400 for validation errors', async () => {
      const errors = [
        'Invalid address',
        'chainId is required',
        'address must be valid',
      ];

      for (const errorMsg of errors) {
        jest.clearAllMocks();
        const error = new Error(errorMsg);
        BalanceController.balanceService.getBalances.mockRejectedValue(error);

        await BalanceController.getBalances(mockRequest, mockResponse);

        expect(mockResponse.status).toHaveBeenCalledWith(400);
      }
    });

    test('should return appropriate status for network/provider errors', async () => {
      const cases = [
        { message: 'RPC endpoint unavailable', expected: 503 },
        { message: 'provider connection failed', expected: 503 },
        { message: 'network timeout', expected: 500 },
      ];

      for (const { message, expected } of cases) {
        jest.clearAllMocks();
        const error = new Error(message);
        BalanceController.balanceService.getBalances.mockRejectedValue(error);

        await BalanceController.getBalances(mockRequest, mockResponse);

        expect(mockResponse.status).toHaveBeenCalledWith(expected);
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty tokens query parameter', async () => {
      mockRequest.query.tokens = '';
      mockRequest.params = {
        chainId: '1',
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      };

      const mockBalanceData = {
        address: mockRequest.params.address,
        chainId: '1',
        balances: [],
        totalTokens: 0,
        timestamp: Date.now(),
        cacheHit: false,
      };

      BalanceController.balanceService.getBalances.mockResolvedValue(
        mockBalanceData
      );

      await BalanceController.getBalances(mockRequest, mockResponse);

      // Empty string should result in null tokenAddresses
      expect(BalanceController.balanceService.getBalances).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tokenAddresses: null,
        })
      );
    });

    test('should handle skipCache with non-true values', async () => {
      const testValues = ['false', 'no', '0', undefined, null];

      for (const value of testValues) {
        jest.clearAllMocks();
        mockRequest.query.skipCache = value;
        mockRequest.params = {
          chainId: '1',
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        };

        const mockBalanceData = {
          address: mockRequest.params.address,
          chainId: '1',
          balances: [],
          totalTokens: 0,
          timestamp: Date.now(),
          cacheHit: false,
        };

        BalanceController.balanceService.getBalances.mockResolvedValue(
          mockBalanceData
        );

        await BalanceController.getBalances(mockRequest, mockResponse);

        // Non-'true' values should result in skipCache: false
        expect(
          BalanceController.balanceService.getBalances
        ).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            skipCache: false,
          })
        );
      }
    });

    test('should handle whitespace in token addresses', async () => {
      mockRequest.query.tokens = ' 0xToken1 , 0xToken2 , 0xToken3 ';
      mockRequest.params = {
        chainId: '1',
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      };

      const mockBalanceData = {
        address: mockRequest.params.address,
        chainId: '1',
        balances: [],
        totalTokens: 0,
        timestamp: Date.now(),
        cacheHit: false,
      };

      BalanceController.balanceService.getBalances.mockResolvedValue(
        mockBalanceData
      );

      await BalanceController.getBalances(mockRequest, mockResponse);

      // Whitespace should be trimmed
      expect(BalanceController.balanceService.getBalances).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tokenAddresses: ['0xToken1', '0xToken2', '0xToken3'],
        })
      );
    });
  });
});
