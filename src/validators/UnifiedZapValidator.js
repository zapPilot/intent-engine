/**
 * UnifiedZapValidator - Validation logic for UnifiedZap multi-strategy intents
 */

const UNIFIED_ZAP_CONFIG = require('../config/unifiedZapConfig');

class UnifiedZapValidator {
  /**
   * Validate unifiedZap-specific parameters
   * @param {Object} request - Intent request
   * @param {Object} config - UnifiedZap configuration (optional, uses default)
   */
  static validate(request, config = UNIFIED_ZAP_CONFIG) {
    this.validateCommon(request, config);
    this.validateUnifiedZapParams(request, config);
  }

  /**
   * Validate common request structure
   * @param {Object} request - Intent request
   * @param {Object} config - Configuration object
   */
  static validateCommon(request, config = UNIFIED_ZAP_CONFIG) {
    if (!request || typeof request !== 'object') {
      throw new Error('Request must be an object');
    }

    const { userAddress, chainId } = request;

    // Validate userAddress
    if (!userAddress || typeof userAddress !== 'string') {
      throw new Error('userAddress is required and must be a string');
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      throw new Error('Invalid userAddress: must be a valid Ethereum address');
    }

    // Validate chainId
    if (!chainId || !Number.isInteger(chainId) || chainId <= 0) {
      throw new Error('Invalid chainId: must be a positive integer');
    }

    // Validate supported chain
    const supportedChainIds = Object.values(config.SUPPORTED_CHAINS).map(
      chain => chain.chainId
    );
    if (!supportedChainIds.includes(chainId)) {
      throw new Error(
        `Unsupported chainId: ${chainId}. Supported chains: ${supportedChainIds.join(', ')}`
      );
    }
  }

  /**
   * Validate UnifiedZap-specific parameters
   * @param {Object} request - Intent request
   * @param {Object} config - UnifiedZap configuration
   */
  static validateUnifiedZapParams(request, config) {
    const { params } = request;

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }

    const { strategyAllocations, inputToken, inputAmount, slippage } = params;

    // Validate strategy allocations
    this.validateStrategyAllocations(strategyAllocations, config);

    // Validate input token
    this.validateInputToken(inputToken);

    // Validate input amount
    this.validateInputAmount(inputAmount);

