/**
 * UnifiedZapIntentHandler - Multi-strategy allocation intent handler for V2 system
 * Handles allocation of funds across multiple DeFi strategies in a single transaction flow
 */

const BaseIntentHandler = require('./BaseIntentHandler');
const UNIFIED_ZAP_CONFIG = require('../config/unifiedZapConfig');
const UnifiedZapValidator = require('../validators/UnifiedZapValidator');
const IntentIdGenerator = require('../utils/intentIdGenerator');
const ExecutionContextManager = require('../managers/ExecutionContextManager');

class UnifiedZapIntentHandler extends BaseIntentHandler {
  constructor(swapService, priceService, rebalanceClient) {
    super(swapService, priceService, rebalanceClient);

    // Initialize specialized components
    this.contextManager = new ExecutionContextManager(UNIFIED_ZAP_CONFIG);

    // Import executor here to avoid circular dependencies
    this.executor = null;
    this._initializeExecutor();
  }

  /**
   * Validate unifiedZap-specific parameters
   * @param {Object} request - Intent request
   */
  validate(request) {
    UnifiedZapValidator.validate(request, UNIFIED_ZAP_CONFIG);
  }

  /**
   * Execute unifiedZap intent using SSE streaming
   * @param {Object} request - Intent request
   * @returns {Promise<Object>} - SSE streaming response
   */
  async execute(request) {
    this.validate(request);

    try {
      // 1. Prepare execution context with strategy allocations
      const executionContext = await this.executor.prepareExecutionContext(request);

      // 2. Return SSE streaming response immediately
      return this.buildSSEResponse(executionContext);
    } catch (error) {
      console.error('UnifiedZap execution error:', error);
      throw error;
    }
  }

  /**
   * Build SSE streaming response (immediate return)
   * @param {Object} executionContext - Execution context
   * @returns {Object} - SSE streaming response
   */
  buildSSEResponse(executionContext) {
    const { strategyAllocations, protocolAllocations, userAddress } = executionContext;
    const intentId = IntentIdGenerator.generate('unifiedZap', userAddress);

    // Store execution context for SSE processing
    this.contextManager.storeExecutionContext(intentId, executionContext);

    return {
      success: true,
      intentType: 'unifiedZap',
      mode: 'streaming',
      intentId,
      streamUrl: `/api/unifiedzap/${intentId}/stream`,
      metadata: {
        totalStrategies: strategyAllocations.length,
        totalProtocols: protocolAllocations.length,
        chains: this._getUniqueChains(protocolAllocations),
        estimatedDuration: this.executor.estimateProcessingDuration(protocolAllocations.length),
        streamingEnabled: true
      }
    };
  }

