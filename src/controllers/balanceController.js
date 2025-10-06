const BalanceService = require('../services/balanceService');

// Initialize balance service
const balanceService = new BalanceService();

/**
 * Balance Controller
 * Handles token balance queries with caching support
 */
class BalanceController {
  /**
   * Get token balances for an address on a specific chain
   * GET /api/v1/balances/:chainId/:address
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - Route parameters
   * @param {string} req.params.chainId - Chain ID (e.g., 1, 8453, 42161)
   * @param {string} req.params.address - Wallet address (0x...)
   * @param {Object} req.query - Query parameters
   * @param {string} [req.query.tokens] - Optional comma-separated token addresses
   * @param {boolean} [req.query.skipCache] - Skip cache lookup
   * @param {Object} res - Express response object
   */
  static async getBalances(req, res) {
    try {
      const { chainId, address } = req.params;
      const { tokens, skipCache } = req.query;

      // Parse tokens if provided (comma-separated addresses)
      const parsedTokens = tokens
        ? tokens
            .split(',')
            .map(addr => addr.trim())
            .filter(Boolean)
        : [];

      const includeNative = parsedTokens.some(
        token => token.toLowerCase() === 'native'
      );

      const tokenAddresses = parsedTokens
        .filter(token => token.toLowerCase() !== 'native')
        .filter(Boolean);

      const tokenFilter = tokenAddresses.length > 0 ? tokenAddresses : null;

      // Call balance service with new signature
      const result = await balanceService.getBalances(address, {
        chainId,
        tokenAddresses: tokenFilter,
        includeNative,
        skipCache: skipCache === 'true',
      });

      // Return standardized response
      res.json({
        success: true,
        data: result,
        cached: result.cacheHit || false,
      });
    } catch (error) {
      console.error('Balance controller error:', error);

      // Map errors to appropriate HTTP status codes
      const statusCode = BalanceController._getErrorStatusCode(error);
      const errorResponse = BalanceController._formatErrorResponse(error);

      res.status(statusCode).json(errorResponse);
    }
  }

  /**
   * Get native token balance for an address
   * GET /api/v1/balances/:chainId/:address/native
   *
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getNativeBalance(req, res) {
    try {
      const { chainId, address } = req.params;

      const result = await balanceService.getNativeBalance(address, chainId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Native balance controller error:', error);

      const statusCode = BalanceController._getErrorStatusCode(error);
      const errorResponse = BalanceController._formatErrorResponse(error);

      res.status(statusCode).json(errorResponse);
    }
  }

  /**
   * Get cache statistics
   * GET /api/v1/balances/cache/stats
   *
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static getCacheStats(req, res) {
    try {
      const stats = balanceService.getCacheStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Cache stats error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message,
        },
      });
    }
  }

  /**
   * Clear cache for specific address or chain
   * DELETE /api/v1/balances/cache
   *
   * @param {Object} req - Express request object
   * @param {Object} req.query - Query parameters
   * @param {string} [req.query.address] - Address to clear
   * @param {string} [req.query.chainId] - Chain to clear
   * @param {Object} res - Express response object
   */
  static clearCache(req, res) {
    try {
      const { address, chainId } = req.query;
      let cleared = 0;

      if (address) {
        cleared = balanceService.clearAddressCache(address);
      } else if (chainId) {
        cleared = balanceService.clearChainCache(chainId);
      } else {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Either address or chainId parameter is required',
          },
        });
      }

      res.json({
        success: true,
        data: {
          cleared,
          message: `Cleared ${cleared} cache entries`,
        },
      });
    } catch (error) {
      console.error('Clear cache error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message,
        },
      });
    }
  }

  /**
   * Get supported chains
   * GET /api/v1/balances/chains
   *
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static getSupportedChains(req, res) {
    try {
      const chains = balanceService.getSupportedChains();

      res.json({
        success: true,
        data: {
          chains,
          count: chains.length,
        },
      });
    } catch (error) {
      console.error('Get chains error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message,
        },
      });
    }
  }

  /**
   * Map error types to HTTP status codes
   * @private
   */
  static _getErrorStatusCode(error) {
    if (typeof error.status === 'number' && error.status >= 400) {
      return error.status;
    }

    const message = error.message ? error.message.toLowerCase() : '';

    // Invalid input errors
    if (
      message.includes('invalid') ||
      message.includes('required') ||
      message.includes('must be')
    ) {
      return 400;
    }

    // Chain not supported errors
    if (
      message.includes('not supported') ||
      message.includes('unsupported chain')
    ) {
      return 400;
    }

    // RPC or external service errors
    if (message.includes('network')) {
      return 500;
    }

    if (message.includes('rpc') || message.includes('provider')) {
      return 503;
    }

    // Rate limit errors
    if (message.includes('rate limit')) {
      return 429;
    }

    // Default to internal server error
    return 500;
  }

  /**
   * Format error response
   * @private
   */
  static _formatErrorResponse(error) {
    const errorCode = BalanceController._getErrorCode(error);

    return {
      success: false,
      error: {
        code: errorCode,
        message: error.message || 'Failed to fetch balances',
        details: error.details || undefined,
      },
    };
  }

  /**
   * Get error code from error object
   * @private
   */
  static _getErrorCode(error) {
    // Check if error already has a code
    if (error.code) {
      return error.code;
    }

    const message = error.message ? error.message.toLowerCase() : '';

    if (error.status === 503) {
      return 'RPC_ERROR';
    }

    // Derive code from message
    if (message.includes('moralis response format')) {
      return 'INTERNAL_SERVER_ERROR';
    }

    if (message.includes('invalid')) {
      return 'INVALID_INPUT';
    }
    if (message.includes('not supported')) {
      return 'UNSUPPORTED_CHAIN';
    }
    if (message.includes('rpc') || message.includes('provider')) {
      return 'RPC_ERROR';
    }
    if (message.includes('rate limit')) {
      return 'RATE_LIMIT_EXCEEDED';
    }

    return 'INTERNAL_SERVER_ERROR';
  }

  /**
   * Expose balanceService for testing purposes
   * @static
   */
  static get balanceService() {
    return balanceService;
  }
}

module.exports = BalanceController;
