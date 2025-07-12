const axios = require('axios');
const { retryWithBackoff } = require('../utils/retry');

/**
 * Client for communicating with rebalance_backend service
 */
class RebalanceBackendClient {
  constructor() {
    this.baseUrl = process.env.REBALANCE_BACKEND_URL || 'http://localhost:5000';
    this.timeout = parseInt(process.env.REBALANCE_BACKEND_TIMEOUT) || 10000;
    this.retries = 3;
  }

  /**
   * Get user token balances from rebalance backend
   * @param {string} userAddress - User wallet address
   * @param {number} chainId - Chain ID
   * @returns {Promise<Array>} - Array of token balance objects
   */
  async getUserTokenBalances(userAddress, chainId) {
    try {
      const chainName = this.getChainName(chainId);
      const url = `${this.baseUrl}/user/${userAddress}/${chainName}/tokens`;
      console.log('url', url);
      const response = await retryWithBackoff(
        () =>
          axios.get(url, {
            timeout: this.timeout,
            headers: {
              Accept: 'application/json',
              'User-Agent': 'intent-engine/1.0',
            },
          }),
        {
          retries: this.retries,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid response format from rebalance backend');
      }

      // return response.data;
      return response.data.slice(0, 2);
    } catch (error) {
      console.error('Error fetching user token balances:', error.message);

      if (error.response) {
        throw new Error(
          `Rebalance backend error: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`
        );
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('Rebalance backend is not accessible');
      } else if (error.code === 'ENOTFOUND') {
        throw new Error('Rebalance backend URL is invalid');
      } else {
        throw new Error(`Failed to fetch token balances: ${error.message}`);
      }
    }
  }

  /**
   * Convert chain ID to chain name expected by rebalance backend
   * @param {number} chainId - Chain ID
   * @returns {string} - Chain name
   */
  getChainName(chainId) {
    const chainMapping = {
      1: 'ethereum',
      137: 'polygon',
      56: 'bsc',
      43114: 'avalanche',
      250: 'fantom',
      42161: 'arbitrum',
      10: 'optimism',
      8453: 'base',
    };

    const chainName = chainMapping[chainId];
    if (!chainName) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    return chainName;
  }

  /**
   * Health check for rebalance backend
   * @returns {Promise<boolean>} - True if backend is healthy
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      console.warn('Rebalance backend health check failed:', error.message);
      return false;
    }
  }
}

module.exports = RebalanceBackendClient;
