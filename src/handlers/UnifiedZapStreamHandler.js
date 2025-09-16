/**
 * UnifiedZapStreamHandler - Handles streaming for UnifiedZap intent
 * Manages SSE streaming for multi-strategy allocation with complex progress tracking
 */

const BaseStreamHandler = require('./BaseStreamHandler');

class UnifiedZapStreamHandler extends BaseStreamHandler {
  /**
   * Get the intent type for UnifiedZap
   * @returns {string} Intent type
   */
  getIntentType() {
    return 'unifiedZap';
  }

  /**
   * Get the intent handler name for UnifiedZap
   * @returns {string} Intent handler name
   * @protected
   */
  _getIntentHandlerName() {
    return 'unifiedZap';
  }

  /**
   * Process UnifiedZap streaming operation
   * @param {Object} executionContext - UnifiedZap execution context
   * @param {Function} streamWriter - Stream writer function
   * @returns {Promise<Object>} Processing results
   */
  processStream(executionContext, streamWriter) {
    const unifiedZapHandler = this._getIntentHandler();

    // Delegate to the UnifiedZap intent handler's SSE streaming logic
    return unifiedZapHandler.processWithSSEStreaming(
      executionContext,
      streamWriter
    );
  }

  /**
   * Override execution context retrieval to provide UnifiedZap-specific metadata
   * @param {string} intentId - Intent identifier
   * @returns {Object|null} Execution context with additional metadata
   */
  getExecutionContext(intentId) {
    const executionContext = super.getExecutionContext(intentId);

    if (executionContext) {
      // Add UnifiedZap-specific metadata for SSE initialization
      const { strategyAllocations, protocolAllocations } = executionContext;

      // Calculate comprehensive metadata
      executionContext.streamingMetadata = {
        // Basic counts
        totalItems: protocolAllocations?.length || 0,
        totalStrategies: strategyAllocations?.length || 0,
        totalProtocols: protocolAllocations?.length || 0,

        // Chain analysis
        chains: this._getUniqueChains(protocolAllocations),
        isMultiChain: this._isMultiChain(protocolAllocations),

        // Protocol type analysis
        protocolTypes: this._analyzeProtocolTypes(protocolAllocations),
        hasLPProtocols: this._hasLPProtocols(protocolAllocations),

        // Complexity indicators
        requiresSwaps: this._countRequiredSwaps(protocolAllocations),
        complexityScore: this._calculateComplexityScore(protocolAllocations),

        // Timing estimates
        estimatedPhases: this._getEstimatedPhases(protocolAllocations),
        estimatedDuration: this._estimateDetailedDuration(protocolAllocations),

        // Strategy breakdown
        strategyBreakdown: this._getStrategyBreakdown(
          strategyAllocations,
          protocolAllocations
        ),
      };
    }

    return executionContext;
  }

  /**
   * Get unique chains from protocol allocations
   * @param {Array} protocolAllocations - Protocol allocations array
   * @returns {Array} Array of unique chain information
   * @private
   */
  _getUniqueChains(protocolAllocations) {
    if (!Array.isArray(protocolAllocations)) {
      return [];
    }

    const chainMap = new Map();

    protocolAllocations.forEach(protocol => {
      if (protocol.chain && protocol.chainId) {
        chainMap.set(protocol.chain, {
          name: protocol.chain,
          chainId: protocol.chainId,
          protocolCount: (chainMap.get(protocol.chain)?.protocolCount || 0) + 1,
        });
      }
    });

    return Array.from(chainMap.values());
  }

  /**
   * Check if allocation involves multiple chains
   * @param {Array} protocolAllocations - Protocol allocations array
   * @returns {boolean} Whether multiple chains are involved
   * @private
   */
  _isMultiChain(protocolAllocations) {
    if (!Array.isArray(protocolAllocations)) {
      return false;
    }
    const chains = new Set(protocolAllocations.map(p => p.chain));
    return chains.size > 1;
  }

  /**
   * Analyze protocol types in allocation
   * @param {Array} protocolAllocations - Protocol allocations array
   * @returns {Object} Protocol type breakdown
   * @private
   */
  _analyzeProtocolTypes(protocolAllocations) {
    if (!Array.isArray(protocolAllocations)) {
      return {};
    }

    const typeCount = {};

    protocolAllocations.forEach(protocol => {
      const protocolName = protocol.instance?.constructor.name || 'Unknown';
      typeCount[protocolName] = (typeCount[protocolName] || 0) + 1;
    });

    return typeCount;
  }

  /**
   * Check if allocation includes LP protocols
   * @param {Array} protocolAllocations - Protocol allocations array
   * @returns {boolean} Whether LP protocols are included
   * @private
   */
  _hasLPProtocols(protocolAllocations) {
    if (!Array.isArray(protocolAllocations)) {
      return false;
    }

    return protocolAllocations.some(
      protocol =>
        protocol.instance?.mode === 'LP' || protocol.config?.mode === 'LP'
    );
  }

  /**
   * Count protocols requiring token swaps
   * @param {Array} protocolAllocations - Protocol allocations array
   * @returns {number} Number of protocols requiring swaps
   * @private
   */
  _countRequiredSwaps(protocolAllocations) {
    if (!Array.isArray(protocolAllocations)) {
      return 0;
    }

    return protocolAllocations.filter(
      protocol =>
        protocol.requiresSwap || protocol.tokenRequirements?.requiresSwap
    ).length;
  }

