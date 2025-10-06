const axios = require('axios');
const { retryWithBackoff } = require('../utils/retry');
const BalanceCache = require('../utils/balanceCache');

/**
 * Moralis Balance Service
 *
 * Provides multi-chain ERC20 token balance retrieval with:
 * - In-memory caching (3-5 min TTL)
 * - Automatic retry with exponential backoff
 * - Rate limiting awareness
 * - Chain ID normalization (hex format)
 * - Response standardization
 *
 * Supported Chains: Ethereum, Polygon, BSC, Arbitrum, Optimism, Base, Avalanche
 *
 * Environment Variables:
 * - MORALIS_API_KEY: Required API key
 * - BALANCE_CACHE_TTL: Cache TTL in ms (default: 180000 = 3 min)
 * - MORALIS_TIMEOUT: Request timeout in ms (default: 10000)
 */
class BalanceService {
  constructor() {
    this.baseURL = 'https://deep-index.moralis.io/api/v2.2';
    this.apiKey = process.env.MORALIS_API_KEY;
    this.timeout = parseInt(process.env.MORALIS_TIMEOUT) || 10000;

    // Initialize cache with configurable TTL
    const cacheTTL = parseInt(process.env.BALANCE_CACHE_TTL) || 180000; // 3 min
    this.cache = new BalanceCache(cacheTTL);

    // Chain ID mapping: decimal -> hex
    this.chainMap = {
      1: '0x1', // Ethereum
      137: '0x89', // Polygon
      56: '0x38', // BSC
      42161: '0xa4b1', // Arbitrum
      10: '0xa', // Optimism
      8453: '0x2105', // Base
      43114: '0xa86a', // Avalanche
    };

    this.validateConfig();
  }

  /**
   * Validate service configuration
   * @throws {Error} - If API key is missing
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new Error('MORALIS_API_KEY environment variable is required');
    }
  }

  /**
   * Update the Moralis API key at runtime (primarily for tests)
   * @param {string} apiKey - New API key value
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    this.validateConfig();
  }

  /**
   * Normalize chain ID to hex format required by Moralis
   * @param {string|number} chainId - Chain ID (decimal or hex)
   * @returns {string} - Hex chain ID with 0x prefix
   * @throws {Error} - If chain is not supported
   */
  normalizeChainId(chainId) {
    const chainStr = String(chainId).toLowerCase();

    // Already hex format
    if (chainStr.startsWith('0x')) {
      return chainStr;
    }

    // Convert decimal to hex
    const hexChain = this.chainMap[chainStr];
    if (!hexChain) {
      throw new Error(
        `Unsupported chain ID: ${chainId}. ` +
          `Supported: ${Object.keys(this.chainMap).join(', ')}`
      );
    }

    return hexChain;
  }

  /**
   * Get ERC20 token balances for a wallet address
   *
   * @param {string} address - Wallet address (0x...)
   * @param {Object} options - Request options
   * @param {string|number} options.chainId - Chain ID (required)
   * @param {string[]} [options.tokenAddresses] - Specific token addresses to query
   * @param {boolean} [options.skipCache=false] - Skip cache lookup
   * @returns {Promise<Object>} - Standardized balance response
   *
   * @example
   * const balances = await balanceService.getBalances(
   *   '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
   *   { chainId: 1, tokenAddresses: ['0xA0b...', '0x6B1...'] }
   * );
   */
  async getBalances(address, options = {}) {
    const {
      chainId,
      tokenAddresses = null,
      includeNative = false,
      skipCache = false,
    } = options;

    // Validate inputs
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new Error('Invalid wallet address format');
    }

    if (!chainId) {
      throw new Error('chainId is required');
    }

    // Normalize chain ID
    const hexChainId = this.normalizeChainId(chainId);

    const sanitizedTokens = Array.isArray(tokenAddresses)
      ? tokenAddresses
          .map(addr => (typeof addr === 'string' ? addr.trim() : ''))
          .filter(addr => addr && addr.toLowerCase() !== 'native')
      : null;

    const tokenFilter =
      sanitizedTokens && sanitizedTokens.length > 0 ? sanitizedTokens : null;

    const cacheKey = BalanceCache.generateKey(chainId, address, tokenFilter);

    // Check cache unless explicitly skipped
    if (!skipCache) {
      const cached = this.cache.get(cacheKey);

      if (cached) {
        const cachedResponse = {
          ...cached,
          cached: true,
          cacheHit: true,
        };

        if (includeNative) {
          cachedResponse.nativeBalance = await this.getNativeBalance(
            address,
            chainId
          );
        }

        return cachedResponse;
      }
    }

    // Fetch from Moralis API with retry
    const balanceData = await this._fetchFromMoralis(
      address,
      hexChainId,
      tokenFilter
    );

    // Standardize and cache response
    const standardized = this._standardizeResponse(
      balanceData,
      chainId,
      address
    );

    // Cache the result
    this.cache.set(cacheKey, standardized);

    const response = {
      ...standardized,
      cached: false,
      cacheHit: false,
    };

    if (includeNative) {
      response.nativeBalance = await this.getNativeBalance(address, chainId);
    }

