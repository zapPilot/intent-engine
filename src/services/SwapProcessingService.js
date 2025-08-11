/**
 * SwapProcessingService - Facade for coordinating token processing services
 * Provides unified swap processing for all intent handlers with consistent error handling
 *
 * Refactored to use composition of focused services while maintaining backward compatibility:
 * - TokenProcessor: Handles individual token processing
 * - TokenBatchProcessor: Manages batch processing and coordination
 * - ProgressTracker: Tracks progress and manages callbacks
 * - SmartFeeInsertionService: Handles fee insertion logic
 */

const TokenProcessor = require('./TokenProcessor');
const TokenBatchProcessor = require('./TokenBatchProcessor');
const SwapExecutionContext = require('../valueObjects/SwapExecutionContext');

class SwapProcessingService {
  constructor(swapService, priceService) {
    this.swapService = swapService;
    this.priceService = priceService;

    // Initialize composed services
    this.tokenProcessor = new TokenProcessor(swapService, priceService);
    this.tokenBatchProcessor = new TokenBatchProcessor(this.tokenProcessor);
  }

  /**
   * Process a single token with comprehensive error handling and SSE streaming
   * Delegates to TokenProcessor for backward compatibility
   * @param {Object} params - Processing parameters
   * @returns {Promise<TokenProcessingResult>} Processing result with transaction data
   */
  processTokenWithSSE(params) {
    return this.tokenProcessor.processTokenWithSSE(params);
  }

  /**
   * Process a single token swap with unified error handling
   * Delegates to TokenProcessor for backward compatibility
   * @param {Object} token - Token to process
   * @param {SwapExecutionContext|Object} context - Processing context (value object or legacy format)
   * @returns {Promise<TokenProcessingResult>} Swap processing result
   */
  processTokenSwap(token, context) {
    return this.tokenProcessor.processTokenSwap(token, context);
  }

  /**
   * Handle token processing failure with consistent error handling
   * Delegates to TokenProcessor for backward compatibility
   * @param {Object} token - Token that failed
   * @param {Error|string} error - Error that occurred
   * @param {Object} params - Failure handling parameters
   * @returns {Object} Failure result
   */
  handleTokenFailure(token, error, params = {}) {
    return this.tokenProcessor.handleTokenFailure(token, error, params);
  }

  /**
   * Calculate trading loss for successful swaps
   * Delegates to TokenProcessor for backward compatibility
   * @param {Object} swapQuote - Swap quote data
   * @param {number} inputValueUSD - Input value in USD
   * @returns {Object} Trading loss calculation
   */
  calculateTradingLoss(swapQuote, inputValueUSD) {
    return this.tokenProcessor.calculateTradingLoss(swapQuote, inputValueUSD);
  }

  /**
   * Process multiple tokens with SSE streaming
   * Delegates to TokenBatchProcessor for improved separation of concerns
   * @param {Object} params - Batch processing parameters
   * @param {Array} params.tokens - Tokens to process
   * @param {Object} params.context - Processing context
   * @param {Function} params.streamWriter - SSE stream writer function
   * @param {Function} params.onProgress - Optional progress callback
   * @param {Array} params.feeTransactions - Optional fee transactions to insert dynamically
   * @param {Object} params.insertionStrategy - Optional insertion strategy from SmartFeeInsertionService
   * @returns {Promise<Object>} Batch processing results
   */
  processTokenBatchWithSSE(params) {
    return this.tokenBatchProcessor.processTokenBatchWithSSE(params);
  }

  /**
   * Handle token processing result and update progress
   * @deprecated Use TokenBatchProcessor directly for new implementations
   * Maintained for backward compatibility
   * @param {Object} params - Result handling parameters
   * @returns {number} Updated transaction index
   */
  _handleTokenProcessingResult(params) {
    const progressTracker = this.tokenBatchProcessor.progressTracker;
    const result = progressTracker.handleTokenProcessingResult(params);
    return result.updatedTransactionIndex;
  }

  /**
   * Extract processing context from request parameters
   * @param {Object} executionContext - Execution context from intent handler
   * @returns {SwapExecutionContext} Processing context for swap operations
   */
  static createProcessingContext(executionContext) {
    const { chainId, ethPrice, userAddress, params } = executionContext;
    const { toTokenAddress, toTokenDecimals, slippage, referralAddress } =
      params;

    return new SwapExecutionContext({
      chainId,
      ethPrice,
      toTokenPrice: ethPrice, // Assuming ETH as target token
      userAddress,
      // Default to ETH for tests and legacy scenarios
      toTokenAddress:
        toTokenAddress || '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      toTokenDecimals: toTokenDecimals !== undefined ? toTokenDecimals : 18,
      slippage: slippage || 1, // Default 1% slippage
      referralAddress,
    });
  }
}

module.exports = SwapProcessingService;