  /**
   * Process multi-strategy allocation with SSE streaming
   * @param {Object} executionContext - Execution context
   * @param {Function} streamWriter - Function to write SSE events
   * @returns {Promise<Object>} - Final processing results
   */
  async processWithSSEStreaming(executionContext, streamWriter) {
    try {
      // Phase 1: Strategy Parsing
      streamWriter({
        event: 'strategy_parsing_started',
        data: {
          phase: 'strategy_parsing',
          progress: 0,
          message: 'Parsing strategy allocations into protocol-level allocations',
          strategyCount: executionContext.strategyAllocations.length
        }
      });

      // Phase 2: Token Requirements Analysis
      streamWriter({
        event: 'token_analysis_started',
        data: {
          phase: 'token_analysis',
          progress: 20,
          message: 'Analyzing token requirements for each protocol',
          protocolCount: executionContext.protocolAllocations.length
        }
      });

      // Phase 3: Swap Preparation
      streamWriter({
        event: 'swap_preparation_started',
        data: {
          phase: 'swap_preparation',
          progress: 40,
          message: 'Preparing token swaps for multi-protocol deposits',
          swapCount: this._countRequiredSwaps(executionContext.protocolAllocations)
        }
      });

      // Phase 4: Transaction Building
      streamWriter({
        event: 'transaction_building_started',
        data: {
          phase: 'transaction_building',
          progress: 60,
          message: 'Building approval and deposit transactions',
          transactionTypes: ['approvals', 'deposits', 'stakes']
        }
      });

      // Execute transaction generation
      const transactions = await this.executor.generateTransactions(executionContext, streamWriter);

      // Phase 5: Gas Estimation
      streamWriter({
        event: 'gas_estimation_started',
        data: {
          phase: 'gas_estimation',
          progress: 80,
          message: 'Estimating gas costs for transaction batch',
          transactionCount: transactions.length
        }
      });

      const gasEstimates = await this.executor.estimateGas(executionContext, transactions);

      // Phase 6: Final Assembly
      streamWriter({
        event: 'final_assembly_started',
        data: {
          phase: 'final_assembly',
          progress: 90,
          message: 'Assembling final transaction array with fee insertion',
          finalizing: true
        }
      });

      const finalTransactions = await this.executor.assembleFinalTransactions(
        transactions,
        gasEstimates,
        executionContext
      );

      // Completion
      streamWriter({
        event: 'execution_completed',
        data: {
          phase: 'completed',
          progress: 100,
          message: 'Multi-strategy allocation ready for execution',
          summary: {
            totalTransactions: finalTransactions.length,
            estimatedGas: gasEstimates.total,
            strategiesAllocated: executionContext.strategyAllocations.length,
            protocolsUsed: executionContext.protocolAllocations.length,
            chainsInvolved: this._getUniqueChains(executionContext.protocolAllocations).length
          }
        }
      });

      return {
        success: true,
        transactions: finalTransactions,
        gasEstimates,
        executionSummary: {
          strategiesProcessed: executionContext.strategyAllocations.length,
          protocolsUsed: executionContext.protocolAllocations.length,
          totalTransactions: finalTransactions.length,
          estimatedGas: gasEstimates.total
        }
      };

    } catch (error) {
      streamWriter({
        event: 'execution_error',
        data: {
          phase: 'error',
          progress: -1,
          message: `Error during processing: ${error.message}`,
          error: {
            type: error.constructor.name,
            message: error.message
          }
        }
      });

      throw error;
    }
  }

  /**
   * Store execution context (delegated to context manager)
   * @param {string} intentId - Intent ID
   * @param {Object} executionContext - Execution context to store
   */
  storeExecutionContext(intentId, executionContext) {
    this.contextManager.storeExecutionContext(intentId, executionContext);
  }

  /**
   * Get execution context (delegated to context manager)
   * @param {string} intentId - Intent ID
   * @returns {Object|null} - Execution context or null if not found
   */
  getExecutionContext(intentId) {
    return this.contextManager.getExecutionContext(intentId);
  }

  /**
   * Remove execution context (delegated to context manager)
   * @param {string} intentId - Intent ID
   */
  removeExecutionContext(intentId) {
    this.contextManager.removeExecutionContext(intentId);
  }


  /**
   * Get unique chains from protocol allocations
   * @param {Array} protocolAllocations - Protocol allocations
   * @returns {Array} - Unique chain names
   * @private
   */
  _getUniqueChains(protocolAllocations) {
    return [...new Set(protocolAllocations.map(p => p.chain))];
  }

  /**
   * Count required swaps for protocol allocations
   * @param {Array} protocolAllocations - Protocol allocations
   * @returns {number} - Number of required swaps
   * @private
   */
  _countRequiredSwaps(protocolAllocations) {
    return protocolAllocations.filter(p => p.requiresSwap).length;
  }

  /**
   * Initialize executor (lazy loading to avoid circular dependencies)
   * @private
   */
  _initializeExecutor() {
    try {
      const UnifiedZapExecutor = require('../executors/UnifiedZapExecutor');
      this.executor = new UnifiedZapExecutor(
        this.swapService,
        this.priceService,
        this.rebalanceClient
      );
    } catch (error) {
      console.warn('UnifiedZapExecutor not yet available, will be initialized later:', error.message);
    }
  }

  /**
   * Get status for debugging
   * @returns {Object} - Handler status
   */
  getStatus() {
    return {
      contextManager: this.contextManager.getStatus(),
      executor: this.executor ? 'initialized' : 'pending',
      supportedStrategies: Object.keys(UNIFIED_ZAP_CONFIG.STRATEGY_CATEGORIES),
      activeContexts: this.contextManager.executionContexts.size
    };
  }

  /**
   * Cleanup method
   */
  cleanup() {
    this.contextManager.cleanup();
  }

  /**
   * Get execution contexts Map (for test compatibility)
   * @returns {Map} - Direct access to execution contexts Map
   */
  get executionContexts() {
    return this.contextManager.executionContexts;
  }
}

module.exports = UnifiedZapIntentHandler;