const { ValidationError } = require('../utils/errors');

/**
 * SwapExecutionContext - Standardized context object for swap execution
 * Consolidates swap execution parameters into a single, well-structured object
 */
class SwapExecutionContext {
  constructor(params = {}) {
    const {
      chainId,
      ethPrice,
      toTokenPrice,
      userAddress,
      toTokenAddress,
      toTokenDecimals,
      slippage = 0.5,
      // Additional context
      referralAddress = null,
      batchId = null,
      metadata = {},
    } = params;

    // Validate required parameters
    this.validateRequired({
      chainId,
      ethPrice,
      userAddress,
      toTokenAddress,
      toTokenDecimals,
    });

    this.chainId = chainId;
    this.ethPrice = ethPrice;
    this.toTokenPrice = toTokenPrice;
    this.userAddress = userAddress;
    this.toTokenAddress = toTokenAddress;
    this.toTokenDecimals = toTokenDecimals;
    this.slippage = slippage;
    this.referralAddress = referralAddress;
    this.batchId = batchId;
    this.metadata = metadata;
    this.createdAt = new Date().toISOString();
  }

  /**
   * Create context from execution context (backward compatibility)
   * @param {Object} executionContext - Original execution context
   * @returns {SwapExecutionContext}
   */
  static fromExecutionContext(executionContext) {
    const { chainId, ethPrice, userAddress, params = {} } = executionContext;
    const { toTokenAddress, toTokenDecimals, slippage, referralAddress } =
      params;

    return new SwapExecutionContext({
      chainId,
      ethPrice,
      userAddress,
      // Default to ETH for tests and legacy scenarios
      toTokenAddress:
        toTokenAddress || '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      toTokenDecimals: toTokenDecimals !== undefined ? toTokenDecimals : 18,
      slippage,
      referralAddress,
      toTokenPrice: executionContext.toTokenPrice || ethPrice,
    });
  }

  /**
   * Create swap request parameters for DEX aggregators
   * @param {Object} token - Token to swap
   * @returns {Object}
   */
  createSwapRequest(token) {
    return {
      chainId: this.chainId,
      fromTokenAddress: token.address,
      fromTokenDecimals: token.decimals,
      toTokenAddress: this.toTokenAddress,
      toTokenDecimals: this.toTokenDecimals,
      amount: token.raw_amount,
      fromAddress: this.userAddress,
      slippage: this.slippage,
      eth_price: this.ethPrice,
      toTokenPrice: this.toTokenPrice,
    };
  }

  /**
   * Get context in legacy format for backward compatibility
   * @returns {Object}
   */
  toLegacyFormat() {
    return {
      chainId: this.chainId,
      ethPrice: this.ethPrice,
      toTokenPrice: this.toTokenPrice,
      userAddress: this.userAddress,
      toTokenAddress: this.toTokenAddress,
      toTokenDecimals: this.toTokenDecimals,
      slippage: this.slippage,
    };
  }

  /**
   * Validate required parameters
   * @private
   * @param {Object} params - Parameters to validate
   */
  validateRequired(params) {
    const required = [
      'chainId',
      'ethPrice',
      'userAddress',
      'toTokenAddress',
      'toTokenDecimals',
    ];
    const missing = required.filter(
      field => params[field] === undefined || params[field] === null
    );

    if (missing.length > 0) {
      throw new ValidationError(
        `SwapExecutionContext missing required fields: ${missing.join(', ')}`
      );
    }

    // Validate types
    if (typeof params.chainId !== 'number' || params.chainId <= 0) {
      throw new ValidationError('chainId must be a positive number');
    }

    if (typeof params.ethPrice !== 'number' || params.ethPrice <= 0) {
      throw new ValidationError('ethPrice must be a positive number');
    }

    if (
      typeof params.userAddress !== 'string' ||
      !/^0x[a-fA-F0-9]{40}$/.test(params.userAddress)
    ) {
      throw new ValidationError('userAddress must be a valid Ethereum address');
    }
  }

  /**
   * Clone the context with updated parameters
   * @param {Object} updates - Parameters to update
   * @returns {SwapExecutionContext}
   */
  clone(updates = {}) {
    return new SwapExecutionContext({
      chainId: this.chainId,
      ethPrice: this.ethPrice,
      toTokenPrice: this.toTokenPrice,
      userAddress: this.userAddress,
      toTokenAddress: this.toTokenAddress,
      toTokenDecimals: this.toTokenDecimals,
      slippage: this.slippage,
      referralAddress: this.referralAddress,
      batchId: this.batchId,
      metadata: { ...this.metadata },
      ...updates,
    });
  }
}

module.exports = SwapExecutionContext;
