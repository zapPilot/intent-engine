jest.mock('axios');
jest.mock('../src/utils/retry');

const axios = require('axios');
const { retryWithBackoff } = require('../src/utils/retry');

describe('RebalanceBackendClient', () => {
  let client;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    // Clear env vars that might affect the config
    delete process.env.REBALANCE_BACKEND_URL;
    delete process.env.REBALANCE_BACKEND_TIMEOUT;
    // Require the module
    const RebalanceBackendClient = require('../src/services/RebalanceBackendClient');
    client = new RebalanceBackendClient();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should use default values when environment variables are not set', () => {
      expect(client.baseUrl).toBe('http://localhost:5000');
      expect(client.timeout).toBe(10000);
      expect(client.retries).toBe(3);
    });

    it('should use environment variables when set', () => {
      const originalUrl = process.env.REBALANCE_BACKEND_URL;
      const originalTimeout = process.env.REBALANCE_BACKEND_TIMEOUT;
      
      process.env.REBALANCE_BACKEND_URL = 'http://custom-backend:8080';
      process.env.REBALANCE_BACKEND_TIMEOUT = '5000';

      // Clear the module cache to force re-evaluation of config
      jest.resetModules();
      const RebalanceBackendClientWithNewEnv = require('../src/services/RebalanceBackendClient');
      
      const customClient = new RebalanceBackendClientWithNewEnv();
      expect(customClient.baseUrl).toBe('http://custom-backend:8080');
      expect(customClient.timeout).toBe(5000);
      
      // Restore original values
      process.env.REBALANCE_BACKEND_URL = originalUrl;
      process.env.REBALANCE_BACKEND_TIMEOUT = originalTimeout;
    });
  });

  describe('getUserTokenBalances', () => {
    it('should successfully fetch user token balances', async () => {
      const mockTokens = [
        { symbol: 'USDC', balance: '1000000' },
        { symbol: 'ETH', balance: '1000000000000000000' },
      ];

      const mockResponse = { data: mockTokens };
      retryWithBackoff.mockImplementation(async (fn) => {
        return await fn();
      });
      axios.get.mockResolvedValue(mockResponse);

      const result = await client.getUserTokenBalances('0x123', 1);

      expect(result).toEqual(mockTokens);
      expect(retryWithBackoff).toHaveBeenCalledWith(expect.any(Function), {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 5000,
      });
    });

    it('should construct correct URL for different chains', async () => {
      const mockResponse = { data: [] };
      retryWithBackoff.mockImplementation(async fn => {
        const result = await fn();
        return result;
      });

      axios.get.mockResolvedValue(mockResponse);

      await client.getUserTokenBalances('0x123', 42161);

      expect(axios.get).toHaveBeenCalledWith(
        'http://localhost:5000/user/0x123/arb/tokens',
        expect.objectContaining({
          timeout: 10000,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'intent-engine/1.0',
          },
        })
      );
    });

    it('should throw error for invalid response format', async () => {
      retryWithBackoff.mockImplementation(async (fn) => {
        return await fn();
      });
      axios.get.mockResolvedValue({ data: 'not an array' });

      await expect(client.getUserTokenBalances('0x123', 1)).rejects.toThrow(
        'Invalid response format from rebalance backend'
      );
    });

    it('should handle HTTP error responses', async () => {
      const error = new Error('Request failed');
      error.response = {
        status: 404,
        data: { message: 'User not found' },
      };
      retryWithBackoff.mockImplementation(async (fn) => {
        return await fn();
      });
      axios.get.mockRejectedValue(error);

      await expect(client.getUserTokenBalances('0x123', 1)).rejects.toThrow(
        'Rebalance backend error: 404 - User not found'
      );
    });

    it('should handle connection refused errors', async () => {
      const error = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      retryWithBackoff.mockImplementation(async (fn) => {
        return await fn();
      });
      axios.get.mockRejectedValue(error);

      await expect(client.getUserTokenBalances('0x123', 1)).rejects.toThrow(
        'Rebalance backend is not accessible'
      );
    });

    it('should handle DNS errors', async () => {
      const error = new Error('DNS not found');
      error.code = 'ENOTFOUND';
      retryWithBackoff.mockImplementation(async (fn) => {
        return await fn();
      });
      axios.get.mockRejectedValue(error);

      await expect(client.getUserTokenBalances('0x123', 1)).rejects.toThrow(
        'Rebalance backend URL is invalid'
      );
    });

    it('should handle generic errors', async () => {
      const error = new Error('Network timeout');
      retryWithBackoff.mockImplementation(async (fn) => {
        return await fn();
      });
      axios.get.mockRejectedValue(error);

      await expect(client.getUserTokenBalances('0x123', 1)).rejects.toThrow(
        'Failed to fetch token balances: Network timeout'
      );
    });

    it('should handle response without error message', async () => {
      const error = new Error('Request failed');
      error.response = {
        status: 500,
        data: {},
      };
      retryWithBackoff.mockImplementation(async (fn) => {
        return await fn();
      });
      axios.get.mockRejectedValue(error);

      await expect(client.getUserTokenBalances('0x123', 1)).rejects.toThrow(
        'Rebalance backend error: 500 - Unknown error'
      );
    });
  });

  describe('getChainName', () => {
    it('should return correct chain names for supported chains', () => {
      const chainMappings = {
        1: 'ethereum',
        137: 'polygon',
        56: 'bsc',
        43114: 'avalanche',
        250: 'fantom',
        42161: 'arbitrum',
        10: 'optimism',
        8453: 'base',
      };

      Object.entries(chainMappings).forEach(([chainId, expectedName]) => {
        expect(client.getChainName(Number(chainId))).toBe(expectedName);
      });
    });

    it('should throw error for unsupported chain', () => {
      expect(() => client.getChainName(999999)).toThrow(
        'Unsupported chain ID: 999999'
      );
    });
  });

  describe('getDebankChainName', () => {
    it('should return correct Debank chain names for supported chains', () => {
      const chainMappings = {
        42161: 'arb',
        10: 'op',
        1: 'eth',
        8453: 'base',
        59144: 'scrl',
        252: 'frax',
        1101: 'pze',
      };

      Object.entries(chainMappings).forEach(([chainId, expectedName]) => {
        expect(client.getDebankChainName(Number(chainId))).toBe(expectedName);
      });
    });

    it('should throw error for unsupported chain', () => {
      expect(() => client.getDebankChainName(999999)).toThrow(
        'Unsupported chain ID: 999999'
      );
    });
  });

  describe('healthCheck', () => {
    it('should return true when backend is healthy', async () => {
      axios.get.mockResolvedValue({ status: 200 });

      const result = await client.healthCheck();

      expect(result).toBe(true);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringMatching(/\/health$/),
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it('should return false when backend is unhealthy', async () => {
      axios.get.mockRejectedValue(new Error('Connection failed'));

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false for non-200 status', async () => {
      axios.get.mockResolvedValue({ status: 503 });

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should use custom base URL for health check', async () => {
      const originalUrl = process.env.REBALANCE_BACKEND_URL;
      process.env.REBALANCE_BACKEND_URL = 'http://custom:9000';
      
      // Clear the module cache to force re-evaluation of config
      jest.resetModules();
      const RebalanceBackendClientWithNewEnv = require('../src/services/RebalanceBackendClient');
      const customClient = new RebalanceBackendClientWithNewEnv();

      axios.get.mockResolvedValue({ status: 200 });

      await customClient.healthCheck();

      expect(axios.get).toHaveBeenCalledWith('http://custom:9000/health', {
        timeout: 5000,
      });
      
      // Restore original value
      process.env.REBALANCE_BACKEND_URL = originalUrl;
    });
  });
});
