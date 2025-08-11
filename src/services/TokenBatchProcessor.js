/**
 * TokenBatchProcessor - Handles batch processing logic and coordination
 * Extracted from SwapProcessingService for better separation of concerns
 */

const SmartFeeInsertionService = require('./SmartFeeInsertionService');
const ProgressTracker = require('./ProgressTracker');

class TokenBatchProcessor {
  constructor(tokenProcessor) {
    this.tokenProcessor = tokenProcessor;
    this.smartFeeInsertionService = new SmartFeeInsertionService();
    this.progressTracker = new ProgressTracker();
  }

  /**
   * Process multiple tokens with SSE streaming and fee insertion
   * @param {Object} params - Batch processing parameters
   * @param {Array} params.tokens - Tokens to process
   * @param {Object} params.context - Processing context
   * @param {Function} params.streamWriter - SSE stream writer function
   * @param {Function} params.onProgress - Optional progress callback
   * @param {Array} params.feeTransactions - Optional fee transactions to insert dynamically
   * @param {Object} params.insertionStrategy - Optional insertion strategy from SmartFeeInsertionService
   * @returns {Promise<Object>} Batch processing results
   */
  async processTokenBatchWithSSE(params) {
    const {
      tokens,
      context,
      streamWriter,
      onProgress = null,
      feeTransactions = null,
      insertionStrategy = null,
    } = params;

    // Initialize results structure
    const results = {
      successful: [],
      failed: [],
      transactions: [],
      totalValueUSD: 0,
    };

    // Reset progress tracking for new batch
    this.progressTracker.reset();

    // Initialize fee insertion state
    const feeInsertionState = this.initializeFeeInsertionState(
      feeTransactions,
      insertionStrategy
    );

    // Process each token in the batch
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      try {
        // Handle fee insertion before token processing
        this.processFeeInsertionStep(feeInsertionState, results);

        // Process the individual token
        const tokenResult = await this.processTokenStep({
          token,
          tokenIndex: i,
          context,
          streamWriter,
          tokens,
        });

        // Update progress tracking and results
        const progressResult = this.progressTracker.handleTokenProcessingResult(
          {
            tokenResult,
            results,
            tokenIndex: i,
            token,
            tokens,
            onProgress,
            currentTransactionIndex: feeInsertionState.currentTransactionIndex,
          }
        );

        // Update fee insertion transaction index
        feeInsertionState.currentTransactionIndex =
          progressResult.updatedTransactionIndex;
      } catch (error) {
        console.error(`Failed to process token ${token.symbol}:`, error);

        // Handle token processing failure
        const failureResult = this.tokenProcessor.handleTokenFailure(
          token,
          error,
          {
            tokenIndex: i,
            streamWriter,
            processedTokens: i,
            totalTokens: tokens.length,
          }
        );

        results.failed.push(failureResult);
        this.progressTracker.failedCount++;
        this.progressTracker.processedCount++;
      }
    }

    // Insert any remaining fee transactions as fallback
    this.insertRemainingFees(feeInsertionState, results);

    return results;
  }

  /**
   * Initialize fee insertion state tracking
   * @param {Array} feeTransactions - Fee transactions to insert
   * @param {Object} insertionStrategy - Fee insertion strategy
   * @returns {Object} Initialized fee insertion state
   */
  initializeFeeInsertionState(feeTransactions, insertionStrategy) {
    const shouldInsertFees =
      feeTransactions && insertionStrategy && Array.isArray(feeTransactions);

    return {
      shouldInsertFees,
      insertionPoints: shouldInsertFees
        ? [...insertionStrategy.insertionPoints]
        : [],
      currentTransactionIndex: 0,
      feesInserted: 0,
      feeTransactions: feeTransactions || [],
    };
  }

  /**
   * Process fee insertion step using SmartFeeInsertionService
   * @param {Object} feeInsertionState - Current fee insertion state
   * @param {Object} results - Results object to modify
   */
  processFeeInsertionStep(feeInsertionState, results) {
    if (!feeInsertionState.shouldInsertFees) {
      return;
    }

    const feeInsertionResult =
      this.smartFeeInsertionService.processFeeInsertion({
        shouldInsertFees: feeInsertionState.shouldInsertFees,
        insertionPoints: feeInsertionState.insertionPoints,
        currentTransactionIndex: feeInsertionState.currentTransactionIndex,
        feesInserted: feeInsertionState.feesInserted,
        feeTransactions: feeInsertionState.feeTransactions,
        results,
      });

    // Update fee insertion state
    feeInsertionState.insertionPoints = feeInsertionResult.insertionPoints;
    feeInsertionState.feesInserted = feeInsertionResult.feesInserted;
    feeInsertionState.currentTransactionIndex =
      feeInsertionResult.currentTransactionIndex;
  }

  /**
   * Process individual token step
   * @param {Object} params - Token processing parameters
   * @returns {Promise<Object>} Token processing result
   */
  processTokenStep(params) {
    const { token, tokenIndex, context, streamWriter, tokens } = params;

    return this.tokenProcessor.processTokenWithSSE({
      token,
      tokenIndex,
      context,
      streamWriter,
      progressInfo: {
        processedTokens: tokenIndex,
        totalTokens: tokens.length,
      },
    });
  }

  /**
   * Insert remaining fee transactions as fallback
   * @param {Object} feeInsertionState - Fee insertion state
   * @param {Object} results - Results object to modify
   */
  insertRemainingFees(feeInsertionState, results) {
    if (!feeInsertionState.shouldInsertFees) {
      return;
    }

    this.smartFeeInsertionService.insertRemainingFees({
      shouldInsertFees: feeInsertionState.shouldInsertFees,
      feesInserted: feeInsertionState.feesInserted,
      feeTransactions: feeInsertionState.feeTransactions,
      results,
    });
  }

  /**
   * Get current progress information
   * @param {number} totalTokens - Total number of tokens
   * @returns {Object} Current progress information
   */
  getProgressInfo(totalTokens) {
    return this.progressTracker.getProgressInfo(totalTokens);
  }

  /**
   * Get final processing summary
   * @param {number} totalTokens - Total number of tokens processed
   * @returns {Object} Final processing summary
   */
  getFinalSummary(totalTokens) {
    return this.progressTracker.getFinalSummary(totalTokens);
  }
}

module.exports = TokenBatchProcessor;
