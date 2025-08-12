/**
 * InsertionStrategyParams - Parameter object for fee insertion strategy calculations
 * Consolidates the 6 parameters of calculateInsertionStrategy into a structured object
 */
class InsertionStrategyParams {
  constructor(params = {}) {
    const {
      batches,
      totalFeeETH,
      totalTransactionCount,
      feeTransactionCount,
      // Strategy options
      minimumThresholdPercentage = 0.4,
      safetyBuffer = 0.1,
      spreadFactor = 0.3,
      // Additional metadata
      metadata = {},
    } = params;

    // Assign properties first
    this.batches = batches;
    this.totalFeeETH = totalFeeETH;
    this.totalTransactionCount = totalTransactionCount;
    this.feeTransactionCount = feeTransactionCount;
    this.minimumThresholdPercentage = minimumThresholdPercentage;
    this.safetyBuffer = safetyBuffer;
    this.spreadFactor = spreadFactor;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();

    // Validate after assignment
    this.validateRequired({
      batches,
      totalFeeETH,
      totalTransactionCount,
      feeTransactionCount,
    });
  }

  /**
   * Create parameters for conservative fee insertion strategy
   * @param {Object} params - Basic parameters
   * @returns {InsertionStrategyParams}
   */
  static forConservativeStrategy(params) {
    return new InsertionStrategyParams({
      ...params,
      minimumThresholdPercentage: 0.6, // Wait for 60% completion
      safetyBuffer: 0.2, // 20% safety buffer
      spreadFactor: 0.2, // More concentrated insertion
    });
  }

  /**
   * Create parameters for aggressive fee insertion strategy
   * @param {Object} params - Basic parameters
   * @returns {InsertionStrategyParams}
   */
  static forAggressiveStrategy(params) {
    return new InsertionStrategyParams({
      ...params,
      minimumThresholdPercentage: 0.2, // Wait for only 20% completion
      safetyBuffer: 0.05, // Minimal safety buffer
      spreadFactor: 0.5, // More spread out insertion
    });
  }

  /**
   * Create parameters for balanced (default) strategy
   * @param {Object} params - Basic parameters
   * @returns {InsertionStrategyParams}
   */
  static forBalancedStrategy(params) {
    return new InsertionStrategyParams(params); // Uses default values
  }

  /**
   * Validate required parameters
   * @private
   * @param {Object} params - Parameters to validate
   */
  validateRequired(params) {
    const { batches, totalFeeETH, totalTransactionCount, feeTransactionCount } =
      params;

    if (!Array.isArray(batches) || batches.length === 0) {
      throw new Error('batches must be a non-empty array');
    }

    if (typeof totalFeeETH !== 'number' || totalFeeETH < 0) {
      throw new Error('totalFeeETH must be a non-negative number');
    }

    if (
      typeof totalTransactionCount !== 'number' ||
      totalTransactionCount <= 0
    ) {
      throw new Error('totalTransactionCount must be a positive number');
    }

    if (typeof feeTransactionCount !== 'number' || feeTransactionCount <= 0) {
      throw new Error('feeTransactionCount must be a positive number');
    }

    // Validate percentages
    if (
      this.minimumThresholdPercentage < 0 ||
      this.minimumThresholdPercentage > 1
    ) {
      throw new Error('minimumThresholdPercentage must be between 0 and 1');
    }

    if (this.safetyBuffer < 0 || this.safetyBuffer > 1) {
      throw new Error('safetyBuffer must be between 0 and 1');
    }

    if (this.spreadFactor < 0 || this.spreadFactor > 1) {
      throw new Error('spreadFactor must be between 0 and 1');
    }
  }

  /**
   * Get total number of tokens across all batches
   * @returns {number}
   */
  getTotalTokenCount() {
    return this.batches.reduce((sum, batch) => sum + batch.length, 0);
  }

  /**
   * Get strategy type based on threshold percentage
   * @returns {string}
   */
  getStrategyType() {
    if (this.minimumThresholdPercentage >= 0.6) {
      return 'conservative';
    } else if (this.minimumThresholdPercentage <= 0.2) {
      return 'aggressive';
    } else {
      return 'balanced';
    }
  }

  /**
   * Get minimum threshold options
   * @returns {Object}
   */
  getMinimumThresholdOptions() {
    return {
      minimumThresholdPercentage: this.minimumThresholdPercentage,
      safetyBuffer: this.safetyBuffer,
    };
  }

  /**
   * Get random insertion options
   * @returns {Object}
   */
  getInsertionOptions() {
    return {
      spreadFactor: this.spreadFactor,
    };
  }

  /**
   * Convert to individual parameters for backward compatibility
   * @returns {Array}
   */
  toMethodParameters() {
    return [
      this.batches,
      this.totalFeeETH,
      this.totalTransactionCount,
      this.feeTransactionCount,
      this.getMinimumThresholdOptions(),
    ];
  }

  /**
   * Clone with updates
   * @param {Object} updates - Fields to update
   * @returns {InsertionStrategyParams}
   */
  clone(updates = {}) {
    return new InsertionStrategyParams({
      batches: this.batches,
      totalFeeETH: this.totalFeeETH,
      totalTransactionCount: this.totalTransactionCount,
      feeTransactionCount: this.feeTransactionCount,
      minimumThresholdPercentage: this.minimumThresholdPercentage,
      safetyBuffer: this.safetyBuffer,
      spreadFactor: this.spreadFactor,
      metadata: { ...this.metadata },
      ...updates,
    });
  }

  /**
   * Get summary for logging/debugging
   * @returns {Object}
   */
  getSummary() {
    return {
      totalTokens: this.getTotalTokenCount(),
      totalTransactions: this.totalTransactionCount,
      feeTransactions: this.feeTransactionCount,
      strategyType: this.getStrategyType(),
      thresholdPercentage: this.minimumThresholdPercentage,
      timestamp: this.timestamp,
    };
  }
}

module.exports = InsertionStrategyParams;
