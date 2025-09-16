/**
 * ProtocolFactory - Dynamic protocol instantiation for multi-strategy system
 * Maps implementation names to protocol classes and creates instances
 */

const AaveProtocol = require('./AaveProtocol');
const PendlePTProtocol = require('./PendlePTProtocol');
const VelodromeProtocol = require('./VelodromeProtocol');

class ProtocolFactory {
  constructor() {
    // Registry of available protocol implementations
    this.protocolRegistry = new Map();
    this._initializeRegistry();
  }

  /**
   * Create protocol instance from configuration
   * @param {Object} protocolConfig - Protocol configuration from unifiedZapConfig
   * @param {string} chain - Chain name
   * @param {number} chainId - Chain ID
   * @returns {BaseProtocolV2} - Protocol instance
   */
  createProtocol(protocolConfig, chain, chainId) {
    if (!protocolConfig || !protocolConfig.implementation) {
      throw new Error(
        'Protocol configuration must include implementation name'
      );
    }

    const { implementation } = protocolConfig;
    const ProtocolClass = this.protocolRegistry.get(implementation);

    if (!ProtocolClass) {
      throw new Error(
        `Unknown protocol implementation: ${implementation}. Available: ${this.getAvailableImplementations().join(', ')}`
      );
    }

    try {
      // Create instance with configuration
      return new ProtocolClass(protocolConfig.config, chain, chainId);
    } catch (error) {
      throw new Error(
        `Failed to create ${implementation} instance: ${error.message}`
      );
    }
  }

  /**
   * Create multiple protocol instances for a strategy
   * @param {Object} strategyConfig - Strategy configuration with protocols array
   * @param {string} chain - Chain name (optional, protocols can be multi-chain)
   * @returns {Array} - Array of protocol instances with weights
   */
  createProtocolsForStrategy(strategyConfig, chain = null) {
    if (!strategyConfig || !Array.isArray(strategyConfig.protocols)) {
      throw new Error('Strategy configuration must include protocols array');
    }

    const protocols = [];

    for (const protocolConfig of strategyConfig.protocols) {
      // Filter by chain if specified
      if (chain && protocolConfig.chain !== chain) {
        continue;
      }

      // Skip disabled protocols
      if (protocolConfig.enabled === false) {
        continue;
      }

      try {
        const protocolInstance = this.createProtocol(
          protocolConfig,
          protocolConfig.chain,
          protocolConfig.chainId
        );

        protocols.push({
          id: protocolConfig.id,
          name: protocolConfig.name,
          weight: protocolConfig.weight,
          chain: protocolConfig.chain,
          chainId: protocolConfig.chainId,
          instance: protocolInstance,
          config: protocolConfig,
        });
      } catch (error) {
        console.warn(
          `Failed to create protocol ${protocolConfig.id}: ${error.message}`
        );
        // Continue with other protocols instead of failing entirely
      }
    }

    return protocols;
  }

  /**
   * Create protocols for multiple strategies
   * @param {Object} strategiesConfig - Full strategies configuration
   * @param {Array} strategyIds - Array of strategy IDs to process
   * @param {string} chain - Optional chain filter
   * @returns {Array} - Array of all protocol instances with strategy context
   */
  createProtocolsForStrategies(strategiesConfig, strategyIds, chain = null) {
    const allProtocols = [];

    for (const strategyId of strategyIds) {
      const strategyConfig = strategiesConfig[strategyId];

      if (!strategyConfig) {
        throw new Error(
          `Unknown strategy: ${strategyId}. Available: ${Object.keys(strategiesConfig).join(', ')}`
        );
      }

      const protocols = this.createProtocolsForStrategy(strategyConfig, chain);

      // Add strategy context to each protocol
      protocols.forEach(protocol => {
        protocol.strategyId = strategyId;
        protocol.strategyName = strategyConfig.displayName;
        protocol.strategyDescription = strategyConfig.description;
      });

      allProtocols.push(...protocols);
    }

    return allProtocols;
  }

  /**
   * Register a new protocol implementation
   * @param {string} name - Implementation name
   * @param {Class} protocolClass - Protocol class
   */
  registerProtocol(name, protocolClass) {
    if (!name || typeof name !== 'string') {
      throw new Error('Protocol name must be a non-empty string');
    }

    if (!protocolClass || typeof protocolClass !== 'function') {
      throw new Error('Protocol class must be a constructor function');
    }

    this.protocolRegistry.set(name, protocolClass);
  }

