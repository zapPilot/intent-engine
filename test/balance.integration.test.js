/**
 * Balance API Integration Tests
 *
 * Tests the complete balance API flow including:
 * - HTTP endpoint functionality with supertest
 * - Real Moralis API integration (mocked for deterministic tests)
 * - Rate limiting (per-wallet and global)
 * - Caching behavior (cache hit/miss)
 * - Error scenarios (invalid inputs, unsupported chains, API failures)
 * - Response format validation
 */

const request = require('supertest');

jest.mock('../src/utils/retry', () => {
  const actual = jest.requireActual('../src/utils/retry');

  return {
    ...actual,
    retryWithBackoff: async (fn, options = {}, shouldRetry) => {
      const mergedOptions = {
        retries: 3,
        ...options,
      };
      const retries = mergedOptions.retries ?? 3;

      for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
        try {
          return await fn();
        } catch (error) {
          const hasMoreAttempts = attempt <= retries;
          const shouldAttemptRetry = shouldRetry
            ? shouldRetry(error, attempt, mergedOptions)
            : true;

          if (!hasMoreAttempts || !shouldAttemptRetry) {
            throw error;
          }
        }
      }

      throw new Error('retryWithBackoff: Exhausted attempts without result');
    },
  };
});

// Mock axios for controlled Moralis API responses
jest.mock('axios');

const app = require('../src/app');
const BalanceController = require('../src/controllers/balanceController');
const axios = require('axios');

const { TEST_ADDRESSES } = require('./utils/testHelpers');

function readParam(params, key) {
  if (!params) {
    return undefined;
  }

  if (params instanceof URLSearchParams) {
    return params.get(key);
  }

  return params[key];
}

function readParamValues(params, key) {
  if (!params) {
    return [];
  }

  if (params instanceof URLSearchParams) {
    return params.getAll(key);
  }

  const value = params[key];
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [value];
}

