const BalanceService = require('../../src/services/balanceService');
const BalanceCache = require('../../src/utils/balanceCache');

// Mock axios
jest.mock('axios');
const axios = require('axios');

describe('BalanceService', () => {
  let balanceService;

  beforeEach(() => {
    // Set required env var
    process.env.MORALIS_API_KEY = 'test_api_key';
    balanceService = new BalanceService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    balanceService.cache.stopCleanup();
  });

  describe('Constructor', () => {
    it('should initialize with correct config', () => {
      expect(balanceService.apiKey).toBe('test_api_key');
      expect(balanceService.baseURL).toBe(
        'https://deep-index.moralis.io/api/v2.2'
      );
      expect(balanceService.cache).toBeInstanceOf(BalanceCache);
    });

    it('should throw error if API key is missing', () => {
      delete process.env.MORALIS_API_KEY;
      expect(() => new BalanceService()).toThrow(
        'MORALIS_API_KEY environment variable is required'
      );
    });
  });

  describe('normalizeChainId', () => {
    it('should convert decimal to hex', () => {
      expect(balanceService.normalizeChainId(1)).toBe('0x1');
      expect(balanceService.normalizeChainId('137')).toBe('0x89');
      expect(balanceService.normalizeChainId(8453)).toBe('0x2105');
    });

    it('should keep hex format unchanged', () => {
      expect(balanceService.normalizeChainId('0x1')).toBe('0x1');
      expect(balanceService.normalizeChainId('0x89')).toBe('0x89');
    });

    it('should throw error for unsupported chains', () => {
      expect(() => balanceService.normalizeChainId(999)).toThrow(
        'Unsupported chain ID'
      );
    });
  });

  describe('getBalances', () => {
    const mockAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
    const mockResponse = [
      {
        token_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        balance: '1000000000',
        logo: null,
        thumbnail: null,
        possible_spam: false,
        verified_contract: true,
      },
    ];

    it('should validate address format', async () => {
      await expect(
        balanceService.getBalances('invalid_address', { chainId: 1 })
      ).rejects.toThrow('Invalid wallet address format');
    });

    it('should require chainId', async () => {
      await expect(balanceService.getBalances(mockAddress, {})).rejects.toThrow(
        'chainId is required'
      );
    });

    it('should fetch balances from Moralis API', async () => {
      axios.get.mockResolvedValue({ data: mockResponse });

      const result = await balanceService.getBalances(mockAddress, {
        chainId: 1,
        skipCache: true,
      });

      const [, config] = axios.get.mock.calls[0];
      expect(config.headers).toEqual(
        expect.objectContaining({ 'X-API-Key': 'test_api_key' })
      );
      expect(config.params).toBeInstanceOf(URLSearchParams);
      expect(config.params.get('chain')).toBe('0x1');

      expect(result.address).toBe(mockAddress.toLowerCase());
      expect(result.chainId).toBe('1');
      expect(result.balances).toHaveLength(1);
      expect(result.balances[0].symbol).toBe('USDC');
    });

    it('should use cache on second request', async () => {
      axios.get.mockResolvedValue({ data: mockResponse });

      // First request - cache miss
      const result1 = await balanceService.getBalances(mockAddress, {
        chainId: 1,
      });
      expect(result1.cacheHit).toBe(false);
      expect(axios.get).toHaveBeenCalledTimes(1);

      // Second request - cache hit
      const result2 = await balanceService.getBalances(mockAddress, {
        chainId: 1,
      });
      expect(result2.cacheHit).toBe(true);
      expect(axios.get).toHaveBeenCalledTimes(1); // Still only 1 API call
    });

    it('should filter by token addresses', async () => {
      const tokenAddresses = ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'];
      axios.get.mockResolvedValue({ data: mockResponse });

      await balanceService.getBalances(mockAddress, {
        chainId: 1,
        tokenAddresses,
        skipCache: true,
      });

      const [, config] = axios.get.mock.calls[0];
      expect(config.params.getAll('token_addresses')).toEqual(tokenAddresses);
    });

    it('should throw on invalid token address filter', async () => {
      await expect(
        balanceService.getBalances(mockAddress, {
          chainId: 1,
          tokenAddresses: ['not-a-token'],
        })
      ).rejects.toThrow('Invalid token address format');
    });

    it('should merge native balance when includeNative is true', async () => {
      axios.get.mockImplementation(url => {
        if (url.endsWith('/balance')) {
          return Promise.resolve({ data: { balance: '500000000000000000' } });
        }
        return Promise.resolve({ data: mockResponse });
      });

      const result = await balanceService.getBalances(mockAddress, {
        chainId: 1,
        includeNative: true,
        skipCache: true,
      });

      expect(result.nativeBalance).toEqual(
        expect.objectContaining({
          balance: '500000000000000000',
          balanceFormatted: '0.5',
        })
      );
      // Ensure both ERC20 and native endpoints were called
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/balance'),
        expect.objectContaining({
          params: { chain: '0x1' },
        })
      );
    });

    it('should format balance correctly', async () => {
      axios.get.mockResolvedValue({ data: mockResponse });

      const result = await balanceService.getBalances(mockAddress, {
        chainId: 1,
        skipCache: true,
      });

      expect(result.balances[0].balanceFormatted).toBe('1000');
      expect(result.balances[0].decimals).toBe(6);
    });
  });

  describe('getNativeBalance', () => {
    const mockAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
    const mockNativeResponse = {
      balance: '1500000000000000000',
    };

    it('should fetch native balance', async () => {
      axios.get.mockResolvedValue({ data: mockNativeResponse });

      const result = await balanceService.getNativeBalance(mockAddress, 1);

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/balance'),
        expect.objectContaining({
          params: { chain: '0x1' },
        })
      );

      expect(result.balance).toBe('1500000000000000000');
      expect(result.balanceFormatted).toBe('1.5');
    });
  });

  describe('Cache operations', () => {
    it('should clear address cache', () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
      const key = BalanceCache.generateKey(1, address);

      balanceService.cache.set(key, { test: 'data' });
      expect(balanceService.cache.get(key)).toBeTruthy();

      const cleared = balanceService.clearAddressCache(address);
      expect(cleared).toBeGreaterThan(0);
      expect(balanceService.cache.get(key)).toBeNull();
    });

    it('should clear chain cache', () => {
      const key1 = BalanceCache.generateKey(1, '0xabc');
      const key2 = BalanceCache.generateKey(1, '0xdef');
      const key3 = BalanceCache.generateKey(137, '0xabc');

      balanceService.cache.set(key1, { test: '1' });
      balanceService.cache.set(key2, { test: '2' });
      balanceService.cache.set(key3, { test: '3' });

      const cleared = balanceService.clearChainCache(1);
      expect(cleared).toBe(2);
      expect(balanceService.cache.get(key1)).toBeNull();
      expect(balanceService.cache.get(key2)).toBeNull();
      expect(balanceService.cache.get(key3)).toBeTruthy();
    });

    it('should return cache stats', () => {
      const stats = balanceService.getCacheStats();

      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitRate');
    });
  });

  describe('Chain support', () => {
    it('should return supported chains', () => {
      const chains = balanceService.getSupportedChains();

      expect(chains).toContain('1'); // Ethereum
      expect(chains).toContain('137'); // Polygon
      expect(chains).toContain('8453'); // Base
      expect(chains).toContain('42161'); // Arbitrum
    });

    it('should check if chain is supported', () => {
      expect(balanceService.isChainSupported(1)).toBe(true);
      expect(balanceService.isChainSupported('137')).toBe(true);
      expect(balanceService.isChainSupported('0x1')).toBe(true);
      expect(balanceService.isChainSupported(999)).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should retry on 5xx errors', async () => {
      const error = new Error('Server error');
      error.response = { status: 500 };

      axios.get
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: [] });

      const result = await balanceService.getBalances(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        { chainId: 1, skipCache: true }
      );

      expect(result).toBeTruthy();
      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 400 errors', async () => {
      const error = new Error('Bad request');
      error.response = { status: 400, data: { message: 'Invalid address' } };

      axios.get.mockRejectedValue(error);

      await expect(
        balanceService.getBalances(
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          { chainId: 1, skipCache: true }
        )
      ).rejects.toThrow();

      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it('should handle invalid Moralis response', async () => {
      axios.get.mockResolvedValue({ data: 'invalid' });

      await expect(
        balanceService.getBalances(
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          { chainId: 1, skipCache: true }
        )
      ).rejects.toThrow('Invalid Moralis response format');
    });
  });
});
