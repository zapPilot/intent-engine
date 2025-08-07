const BaseIntentHandler = require('./BaseIntentHandler');
const DUST_ZAP_CONFIG = require('../config/dustZapConfig');
const IntentIdGenerator = require('../utils/intentIdGenerator');
const DustZapValidator = require('../validators/DustZapValidator');
const ExecutionContextManager = require('../managers/ExecutionContextManager');
const DustZapExecutor = require('../executors/DustZapExecutor');

/**
 * DustZap Intent Handler - Converts dust tokens to ETH (Refactored)
 * Now focused on orchestration using specialized components
 */
/**
 * DustZap Intent Handler - Converts dust tokens to ETH (Refactored)
 * Now focused on orchestration using specialized components
 */
class DustZapIntentHandler extends BaseIntentHandler {
  constructor(swapService, priceService, rebalanceClient) {
    super(swapService, priceService, rebalanceClient);

    // Initialize specialized components
    this.validator = DustZapValidator;
    this.contextManager = new ExecutionContextManager(DUST_ZAP_CONFIG);
    this.executor = new DustZapExecutor(
      swapService,
      priceService,
      rebalanceClient
    );
  }

  /**
   * Validate dustZap-specific parameters
   * @param {Object} request - Intent request
   */
  validate(request) {
    this.validator.validate(request, DUST_ZAP_CONFIG);
  }

  /**
   * Execute dustZap intent using SSE streaming
   * @param {Object} request - Intent request
   * @returns {Promise<Object>} - SSE streaming response
   */
  async execute(request) {
    this.validate(request);

    try {
      // 1. Prepare execution context with all required data
      const executionContext =
        await this.executor.prepareExecutionContext(request);

      // 2. Return SSE streaming response immediately
      return this.buildSSEResponse(executionContext);
    } catch (error) {
      console.error('DustZap execution error:', error);
      throw error;
    }
  }

  /**
   * Build SSE streaming response (immediate return)
   * @param {Object} executionContext - Execution context
   * @returns {Object} - SSE streaming response
   */
  buildSSEResponse(executionContext) {
    const { dustTokens, userAddress } = executionContext;
    const intentId = IntentIdGenerator.generate('dustZap', userAddress);

    // Store execution context for SSE processing
    this.contextManager.storeExecutionContext(intentId, executionContext);

    return {
      success: true,
      intentType: 'dustZap',
      mode: 'streaming',
      intentId,
      streamUrl: `/api/dustzap/${intentId}/stream`,
      metadata: {
        totalTokens: dustTokens.length,
        estimatedDuration: this.executor.estimateProcessingDuration(
          dustTokens.length
        ),
        streamingEnabled: true,
      },
    };
  }

  /**
   * Process tokens with SSE streaming (delegated to SSE orchestrator)
   * @param {Object} executionContext - Execution context
   * @param {Function} streamWriter - Function to write SSE events
   * @returns {Promise<Object>} - Final processing results
   */
  processTokensWithSSEStreaming(executionContext, streamWriter) {
    // Import here to avoid circular dependencies
    const { DustZapSSEOrchestrator } = require('../services/SSEStreamManager');

    const sseOrchestrator = new DustZapSSEOrchestrator(this);
    return sseOrchestrator.orchestrateSSEStreaming(
      executionContext,
      streamWriter
    );
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
   * Get ETH price (delegated to executor)
   * @returns {Promise<number>} - ETH price in USD
   */
  getETHPrice() {
    return this.executor.getETHPrice();
  }

  /**
   * Estimate processing duration (delegated to executor)
   * @param {number} tokenCount - Number of tokens to process
   * @returns {string} - Estimated duration range
   */
  estimateProcessingDuration(tokenCount) {
    return this.executor.estimateProcessingDuration(tokenCount);
  }

  /**
   * Cleanup expired execution contexts (delegated to context manager)
   */
  cleanupExpiredContexts() {
    this.contextManager.cleanupExpiredContexts();
  }

  /**
   * Get fee calculation service (for test compatibility)
   */
  get feeCalculationService() {
    return this.executor.feeCalculationService;
  }

  /**
   * Cleanup method - delegates to context manager
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

  /**
   * Get cleanup timer (for test compatibility)
   * @returns {NodeJS.Timeout|null} - Cleanup timer
   */
  get cleanupTimer() {
    return this.contextManager.cleanupTimer;
  }

  /**
   * Get status for debugging
   */
  getStatus() {
    return {
      contextManager: this.contextManager.getStatus(),
      executor: 'active',
      validator: 'static',
    };
  }
}

module.exports = DustZapIntentHandler;