describe('Balance API Integration Tests', () => {
  let originalApiKey;

  beforeAll(() => {
    // Store original API key
    originalApiKey = process.env.MORALIS_API_KEY;
    // Set test API key
    process.env.MORALIS_API_KEY = 'test-api-key';
    BalanceController.balanceService.setApiKey(process.env.MORALIS_API_KEY);
  });

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Access the singleton service instance to clear cache
    if (BalanceController.balanceService) {
      BalanceController.balanceService.cache.clear();
      BalanceController.balanceService.cache.resetStats();
      BalanceController.balanceService.setApiKey(process.env.MORALIS_API_KEY);
    }
  });

  afterAll(() => {
    // Restore original API key
    if (originalApiKey) {
      process.env.MORALIS_API_KEY = originalApiKey;
      BalanceController.balanceService.setApiKey(originalApiKey);
    }
    jest.clearAllTimers();
  });

  describe('GET /api/v1/balances/:chainId/:address', () => {
    const validAddress = TEST_ADDRESSES.VALID_USER;
    const validChainId = '1'; // Ethereum

    describe('Success Cases', () => {
      test('should return token balances for valid address and chain', async () => {
        // Mock Moralis API response
        const mockBalances = [
          {
            token_address: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: '6',
            balance: '1000000000',
            logo: null,
            thumbnail: null,
            possible_spam: false,
            verified_contract: true,
          },
          {
            token_address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: '18',
            balance: '500000000000000000',
            logo: null,
            thumbnail: null,
            possible_spam: false,
            verified_contract: true,
          },
        ];

        axios.get.mockResolvedValueOnce({ data: mockBalances });

        const response = await request(app)
          .get(`/api/v1/balances/${validChainId}/${validAddress}`)
          .expect(200);

        // Validate response structure
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('cached');

        const { data } = response.body;
        expect(data).toHaveProperty('address');
        expect(data.address.toLowerCase()).toBe(validAddress.toLowerCase());
        expect(data).toHaveProperty('chainId', validChainId);
        expect(data).toHaveProperty('balances');
        expect(data).toHaveProperty('totalTokens', 2);
        expect(data).toHaveProperty('timestamp');

        // Validate balance structure
        const balance = data.balances[0];
        expect(balance).toMatchObject({
          tokenAddress: expect.any(String),
          name: expect.any(String),
          symbol: expect.any(String),
          decimals: expect.any(Number),
          balance: expect.any(String),
          balanceFormatted: expect.any(String),
        });

        // Verify first request is not cached
        expect(response.body.cached).toBe(false);

        // Verify Moralis API was called with correct parameters
        const [moralisUrl, moralisConfig] = axios.get.mock.calls[0];
        expect(moralisUrl.toLowerCase()).toContain(validAddress.toLowerCase());
        expect(moralisConfig.headers).toEqual(
          expect.objectContaining({
            'X-API-Key': 'test-api-key',
          })
        );
        expect(readParam(moralisConfig.params, 'chain')).toBe('0x1');
      });

      test('should return cached response on subsequent requests', async () => {
        const mockBalances = [
          {
            token_address: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: '6',
            balance: '1000000000',
            logo: null,
            thumbnail: null,
            possible_spam: false,
            verified_contract: true,
          },
        ];

        // Mock will be called only once
        axios.get.mockResolvedValue({ data: mockBalances });

        // First request - should hit API
        await request(app)
          .get(`/api/v1/balances/${validChainId}/${validAddress}`)
          .expect(200);

        const initialCallCount = axios.get.mock.calls.length;

        // Second request - should hit cache (use different address to avoid rate limiting)
        const response2 = await request(app)
          .get(`/api/v1/balances/${validChainId}/${validAddress}`)
          .expect(200);

        expect(response2.body.cached).toBe(true);
        // Moralis API should not be called again
        expect(axios.get.mock.calls.length).toBe(initialCallCount);
      });

      test('should support skipCache query parameter', async () => {
        const mockBalances = [
          {
            token_address: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: '6',
            balance: '1000000000',
            logo: null,
            thumbnail: null,
            possible_spam: false,
            verified_contract: true,
          },
        ];

        axios.get.mockResolvedValue({ data: mockBalances });

        // First request
        await request(app)
          .get(`/api/v1/balances/${validChainId}/${validAddress}`)
          .expect(200);

        const initialCallCount = axios.get.mock.calls.length;

        // Second request with skipCache=true should hit API again
        const response = await request(app)
          .get(
            `/api/v1/balances/${validChainId}/${validAddress}?skipCache=true`
          )
          .expect(200);

        expect(response.body.cached).toBe(false);
        expect(axios.get.mock.calls.length).toBeGreaterThan(initialCallCount);
      });

      test('should filter balances by specific token addresses', async () => {
        const token1 = '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037';
        const token2 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

        const mockBalances = [
          {
            token_address: token1,
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: '6',
            balance: '1000000000',
            logo: null,
            thumbnail: null,
            possible_spam: false,
            verified_contract: true,
          },
        ];

        axios.get.mockResolvedValueOnce({ data: mockBalances });

        const response = await request(app)
          .get(
            `/api/v1/balances/${validChainId}/${validAddress}?tokens=${token1},${token2}`
          )
          .expect(200);

        expect(response.body.success).toBe(true);

        // Verify Moralis was called with token_addresses parameter
        const lastCall = axios.get.mock.calls[axios.get.mock.calls.length - 1];
        const tokenParams = readParamValues(
          lastCall[1].params,
          'token_addresses'
        );
        expect(tokenParams.length).toBeGreaterThan(0);
        const normalizedTokens = tokenParams.map(addr => addr.toLowerCase());
        expect(normalizedTokens).toContain(token1.toLowerCase());
        expect(normalizedTokens).toContain(token2.toLowerCase());
      });

      test('should support multiple chain IDs', async () => {
        const chains = [
          { id: '1', hex: '0x1', name: 'Ethereum' },
          { id: '137', hex: '0x89', name: 'Polygon' },
          { id: '42161', hex: '0xa4b1', name: 'Arbitrum' },
          { id: '8453', hex: '0x2105', name: 'Base' },
        ];

        axios.get.mockResolvedValue({ data: [] });

        for (const chain of chains) {
          // Clear mocks between chain tests
          jest.clearAllMocks();

          const response = await request(app)
            .get(`/api/v1/balances/${chain.id}/${validAddress}`)
            .expect(200);

          expect(response.body.success).toBe(true);
          expect(response.body.data.chainId).toBe(chain.id);

          // Verify correct hex chain ID was used in the most recent call
          if (axios.get.mock.calls.length > 0) {
            const lastCall =
              axios.get.mock.calls[axios.get.mock.calls.length - 1];
            expect(readParam(lastCall[1].params, 'chain')).toBe(chain.hex);
          }
        }
      });
    });

    describe('Rate Limiting', () => {
      beforeEach(() => {
        // Note: Rate limiter is a singleton, so we can't fully reset between tests
        // Tests should use unique addresses to avoid conflicts
        axios.get.mockResolvedValue({ data: [] });
      });

      test('should include rate limit headers in successful responses', async () => {
        const uniqueAddress = '0x1234567890123456789012345678901234567890';

        const response = await request(app)
          .get(`/api/v1/balances/1/${uniqueAddress}`)
          .expect(200);

        const headers = response.headers;
        const walletLimit =
          headers['x-ratelimit-limit-wallet'] || headers['x-ratelimit-limit'];
        const walletRemaining =
          headers['x-ratelimit-remaining-wallet'] ||
          headers['x-ratelimit-remaining'];
        const walletReset =
          headers['x-ratelimit-reset-wallet'] || headers['x-ratelimit-reset'];

        expect(walletLimit).toBeDefined();
        expect(walletRemaining).toBeDefined();
        expect(walletReset).toBeDefined();
      });
    });

    describe('Error Scenarios', () => {
      test('should return 400 for invalid wallet address', async () => {
        const response = await request(app)
          .get('/api/v1/balances/1/0xinvalid')
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: expect.stringContaining('Invalid address'),
          },
        });
      });

      test('should return 400 for invalid chainId', async () => {
        const response = await request(app)
          .get(`/api/v1/balances/abc/${TEST_ADDRESSES.VALID_USER}`)
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: expect.stringContaining('Invalid chainId'),
          },
        });
      });

      test('should return 400 for unsupported chain', async () => {
        // Mock the service to throw unsupported chain error
        axios.get.mockRejectedValue(
          new Error(
            'Unsupported chain ID: 999. Supported: 1, 137, 56, 42161, 10, 8453, 43114'
          )
        );

        const response = await request(app)
          .get(`/api/v1/balances/999/${TEST_ADDRESSES.VALID_USER}`)
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: expect.stringMatching(
              /UNSUPPORTED_CHAIN|INTERNAL_SERVER_ERROR/
            ),
            message: expect.stringContaining('Unsupported chain'),
          },
        });
      });

      test('should return 400 for invalid token address in query', async () => {
        const response = await request(app)
          .get(
            `/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}?tokens=0xinvalid`
          )
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: expect.stringContaining('Invalid token address'),
          },
        });
      });

      test('should handle Moralis API timeout errors', async () => {
        // Mock timeout error
        const timeoutError = new Error('timeout of 10000ms exceeded');
        timeoutError.code = 'ECONNABORTED';
        axios.get.mockRejectedValue(timeoutError);

        const response = await request(app)
          .get(`/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}`)
          .expect(500);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: expect.any(String),
            message: expect.any(String),
          },
        });
      });

      test('should handle Moralis API 429 rate limit', async () => {
        const rateLimitError = new Error(
          'Moralis API error: 429 - Rate limit exceeded'
        );
        rateLimitError.response = {
          status: 429,
          data: { message: 'Rate limit exceeded' },
        };
        rateLimitError.status = 429;

        axios.get.mockRejectedValue(rateLimitError);

        const response = await request(app)
          .get(`/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}`)
          .expect(429);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            message: expect.stringContaining('429'),
          },
        });
      });

      test('should handle Moralis API 503 service unavailable', async () => {
        const serviceError = new Error(
          'Moralis API error: 503 - Service Unavailable'
        );
        serviceError.response = {
          status: 503,
          data: { message: 'Service Unavailable' },
        };
        serviceError.status = 503;

        axios.get.mockRejectedValue(serviceError);

        const response = await request(app)
          .get(`/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}`)
          .expect(503);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'RPC_ERROR',
            message: expect.any(String),
          },
        });
      });

      test('should handle network errors', async () => {
        const networkError = new Error('Network Error');
        networkError.code = 'ENOTFOUND';
        axios.get.mockRejectedValue(networkError);

        const response = await request(app)
          .get(`/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}`)
          .expect(500);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: expect.any(String),
            message: expect.any(String),
          },
        });
      });

      test('should handle invalid Moralis response format', async () => {
        // Mock invalid response (not an array)
        axios.get.mockResolvedValueOnce({ data: { invalid: 'format' } });

        const response = await request(app)
          .get(`/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}`)
          .expect(500);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: expect.stringContaining('Invalid Moralis response'),
          },
        });
      });
    });

    describe('Response Format Validation', () => {
      test('should return correctly formatted balance data', async () => {
        const mockBalances = [
          {
            token_address: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: '6',
            balance: '1234567890',
            logo: 'https://example.com/usdc.png',
            thumbnail: 'https://example.com/usdc-thumb.png',
            possible_spam: false,
            verified_contract: true,
          },
        ];

        axios.get.mockResolvedValueOnce({ data: mockBalances });

        const response = await request(app)
          .get(`/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}`)
          .expect(200);

        const balance = response.body.data.balances[0];

        // Verify all fields are present and correct types
        expect(balance).toMatchObject({
          tokenAddress: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
          name: 'USD Coin',
          symbol: 'USDC',
          decimals: 6,
          balance: '1234567890',
          balanceFormatted: '1234.56789',
          logo: 'https://example.com/usdc.png',
          thumbnail: 'https://example.com/usdc-thumb.png',
          possibleSpam: false,
          verifiedContract: true,
        });
      });

      test('should format balances with correct decimal places', async () => {
        const mockBalances = [
          {
            token_address: '0xToken1',
            name: 'Token 18 Decimals',
            symbol: 'T18',
            decimals: '18',
            balance: '1000000000000000000', // 1.0
            logo: null,
            thumbnail: null,
            possible_spam: false,
            verified_contract: true,
          },
          {
            token_address: '0xToken2',
            name: 'Token 6 Decimals',
            symbol: 'T6',
            decimals: '6',
            balance: '1000000', // 1.0
            logo: null,
            thumbnail: null,
            possible_spam: false,
            verified_contract: true,
          },
          {
            token_address: '0xToken3',
            name: 'Zero Balance',
            symbol: 'T0',
            decimals: '18',
            balance: '0',
            logo: null,
            thumbnail: null,
            possible_spam: false,
            verified_contract: true,
          },
        ];

        axios.get.mockResolvedValueOnce({ data: mockBalances });

        const response = await request(app)
          .get(`/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}`)
          .expect(200);

        const balances = response.body.data.balances;

        expect(balances[0].balanceFormatted).toBe('1');
        expect(balances[1].balanceFormatted).toBe('1');
        expect(balances[2].balanceFormatted).toBe('0');
      });

      test('should handle tokens with no logo/thumbnail', async () => {
        const mockBalances = [
          {
            token_address: '0xToken',
            name: 'No Logo Token',
            symbol: 'NLT',
            decimals: '18',
            balance: '1000',
            logo: null,
            thumbnail: null,
            possible_spam: false,
            verified_contract: false,
          },
        ];

        axios.get.mockResolvedValueOnce({ data: mockBalances });

        const response = await request(app)
          .get(`/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}`)
          .expect(200);

        const balance = response.body.data.balances[0];
        expect(balance.logo).toBeNull();
        expect(balance.thumbnail).toBeNull();
      });

      test('should include timestamp in response', async () => {
        axios.get.mockResolvedValueOnce({ data: [] });

        const beforeRequest = Date.now();

        const response = await request(app)
          .get(`/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}`)
          .expect(200);

        const afterRequest = Date.now();

        expect(response.body.data.timestamp).toBeDefined();
        expect(response.body.data.timestamp).toBeGreaterThanOrEqual(
          beforeRequest
        );
        expect(response.body.data.timestamp).toBeLessThanOrEqual(afterRequest);
      });
    });

    describe('Cache Behavior', () => {
      test('should cache responses with different token filters separately', async () => {
        const token1 = '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037';
        const token2 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

        axios.get.mockResolvedValue({ data: [] });

        // Request with token1
        await request(app)
          .get(
            `/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}?tokens=${token1}`
          )
          .expect(200);

        // Request with token2 - should hit API again (different cache key)
        await request(app)
          .get(
            `/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}?tokens=${token2}`
          )
          .expect(200);

        // Verify API was called twice
        expect(axios.get).toHaveBeenCalledTimes(2);
      });

      test('should cache responses per chain ID', async () => {
        axios.get.mockResolvedValue({ data: [] });

        // Same address, different chains
        await request(app)
          .get(`/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}`)
          .expect(200);

        await request(app)
          .get(`/api/v1/balances/137/${TEST_ADDRESSES.VALID_USER}`)
          .expect(200);

        // Verify API was called twice (different chains)
        expect(axios.get).toHaveBeenCalledTimes(2);
      });

      test('should normalize address case for cache keys', async () => {
        const lowerAddress = TEST_ADDRESSES.VALID_USER.toLowerCase();
        const upperAddress = TEST_ADDRESSES.VALID_USER.toUpperCase();
        const mixedAddress = TEST_ADDRESSES.VALID_USER;

        axios.get.mockResolvedValue({ data: [] });

        // Request with lowercase address
        await request(app)
          .get(`/api/v1/balances/1/${lowerAddress}`)
          .expect(200);

        // Request with uppercase - should hit cache
        const response2 = await request(app)
          .get(`/api/v1/balances/1/${upperAddress}`)
          .expect(200);

        // Request with mixed case - should hit cache
        const response3 = await request(app)
          .get(`/api/v1/balances/1/${mixedAddress}`)
          .expect(200);

        // API should only be called once
        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(response2.body.cached).toBe(true);
        expect(response3.body.cached).toBe(true);
      });
    });

    describe('Performance', () => {
      test('should respond within reasonable time for cached requests', async () => {
        axios.get.mockResolvedValue({ data: [] });

        // First request to populate cache
        await request(app)
          .get(`/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}`)
          .expect(200);

        // Measure cached request time
        const startTime = Date.now();

        await request(app)
          .get(`/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}`)
          .expect(200);

        const responseTime = Date.now() - startTime;

        // Cached response should be very fast (< 100ms)
        expect(responseTime).toBeLessThan(100);
      });

      test('should handle concurrent requests efficiently', async () => {
        axios.get.mockResolvedValue({ data: [] });

        const requests = Array(5)
          .fill()
          .map(() =>
            request(app)
              .get(`/api/v1/balances/1/${TEST_ADDRESSES.VALID_USER}`)
              .expect(200)
          );

        const responses = await Promise.all(requests);

        // All responses should succeed
        responses.forEach(response => {
          expect(response.body.success).toBe(true);
        });

        // API should only be called once (subsequent requests hit cache)
        expect(axios.get).toHaveBeenCalledTimes(1);
      });
    });
  });
});
