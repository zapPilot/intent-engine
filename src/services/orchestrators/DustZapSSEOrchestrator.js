/**
 * DustZapSSEOrchestrator - Orchestrates SSE streaming for DustZap intents
 * Separates infrastructure concerns from business logic
 */

const SSEEventFactory = require('../SSEEventFactory');
const SwapProcessingService = require('../SwapProcessingService');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('DustZapSSEOrchestrator');

class DustZapSSEOrchestrator {
  constructor(dustZapHandler) {
    this.dustZapHandler = dustZapHandler;
  }

  /**
   * Handle complete DustZap SSE streaming workflow
   * @param {Object} executionContext - Execution context
   * @param {Function} streamWriter - SSE stream writer
   * @returns {Promise<Object>} - Final processing results
   */
  async orchestrateSSEStreaming(executionContext, streamWriter) {
    try {
      // 1. Send initial connection confirmation (already handled by SSEStreamManager)

      // 2. Process tokens through business logic with SSE events
      const processingResults = await this.processTokensWithStreaming(
        executionContext,
        streamWriter
      );

      // 3. Send completion event
      const completionEvent = this.createCompletionEvent(
        processingResults,
        executionContext
      );
      streamWriter(completionEvent);

      return processingResults;
    } catch (error) {
      logger.error('SSE orchestration error', { error });

      const errorEvent = this.createErrorEvent(error, {
        processedTokens: 0,
        totalTokens: executionContext.dustTokens?.length || 0,
      });
      streamWriter(errorEvent);
      throw error;
    }
  }

  /**
   * Process tokens with streaming events (pure orchestration)
   * @param {Object} executionContext - Execution context
   * @param {Function} streamWriter - SSE stream writer
   * @returns {Promise<Object>} - Processing results
   */
  async processTokensWithStreaming(executionContext, streamWriter) {
    // Create processing context for swap service (same as business logic)
    const processingContext =
      SwapProcessingService.createProcessingContext(executionContext);

    // Calculate fee transactions and insertion strategy (same as business logic)
    const { dustTokens, params } = executionContext;
    const { referralAddress } = params;

    // Calculate estimated total value for fee calculations
    let estimatedTotalValueUSD = 0;
    for (const token of dustTokens) {
      estimatedTotalValueUSD += token.amount * token.price || 0;
    }

    // Pre-calculate fee transactions using estimated value
    const { txBuilder: feeTxBuilder, feeAmounts } =
      this.dustZapHandler.executor.feeCalculationService.createFeeTransactions(
        estimatedTotalValueUSD,
        executionContext.ethPrice,
        executionContext.chainId,
        referralAddress
      );

    const feeTransactions = feeTxBuilder.getTransactions();

    // Calculate insertion strategy
    const batches = executionContext.batches || [dustTokens];
    const totalExpectedTransactions = dustTokens.length * 2;
    const insertionStrategy =
      this.dustZapHandler.executor.smartFeeInsertionService.calculateInsertionStrategy(
        batches,
        feeAmounts.totalFeeETH,
        totalExpectedTransactions,
        feeTransactions.length
      );

    // Use processTokenBatchWithSSE for real-time streaming
    const batchResults =
      await this.dustZapHandler.executor.swapProcessingService.processTokenBatchWithSSE(
        {
          tokens: dustTokens,
          context: processingContext,
          streamWriter: streamWriter, // This enables real-time streaming
          feeTransactions: feeTransactions,
          insertionStrategy: insertionStrategy,
        }
      );

    // Calculate actual total value from successful swaps
    let actualTotalValueUSD = 0;
    for (const result of batchResults.successful) {
      actualTotalValueUSD += result.inputValueUSD || 0;
    }

    const feeInfo =
      this.dustZapHandler.executor.feeCalculationService.buildFeeInfo(
        actualTotalValueUSD,
        referralAddress,
        true // useWETHPattern
      );

    return {
      allTransactions: [...batchResults.transactions],
      totalValueUSD: actualTotalValueUSD,
      processedTokens:
        batchResults.successful.length + batchResults.failed.length,
      successfulTokens: batchResults.successful.length,
      failedTokens: batchResults.failed.length,
      successful: batchResults.successful,
      failed: batchResults.failed,
      feeInsertionStrategy: insertionStrategy,
      feeInfo,
    };
  }

  /**
   * Create completion event for SSE stream
   * @param {Object} processingResults - Processing results
   * @param {Object} executionContext - Execution context
   * @returns {Object} - SSE completion event
   */
  createCompletionEvent(processingResults, executionContext) {
    return SSEEventFactory.createCompletionEvent({
      transactions: processingResults.allTransactions || [],
      metadata: {
        totalTokens: executionContext.dustTokens?.length || 0,
        processedTokens:
          (processingResults.successful?.length || 0) +
          (processingResults.failed?.length || 0),
        successfulTokens: processingResults.successful?.length || 0,
        failedTokens: processingResults.failed?.length || 0,
        totalValueUSD: processingResults.totalValueUSD || 0,
        feeInfo: processingResults.feeInfo || null,
        feeInsertionStrategy: processingResults.feeInsertionStrategy || null,
      },
    });
  }

  /**
   * Create error event for SSE stream
   * @param {Error} error - Error that occurred
   * @param {Object} context - Additional context
   * @returns {Object} - SSE error event
   */
  createErrorEvent(error, context) {
    return SSEEventFactory.createErrorEvent(error, context);
  }
}

module.exports = DustZapSSEOrchestrator;