  /**
   * Calculate complexity score for the allocation
   * @param {Array} protocolAllocations - Protocol allocations array
   * @returns {number} Complexity score (1-10)
   * @private
   */
  _calculateComplexityScore(protocolAllocations) {
    if (
      !Array.isArray(protocolAllocations) ||
      protocolAllocations.length === 0
    ) {
      return 1;
    }

    let complexity = 1;

    // Base complexity from protocol count
    complexity += Math.min(protocolAllocations.length * 0.5, 3);

    // Multi-chain complexity
    if (this._isMultiChain(protocolAllocations)) {
      complexity += 2;
    }

    // LP protocol complexity
    if (this._hasLPProtocols(protocolAllocations)) {
      complexity += 1.5;
    }

    // Swap complexity
    const swapCount = this._countRequiredSwaps(protocolAllocations);
    complexity += Math.min(swapCount * 0.3, 2);

    return Math.min(Math.ceil(complexity), 10);
  }

  /**
   * Get estimated phases for processing
   * @param {Array} protocolAllocations - Protocol allocations array
   * @returns {Array} Array of processing phases with estimates
   * @private
   */
  _getEstimatedPhases(protocolAllocations) {
    const basePhases = [
      {
        name: 'strategy_parsing',
        duration: 2,
        description: 'Parse strategy allocations',
      },
      {
        name: 'token_analysis',
        duration: 3,
        description: 'Analyze token requirements',
      },
      {
        name: 'swap_preparation',
        duration: 5,
        description: 'Prepare token swaps',
      },
      {
        name: 'transaction_building',
        duration: 8,
        description: 'Build protocol transactions',
      },
      {
        name: 'gas_estimation',
        duration: 4,
        description: 'Estimate gas costs',
      },
      {
        name: 'final_assembly',
        duration: 2,
        description: 'Assemble final transactions',
      },
    ];

    if (!Array.isArray(protocolAllocations)) {
      return basePhases;
    }

    // Adjust durations based on complexity
    const protocolCount = protocolAllocations.length;
    const hasLP = this._hasLPProtocols(protocolAllocations);
    const isMultiChain = this._isMultiChain(protocolAllocations);

    return basePhases.map(phase => {
      let adjustedDuration = phase.duration;

      // Scale with protocol count
      if (
        ['token_analysis', 'transaction_building', 'gas_estimation'].includes(
          phase.name
        )
      ) {
        adjustedDuration *= Math.max(1, protocolCount / 3);
      }

      // LP complexity
      if (
        hasLP &&
        ['swap_preparation', 'transaction_building'].includes(phase.name)
      ) {
        adjustedDuration *= 1.3;
      }

      // Multi-chain complexity
      if (
        isMultiChain &&
        ['token_analysis', 'swap_preparation'].includes(phase.name)
      ) {
        adjustedDuration *= 1.2;
      }

      return {
        ...phase,
        duration: Math.ceil(adjustedDuration),
      };
    });
  }

  /**
   * Estimate detailed processing duration
   * @param {Array} protocolAllocations - Protocol allocations array
   * @returns {Object} Detailed duration estimates
   * @private
   */
  _estimateDetailedDuration(protocolAllocations) {
    const phases = this._getEstimatedPhases(protocolAllocations);
    const totalSeconds = phases.reduce((sum, phase) => sum + phase.duration, 0);

    return {
      totalSeconds,
      phaseBreakdown: phases,
      readableEstimate: this._formatDuration(totalSeconds),
      confidenceLevel: this._getConfidenceLevel(protocolAllocations),
    };
  }

  /**
   * Get strategy breakdown with protocol details
   * @param {Array} strategyAllocations - Strategy allocations from request
   * @param {Array} protocolAllocations - Protocol allocations calculated
   * @returns {Array} Strategy breakdown
   * @private
   */
  _getStrategyBreakdown(strategyAllocations = [], protocolAllocations = []) {
    return strategyAllocations.map(strategy => {
      const strategyProtocols = protocolAllocations.filter(
        p => p.strategyId === strategy.strategyId
      );

      return {
        strategyId: strategy.strategyId,
        strategyName: strategyProtocols[0]?.strategyName || strategy.strategyId,
        percentage: strategy.percentage,
        protocolCount: strategyProtocols.length,
        protocols: strategyProtocols.map(p => ({
          id: p.id,
          name: p.name,
          chain: p.chain,
          type: p.instance?.mode || 'single',
          weight: p.weight,
        })),
      };
    });
  }

  /**
   * Format duration in human-readable format
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration
   * @private
   */
  _formatDuration(seconds) {
    if (seconds < 60) {
      return `${Math.ceil(seconds)} seconds`;
    } else if (seconds < 300) {
      // 5 minutes
      const minutes = Math.ceil(seconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      const minutes = Math.ceil(seconds / 60);
      return `${minutes} minutes`;
    }
  }

  /**
   * Get confidence level for duration estimate
   * @param {Array} protocolAllocations - Protocol allocations array
   * @returns {string} Confidence level
   * @private
   */
  _getConfidenceLevel(protocolAllocations) {
    if (!Array.isArray(protocolAllocations)) {
      return 'low';
    }

    const complexity = this._calculateComplexityScore(protocolAllocations);

    if (complexity <= 3) {
      return 'high';
    }
    if (complexity <= 6) {
      return 'medium';
    }
    return 'low';
  }
}

module.exports = UnifiedZapStreamHandler;