  /**
   * Get list of available protocol implementations
   * @returns {Array} - Array of implementation names
   */
  getAvailableImplementations() {
    return Array.from(this.protocolRegistry.keys());
  }

  /**
   * Check if protocol implementation is available
   * @param {string} implementation - Implementation name
   * @returns {boolean} - Whether implementation is available
   */
  isImplementationAvailable(implementation) {
    return this.protocolRegistry.has(implementation);
  }

  /**
   * Get protocol class for implementation
   * @param {string} implementation - Implementation name
   * @returns {Class} - Protocol class
   */
  getProtocolClass(implementation) {
    return this.protocolRegistry.get(implementation);
  }

  /**
   * Validate protocol configuration
   * @param {Object} protocolConfig - Protocol configuration
   * @returns {Object} - Validation result
   */
  validateProtocolConfig(protocolConfig) {
    const errors = [];
    const warnings = [];

    // Required fields
    const required = [
      'id',
      'name',
      'implementation',
      'chain',
      'chainId',
      'weight',
      'config',
    ];
    required.forEach(field => {
      if (!protocolConfig[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    // Implementation availability
    if (
      protocolConfig.implementation &&
      !this.isImplementationAvailable(protocolConfig.implementation)
    ) {
      errors.push(`Unknown implementation: ${protocolConfig.implementation}`);
    }

    // Weight validation
    if (protocolConfig.weight !== undefined) {
      if (
        typeof protocolConfig.weight !== 'number' ||
        protocolConfig.weight < 0 ||
        protocolConfig.weight > 100
      ) {
        errors.push('Weight must be a number between 0 and 100');
      }
    }

    // Chain ID validation
    if (protocolConfig.chainId !== undefined) {
      if (
        !Number.isInteger(protocolConfig.chainId) ||
        protocolConfig.chainId <= 0
      ) {
        errors.push('Chain ID must be a positive integer');
      }
    }

    // Enabled field validation
    if (
      protocolConfig.enabled !== undefined &&
      typeof protocolConfig.enabled !== 'boolean'
    ) {
      warnings.push('enabled field should be a boolean');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Initialize the protocol registry with available implementations
   * @private
   */
  _initializeRegistry() {
    // Core protocol implementations
    this.registerProtocol('AaveProtocol', AaveProtocol);
    this.registerProtocol('PendlePTProtocol', PendlePTProtocol);
    this.registerProtocol('VelodromeProtocol', VelodromeProtocol);

    // Add aliases for common naming patterns
    this.registerProtocol('Aave', AaveProtocol);
    this.registerProtocol('PendlePT', PendlePTProtocol);
    this.registerProtocol('Pendle', PendlePTProtocol);
    this.registerProtocol('Velodrome', VelodromeProtocol);
    this.registerProtocol('Aerodrome', VelodromeProtocol);

    // Protocol-specific aliases based on V1 naming
    this.registerProtocol('BaseAave', AaveProtocol);
    this.registerProtocol('BasePendlePT', PendlePTProtocol);
    this.registerProtocol('BaseVelodrome', VelodromeProtocol);
  }

  /**
   * Get factory statistics
   * @returns {Object} - Factory statistics
   */
  getStats() {
    return {
      totalImplementations: this.protocolRegistry.size,
      availableImplementations: this.getAvailableImplementations(),
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Clone factory instance (useful for testing)
   * @returns {ProtocolFactory} - New factory instance
   */
  clone() {
    const newFactory = new ProtocolFactory();

    // Copy all registered protocols
    for (const [name, protocolClass] of this.protocolRegistry.entries()) {
      // Skip default registrations to avoid duplicates
      if (
        !['AaveProtocol', 'PendlePTProtocol', 'VelodromeProtocol'].includes(
          name
        )
      ) {
        newFactory.registerProtocol(name, protocolClass);
      }
    }

    return newFactory;
  }

  /**
   * Clear all registered protocols (useful for testing)
   */
  clearRegistry() {
    this.protocolRegistry.clear();
  }

  /**
   * Reset factory to default state
   */
  reset() {
    this.clearRegistry();
    this._initializeRegistry();
  }
}

// Export singleton instance
const protocolFactory = new ProtocolFactory();

module.exports = {
  ProtocolFactory,
  protocolFactory, // Singleton instance for use across the application
};
