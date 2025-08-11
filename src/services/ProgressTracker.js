/**
 * ProgressTracker - Manages progress tracking and callbacks during batch processing
 * Extracted from SwapProcessingService for better separation of concerns
 */

class ProgressTracker {
  constructor() {
    this.reset();
  }

  /**
   * Reset tracking state for new batch
   */
  reset() {
    this.processedCount = 0;
    this.successfulCount = 0;
    this.failedCount = 0;
    this.totalValueUSD = 0;
  }

  /**
   * Handle token processing result and update progress
   * @param {Object} params - Result handling parameters
   * @returns {Object} Updated progress information
   */
  handleTokenProcessingResult(params) {
    const {
      tokenResult,
      results,
      tokenIndex,
      token,
      tokens,
      onProgress,
      currentTransactionIndex,
    } = params;

    let updatedTransactionIndex = currentTransactionIndex;

    if (tokenResult.success) {
      results.successful.push(tokenResult);
      results.transactions.push(...tokenResult.transactions);
      results.totalValueUSD += tokenResult.inputValueUSD || 0;
      this.totalValueUSD += tokenResult.inputValueUSD || 0;
      this.successfulCount++;
      // Update transaction index count (typically 2 transactions per token: approve + swap)
      updatedTransactionIndex += tokenResult.transactions.length;
    } else {
      results.failed.push(tokenResult);
      this.failedCount++;
    }

    this.processedCount++;

    // Call progress callback if provided
    if (onProgress) {
      onProgress({
        tokenIndex,
        token,
        result: tokenResult,
        processed: tokenIndex + 1,
        total: tokens.length,
        progress: this.getProgressInfo(tokens.length),
      });
    }

    return {
      updatedTransactionIndex,
      progressInfo: this.getProgressInfo(tokens.length),
    };
  }

  /**
   * Get current progress information
   * @param {number} totalTokens - Total number of tokens being processed
   * @returns {Object} Progress information
   */
  getProgressInfo(totalTokens) {
    return {
      processedCount: this.processedCount,
      successfulCount: this.successfulCount,
      failedCount: this.failedCount,
      totalCount: totalTokens,
      progressPercentage:
        totalTokens > 0 ? (this.processedCount / totalTokens) * 100 : 0,
      totalValueUSD: this.totalValueUSD,
    };
  }

  /**
   * Check if all tokens have been processed
   * @param {number} totalTokens - Total number of tokens
   * @returns {boolean} Whether processing is complete
   */
  isComplete(totalTokens) {
    return this.processedCount >= totalTokens;
  }

  /**
   * Get final summary of processing results
   * @param {number} totalTokens - Total number of tokens processed
   * @returns {Object} Final processing summary
   */
  getFinalSummary(totalTokens) {
    return {
      totalTokens,
      processedTokens: this.processedCount,
      successfulTokens: this.successfulCount,
      failedTokens: this.failedCount,
      totalValueUSD: this.totalValueUSD,
      completionRate:
        totalTokens > 0 ? (this.successfulCount / totalTokens) * 100 : 0,
    };
  }
}

module.exports = ProgressTracker;