    // Validate slippage (optional)
    if (slippage !== undefined) {
      this.validateSlippage(slippage, config);
    }
  }

  /**
   * Validate strategy allocations array
   * @param {Array} strategyAllocations - Strategy allocations
   * @param {Object} config - UnifiedZap configuration
   */
  static validateStrategyAllocations(strategyAllocations, config) {
    // Check if strategyAllocations is provided and is an array
    if (!Array.isArray(strategyAllocations)) {
      throw new Error('strategyAllocations must be an array');
    }

    if (strategyAllocations.length === 0) {
      throw new Error('strategyAllocations cannot be empty');
    }

    // Check maximum strategies limit
    if (
      strategyAllocations.length > config.VALIDATION.maxStrategiesPerRequest
    ) {
      throw new Error(
        `Too many strategies. Maximum ${config.VALIDATION.maxStrategiesPerRequest} allowed, got ${strategyAllocations.length}`
      );
    }

    // Validate each strategy allocation
    const strategyIds = new Set();
    let totalPercentage = 0;

    for (const [index, allocation] of strategyAllocations.entries()) {
      this.validateSingleStrategyAllocation(allocation, index, config);

      // Check for duplicate strategy IDs
      if (strategyIds.has(allocation.strategyId)) {
        throw new Error(`Duplicate strategy ID: ${allocation.strategyId}`);
      }
      strategyIds.add(allocation.strategyId);

      totalPercentage += allocation.percentage;
    }

    // Validate total percentage sums to 100%
    const tolerance = config.VALIDATION.allocationSumTolerance * 100;
    if (Math.abs(totalPercentage - 100) > tolerance) {
      throw new Error(
        `Strategy percentages must sum to 100% (±${tolerance}%). Current sum: ${totalPercentage}%`
      );
    }
  }

  /**
   * Validate a single strategy allocation
   * @param {Object} allocation - Strategy allocation object
   * @param {number} index - Index in array for error messages
   * @param {Object} config - UnifiedZap configuration
   */
  static validateSingleStrategyAllocation(allocation, index, config) {
    if (!allocation || typeof allocation !== 'object') {
      throw new Error(`strategyAllocations[${index}] must be an object`);
    }

    const { strategyId, percentage } = allocation;

    // Validate strategyId
    if (!strategyId || typeof strategyId !== 'string') {
      throw new Error(
        `strategyAllocations[${index}].strategyId is required and must be a string`
      );
    }

    // Check if strategy exists in configuration
    if (!config.STRATEGY_CATEGORIES[strategyId]) {
      const availableStrategies = Object.keys(config.STRATEGY_CATEGORIES);
      throw new Error(
        `Unknown strategy: ${strategyId}. Available strategies: ${availableStrategies.join(', ')}`
      );
    }

    // Validate percentage
    if (typeof percentage !== 'number') {
      throw new Error(
        `strategyAllocations[${index}].percentage must be a number`
      );
    }

    if (percentage < config.VALIDATION.minAllocationPercentage) {
      throw new Error(
        `strategyAllocations[${index}].percentage must be at least ${config.VALIDATION.minAllocationPercentage}%, got ${percentage}%`
      );
    }

    if (percentage > config.VALIDATION.maxAllocationPercentage) {
      throw new Error(
        `strategyAllocations[${index}].percentage cannot exceed ${config.VALIDATION.maxAllocationPercentage}%, got ${percentage}%`
      );
    }

    // Check if strategy has enabled protocols for the current chain request
    const strategyConfig = config.STRATEGY_CATEGORIES[strategyId];
    const enabledProtocols = strategyConfig.protocols.filter(
      p => p.enabled !== false
    );

    if (enabledProtocols.length === 0) {
      throw new Error(`Strategy ${strategyId} has no enabled protocols`);
    }
  }

  /**
   * Validate input token address
   * @param {string} inputToken - Input token address or 'native' keyword
   */
  static validateInputToken(inputToken) {
    if (!inputToken || typeof inputToken !== 'string') {
      throw new Error('inputToken is required and must be a string');
    }

    const normalized = inputToken.toLowerCase();

    // Allow native token identifiers
    if (
      normalized === 'native' ||
      normalized === '0x0000000000000000000000000000000000000000' ||
      normalized === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    ) {
      return; // Valid native token identifier
    }

    // Validate as Ethereum address
    if (!/^0x[a-fA-F0-9]{40}$/.test(inputToken)) {
      throw new Error(
        'Invalid inputToken: must be a valid Ethereum address or "native"'
      );
    }
  }

  /**
   * Validate input amount
   * @param {string} inputAmount - Input amount as string
   * @param {Object} config - UnifiedZap configuration
   */
  static validateInputAmount(inputAmount) {
    if (!inputAmount) {
      throw new Error('inputAmount is required');
    }

    if (typeof inputAmount !== 'string') {
      throw new Error('inputAmount must be a string');
    }

    const normalizedAmount = inputAmount.trim();
    if (!this._isValidPositiveNumberString(normalizedAmount)) {
      throw new Error('inputAmount must be a valid positive number string');
    }

    const amount = parseFloat(normalizedAmount);

    if (amount <= 0) {
      throw new Error('inputAmount must be greater than 0');
    }

    // Optional: Check minimum amount (if configured)
    // we should use USD value as min threshold, since we can zapIn with eth/btc as well so use amount as threshold is not correct
    // if (
    //   config.VALIDATION.minInputAmount &&
    //   amount < config.VALIDATION.minInputAmount
    // ) {
    //   throw new Error(
    //     `inputAmount must be at least ${config.VALIDATION.minInputAmount}, got ${amount}`
    //   );
    // }
  }

  /**
   * Determine if value is a positive number string (digits with optional decimal part)
   * @param {string} value - Value to validate
   * @returns {boolean} - True if value is a valid number string
   * @private
   */
  static _isValidPositiveNumberString(value) {
    if (!value) {
      return false;
    }

    const parts = value.split('.');
    if (parts.length > 2) {
      return false;
    }

    const [whole, fraction = ''] = parts;

    if (!this._isDigitsOnly(whole)) {
      return false;
    }

    if (fraction && !this._isDigitsOnly(fraction)) {
      return false;
    }

    return true;
  }

  /**
   * Check if string contains only digit characters
   * @param {string} value - String to test
   * @returns {boolean} - True if string is non-empty and numeric
   * @private
   */
  static _isDigitsOnly(value) {
    if (!value) {
      return false;
    }

    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code < 48 || code > 57) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate slippage parameter
   * @param {number} slippage - Slippage percentage
   * @param {Object} config - UnifiedZap configuration
   */
  static validateSlippage(slippage, _config) {
    if (typeof slippage !== 'number') {
      throw new Error('slippage must be a number');
    }

    if (slippage < 0) {
      throw new Error('slippage cannot be negative');
    }

    if (slippage > 10) {
      throw new Error('slippage cannot exceed 10% for safety');
    }

    // Optional: Check reasonable range
    if (slippage > 5) {
      console.warn(
        `High slippage detected: ${slippage}%. Consider using a lower value.`
      );
    }
  }

  /**
   * Validate strategy is available on the requested chain
   * @param {string} strategyId - Strategy ID
   * @param {number} chainId - Chain ID
   * @param {Object} config - UnifiedZap configuration
   * @returns {boolean} - Whether strategy is available on chain
   */
  static isStrategyAvailableOnChain(
    strategyId,
    chainId,
    config = UNIFIED_ZAP_CONFIG
  ) {
    const strategyConfig = config.STRATEGY_CATEGORIES[strategyId];
    if (!strategyConfig) {
      return false;
    }

    const chainName = this.getChainNameById(chainId, config);
    if (!chainName) {
      return false;
    }

    // Check if strategy has protocols on this chain
    const chainProtocols = strategyConfig.protocols.filter(
      p => p.chain === chainName && p.enabled !== false
    );

    return chainProtocols.length > 0;
  }

  /**
   * Get chain name by chain ID
   * @param {number} chainId - Chain ID
   * @param {Object} config - UnifiedZap configuration
   * @returns {string|null} - Chain name or null if not found
   */
  static getChainNameById(chainId, config = UNIFIED_ZAP_CONFIG) {
    for (const [chainName, chainConfig] of Object.entries(
      config.SUPPORTED_CHAINS
    )) {
      if (chainConfig.chainId === chainId) {
        return chainName;
      }
    }
    return null;
  }

  /**
   * Get validation summary for debugging
   * @param {Object} request - Intent request
   * @param {Object} config - UnifiedZap configuration
   * @returns {Object} - Validation summary
   */
  static getValidationSummary(request, config = UNIFIED_ZAP_CONFIG) {
    try {
      this.validate(request, config);

      const { params } = request;
      const chainName = this.getChainNameById(request.chainId, config);

      return {
        valid: true,
        chainName,
        totalStrategies: params.strategyAllocations.length,
        totalPercentage: params.strategyAllocations.reduce(
          (sum, s) => sum + s.percentage,
          0
        ),
        strategiesOnChain: params.strategyAllocations.filter(s =>
          this.isStrategyAvailableOnChain(s.strategyId, request.chainId, config)
        ).length,
        estimatedComplexity: this.calculateComplexity(
          params.strategyAllocations,
          config
        ),
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        errorType: error.constructor.name,
      };
    }
  }

  /**
   * Calculate request complexity score
   * @param {Array} strategyAllocations - Strategy allocations
   * @param {Object} config - UnifiedZap configuration
   * @returns {number} - Complexity score (1-10)
   */
  static calculateComplexity(strategyAllocations, config) {
    let complexity = 1;

    // Base complexity from strategy count
    complexity += strategyAllocations.length * 0.5;

    // Protocol count complexity
    const totalProtocols = strategyAllocations.reduce((total, allocation) => {
      const strategyConfig = config.STRATEGY_CATEGORIES[allocation.strategyId];
      return total + strategyConfig.protocols.length;
    }, 0);

    complexity += Math.min(totalProtocols * 0.3, 3);

    // Multi-chain complexity (if strategies span multiple chains)
    const chains = new Set();
    strategyAllocations.forEach(allocation => {
      const strategyConfig = config.STRATEGY_CATEGORIES[allocation.strategyId];
      strategyConfig.protocols.forEach(protocol => chains.add(protocol.chain));
    });

    if (chains.size > 1) {
      complexity += 2;
    }

    return Math.min(Math.ceil(complexity), 10);
  }
}

module.exports = UnifiedZapValidator;