    return response;
  }

  /**
   * Fetch balance data from Moralis API with retry logic
   * @private
   * @param {string} address - Wallet address
   * @param {string} chain - Hex chain ID
   * @param {string[]} tokenAddresses - Optional token filter
   * @returns {Promise<Array>} - Raw Moralis response
   */
  _fetchFromMoralis(address, chain, tokenAddresses = null) {
    const fetchFn = async () => {
      const params = new URLSearchParams();
      params.append('chain', chain);

      // Add token address filter if specified
      if (tokenAddresses && tokenAddresses.length > 0) {
        tokenAddresses.forEach(address => {
          const normalizedAddress = address.trim();

          if (!normalizedAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
            throw new Error(
              `Invalid token address format: ${normalizedAddress}`
            );
          }

          params.append('token_addresses', normalizedAddress);
        });
      }

      try {
        const response = await axios.get(`${this.baseURL}/${address}/erc20`, {
          params,
          headers: {
            'X-API-Key': this.apiKey,
            Accept: 'application/json',
          },
          timeout: this.timeout,
        });

        return response.data;
      } catch (error) {
        // Enhance error with context
        if (error.response) {
          const moralisError = new Error(
            `Moralis API error: ${error.response.status} - ${
              error.response.data?.message || error.message
            }`
          );
          moralisError.status = error.response.status;
          moralisError.response = error.response;
          throw moralisError;
        }
        throw error;
      }
    };

    // Retry with backoff
    return retryWithBackoff(
      fetchFn,
      {
        retries: 3,
        minTimeout: 2000,
        maxTimeout: 8000,
        factor: 2,
        context: 'Moralis Balance API',
      },
      this._shouldRetry.bind(this)
    );
  }

  /**
   * Determine if error should trigger retry
   * @private
   * @param {Error} error - Error object
   * @returns {boolean} - True if should retry
   */
  _shouldRetry(error) {
    // Don't retry on 4xx client errors (except 429 rate limit)
    if (error.status >= 400 && error.status < 500) {
      if (error.status === 429) {
        console.warn('[BalanceService] Rate limit hit, retrying...');
        return true;
      }
      console.log(`[BalanceService] Not retrying HTTP ${error.status}`);
      return false;
    }

    // Retry on 5xx server errors and network issues
    return true;
  }

  /**
   * Standardize Moralis response format
   * @private
   * @param {Array} rawData - Moralis API response
   * @param {string|number} chainId - Original chain ID
   * @param {string} address - Wallet address
   * @returns {Object} - Standardized response
   */
  _standardizeResponse(rawData, chainId, address) {
    if (!Array.isArray(rawData)) {
      const error = new Error('Invalid Moralis response format');
      error.status = 500;
      throw error;
    }

    const balances = rawData.map(token => ({
      tokenAddress: token.token_address,
      name: token.name,
      symbol: token.symbol,
      decimals: parseInt(token.decimals),
      balance: token.balance,
      balanceFormatted: this._formatBalance(token.balance, token.decimals),
      logo: token.logo || null,
      thumbnail: token.thumbnail || null,
      // Additional metadata if available
      possibleSpam: token.possible_spam || false,
      verifiedContract: token.verified_contract || false,
    }));

    return {
      address,
      chainId: String(chainId),
      balances,
      totalTokens: balances.length,
      timestamp: Date.now(),
    };
  }

  /**
   * Format raw balance to human-readable decimal
   * @private
   * @param {string} rawBalance - Raw balance string
   * @param {number} decimals - Token decimals
   * @returns {string} - Formatted balance
   */
  _formatBalance(rawBalance, decimals) {
    if (!rawBalance || rawBalance === '0') {
      return '0';
    }

    const divisor = BigInt(10) ** BigInt(decimals);
    const balanceBigInt = BigInt(rawBalance);
    const wholePart = balanceBigInt / divisor;
    const fractionalPart = balanceBigInt % divisor;

    if (fractionalPart === 0n) {
      return wholePart.toString();
    }

    // Format with decimals
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmed = fractionalStr.replace(/0+$/, '');

    return `${wholePart}.${trimmed}`;
  }

  /**
   * Get native token balance (ETH, MATIC, etc.)
   * Note: Requires different Moralis endpoint
   *
   * @param {string} address - Wallet address
   * @param {string|number} chainId - Chain ID
   * @returns {Promise<Object>} - Native balance data
   */
  async getNativeBalance(address, chainId) {
    const hexChainId = this.normalizeChainId(chainId);

    const fetchFn = async () => {
      const response = await axios.get(`${this.baseURL}/${address}/balance`, {
        params: { chain: hexChainId },
        headers: {
          'X-API-Key': this.apiKey,
          Accept: 'application/json',
        },
        timeout: this.timeout,
      });

      return response.data;
    };

    const data = await retryWithBackoff(
      fetchFn,
      { retries: 3, minTimeout: 2000, context: 'Moralis Native Balance' },
      this._shouldRetry.bind(this)
    );

    return {
      address: 'native',
      chainId: String(chainId),
      balance: data.balance,
      balanceFormatted: this._formatBalance(data.balance, 18), // Most native tokens use 18 decimals
      timestamp: Date.now(),
    };
  }

  /**
   * Clear cache for specific address
   * @param {string} address - Wallet address
   * @returns {number} - Number of entries cleared
   */
  clearAddressCache(address) {
    return this.cache.clearAddress(address);
  }

  /**
   * Clear cache for specific chain
   * @param {string|number} chainId - Chain ID
   * @returns {number} - Number of entries cleared
   */
  clearChainCache(chainId) {
    return this.cache.clearChain(chainId);
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache stats
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Get supported chain IDs
   * @returns {Array<string>} - List of supported decimal chain IDs
   */
  getSupportedChains() {
    return Object.keys(this.chainMap);
  }

  /**
   * Check if chain is supported
   * @param {string|number} chainId - Chain ID to check
   * @returns {boolean} - True if supported
   */
  isChainSupported(chainId) {
    const chainStr = String(chainId);
    return chainStr in this.chainMap || chainStr.startsWith('0x');
  }
}

module.exports = BalanceService;
