/**
 * DustZap Configuration Constants
 * Centralized configuration for dust token zapping functionality
 */

module.exports = {
  /**
   * Default batch size for processing dust tokens
   * Determines how many tokens are processed together in a single batch
   */
  DEFAULT_BATCH_SIZE: 10,

  /**
   * SSE streaming configuration
   * Controls token-level streaming behavior for better UX
   */
  SSE_STREAMING: {
    /**
     * Enable SSE streaming for dust zap operations
     */
    ENABLED: true,

    /**
     * Stream granularity: process and stream each token individually
     * This provides smooth progress feedback to users
     */
    STREAM_BATCH_SIZE: 1,

    /**
     * SSE connection timeout in milliseconds
     */
    CONNECTION_TIMEOUT: 300000, // 5 minutes

    /**
     * Maximum concurrent SSE connections per user
     */
    MAX_CONCURRENT_STREAMS: 3,

    /**
     * Stream cleanup interval in milliseconds
     */
    CLEANUP_INTERVAL: 60000, // 1 minute
  },

  /**
   * Number of transactions generated per token
   * Each token requires: 1 approve + 1 swap = 2 transactions
   */
  TRANSACTIONS_PER_TOKEN: 2,

  /**
   * Default dust threshold in USD
   * Minimum USD value for a token to be considered worth processing
   */
  DEFAULT_DUST_THRESHOLD: 0.005,

  /**
   * Supported target tokens for dust conversion
   * Currently only ETH is supported as the target token
   */
  SUPPORTED_TARGET_TOKENS: ['ETH'],

  /**
   * Wei conversion factor
   * Used for converting ETH amounts to wei (smallest unit)
   */
  WEI_FACTOR: 1e18,

  /**
   * Fee calculation precision
   * Number of decimal places for fee percentage calculations
   */
  FEE_PERCENTAGE_PRECISION: 100,

  /**
   * Validation constants
   */
  VALIDATION: {
    /**
     * Ethereum address regex pattern
     * Validates proper 0x-prefixed 40-character hex addresses
     */
    ETH_ADDRESS_PATTERN: /^0x[a-fA-F0-9]{40}$/,

    /**
     * Minimum allowed dust threshold
     * Prevents setting threshold too low which could cause gas inefficiency
     */
    MIN_DUST_THRESHOLD: 0.001,

    /**
     * Maximum allowed dust threshold
     * Prevents setting threshold too high which would exclude valid dust
     */
    MAX_DUST_THRESHOLD: 100,
  },

  /**
   * Error messages for consistent error handling
   */
  ERRORS: {
    MISSING_PARAMS: 'Missing params object',
    INVALID_DUST_THRESHOLD: 'dustThreshold must be a non-negative number',
    UNSUPPORTED_TARGET_TOKEN: 'Only ETH target token is currently supported',
    INVALID_REFERRAL_ADDRESS:
      'Invalid referralAddress: must be a valid Ethereum address',
    NO_DUST_TOKENS: 'No dust tokens found above threshold',
    PRICE_FETCH_FAILED: 'Failed to fetch ETH price',
    MISSING_TO_TOKEN_ADDRESS: 'toTokenAddress is required for dust conversion',
    MISSING_TO_TOKEN_DECIMALS:
      'toTokenDecimals is required for dust conversion',
    INVALID_TO_TOKEN_ADDRESS: 'toTokenAddress must be a valid Ethereum address',
    INVALID_TO_TOKEN_DECIMALS: 'toTokenDecimals must be a positive integer',
  },
};
