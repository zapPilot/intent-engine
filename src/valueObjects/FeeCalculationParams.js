/**
 * FeeCalculationParams - Parameter object for fee calculation operations
 * Consolidates complex fee calculation parameters into a structured object
 */
class FeeCalculationParams {
  constructor(params = {}) {
    const {
      totalValueUSD,
      ethPrice,
      chainId = null,
      referralAddress = null,
      useWETHPattern = true,
      txBuilder = null,
      // Additional options
      customFeePercentage = null,
      metadata = {},
    } = params;

    // Assign properties first
    this.totalValueUSD = totalValueUSD;
    this.ethPrice = ethPrice;
    this.chainId = chainId;
    this.referralAddress = referralAddress;
    this.useWETHPattern = useWETHPattern;
    this.txBuilder = txBuilder;
    this.customFeePercentage = customFeePercentage;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();

    // Validate after assignment
    this.validateRequired({ totalValueUSD, ethPrice });
  }

  /**
   * Create parameters for WETH-based fee transactions
   * @param {Object} params - Basic parameters
   * @returns {FeeCalculationParams}
   */
  static forWETHFees(params) {
    return new FeeCalculationParams({
      ...params,
      useWETHPattern: true,
    });
  }

  /**
   * Create parameters for ETH-based fee transactions (legacy)
   * @param {Object} params - Basic parameters
   * @returns {FeeCalculationParams}
   */
  static forETHFees(params) {
    return new FeeCalculationParams({
      ...params,
      useWETHPattern: false,
    });
  }

  /**
   * Create parameters with referral support
   * @param {Object} params - Basic parameters with referralAddress
   * @returns {FeeCalculationParams}
   */
  static withReferral(params) {
    if (!params.referralAddress) {
      throw new Error(
        'Referral address is required for referral fee calculations'
      );
    }
    return new FeeCalculationParams(params);
  }

  /**
   * Validate required parameters
   * @private
   * @param {Object} params - Parameters to validate
   */
  validateRequired(params) {
    const { totalValueUSD, ethPrice } = params;

    if (typeof totalValueUSD !== 'number' || totalValueUSD < 0) {
      throw new Error('totalValueUSD must be a non-negative number');
    }

    if (typeof ethPrice !== 'number' || ethPrice <= 0) {
      throw new Error('ethPrice must be a positive number');
    }

    // Validate referral address format if provided
    if (
      this.referralAddress &&
      !/^0x[a-fA-F0-9]{40}$/.test(this.referralAddress)
    ) {
      throw new Error('referralAddress must be a valid Ethereum address');
    }

    // Validate chain ID if WETH pattern is used and chainId is explicitly provided
    if (
      this.useWETHPattern &&
      this.chainId !== null &&
      (typeof this.chainId !== 'number' || this.chainId <= 0)
    ) {
      throw new Error(
        'chainId must be provided for WETH-based fee transactions'
      );
    }
  }

  /**
   * Check if referral fees should be calculated
   * @returns {boolean}
   */
  hasReferral() {
    return Boolean(this.referralAddress);
  }

  /**
   * Get fee calculation method based on pattern
   * @returns {string}
   */
  getFeeMethod() {
    return this.useWETHPattern ? 'WETH' : 'ETH';
  }

  /**
   * Clone with updates
   * @param {Object} updates - Fields to update
   * @returns {FeeCalculationParams}
   */
  clone(updates = {}) {
    return new FeeCalculationParams({
      totalValueUSD: this.totalValueUSD,
      ethPrice: this.ethPrice,
      chainId: this.chainId,
      referralAddress: this.referralAddress,
      useWETHPattern: this.useWETHPattern,
      txBuilder: this.txBuilder,
      customFeePercentage: this.customFeePercentage,
      metadata: { ...this.metadata },
      ...updates,
    });
  }

  /**
   * Convert to method parameters for FeeCalculationService
   * @returns {Object}
   */
  toServiceParams() {
    return {
      totalValueUSD: this.totalValueUSD,
      ethPrice: this.ethPrice,
      chainId: this.chainId,
      referralAddress: this.referralAddress,
      txBuilder: this.txBuilder,
    };
  }

  /**
   * Get summary for logging/debugging
   * @returns {Object}
   */
  getSummary() {
    return {
      totalValueUSD: this.totalValueUSD,
      feeMethod: this.getFeeMethod(),
      hasReferral: this.hasReferral(),
      chainId: this.chainId,
      timestamp: this.timestamp,
    };
  }
}

module.exports = FeeCalculationParams;
