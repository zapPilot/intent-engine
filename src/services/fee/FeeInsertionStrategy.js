/**
 * Fee Insertion Strategy
 * Handles strategy calculation and execution for fee transaction insertion
 */

const FeeCalculator = require('./FeeCalculator');
const InsertionStrategyParams = require('../../valueObjects/InsertionStrategyParams');

class FeeInsertionStrategy {
  constructor() {
    this.calculator = new FeeCalculator();
  }

  /**
   * Calculate insertion strategy using InsertionStrategyParams (recommended approach)
   * @param {InsertionStrategyParams} params - Insertion strategy parameters
   * @returns {Object} - Complete insertion strategy
   */
  calculateInsertionStrategyWithParams(params) {
    if (!(params instanceof InsertionStrategyParams)) {
      throw new Error('Expected InsertionStrategyParams instance');
    }

    const [
      batches,
      totalFeeETH,
      totalTransactionCount,
      feeTransactionCount,
      options,
    ] = params.toMethodParameters();

    return this.calculateInsertionStrategy(
      batches,
      totalFeeETH,
      totalTransactionCount,
      feeTransactionCount,
      options
    );
  }

  /**
   * Calculate insertion strategy with comprehensive analysis
   * @param {Array} batches - Token batches
   * @param {number} totalFeeETH - Total fee in ETH
   * @param {number} totalTransactionCount - Total number of transactions
   * @param {number} feeTransactionCount - Number of fee transactions
   * @param {Object} options - Strategy options
   * @returns {Object} - Complete insertion strategy
   */
  calculateInsertionStrategy(
    batches,
    totalFeeETH,
    totalTransactionCount,
    feeTransactionCount,
    options = {}
  ) {
    const minimumThreshold = this.calculator.calculateMinimumThreshold(
      batches,
      totalFeeETH,
      options
    );
    const insertionPoints = this.calculator.generateRandomInsertionPoints(
      minimumThreshold,
      totalTransactionCount,
      feeTransactionCount,
      options
    );

    return {
      minimumThreshold,
      insertionPoints,
      strategy:
        minimumThreshold >= totalTransactionCount ? 'fallback' : 'random',
      metadata: {
        totalTokens: batches.reduce((sum, batch) => sum + batch.length, 0),
        totalTransactions: totalTransactionCount,
        feeTransactionCount,
        availableRange: Math.max(0, totalTransactionCount - minimumThreshold),
      },
    };
  }

  /**
   * Validate insertion strategy for safety
   * @param {Object} strategy - Insertion strategy object
   * @param {number} totalTransactionCount - Total transaction count
   * @returns {boolean} - Whether strategy is valid
   */
  validateInsertionStrategy(strategy, totalTransactionCount) {
    const { insertionPoints, minimumThreshold } = strategy;

    // Check all insertion points are within bounds
    const validIndices = insertionPoints.every(
      point => point >= 0 && point < totalTransactionCount
    );

    // Check insertion points are after minimum threshold (with some tolerance for fallback)
    const afterMinimum = insertionPoints.every(
      point => point >= minimumThreshold || strategy.strategy === 'fallback'
    );

    // Check for reasonable distribution
    const sortedPoints = [...insertionPoints].sort((a, b) => a - b);
    const isSequential = sortedPoints.every(
      (point, index) =>
        index === 0 ||
        point === sortedPoints[index - 1] ||
        point > sortedPoints[index - 1]
    );

    return validIndices && afterMinimum && isSequential;
  }

  /**
   * Determine if the fee block should be inserted at the current position
   * @param {number} currentTransactionCount - Current number of transactions
   * @param {Object} insertionStrategy - Fee insertion strategy
   * @param {number} processedTokenCount - Number of tokens processed so far
   * @param {number} totalTokenCount - Total number of tokens to process
   * @returns {boolean} - Whether to insert the fee block now
   */
  shouldInsertFeeBlock(
    currentTransactionCount,
    insertionStrategy,
    processedTokenCount,
    totalTokenCount
  ) {
    // Extract insertion strategy details
    const {
      minimumThreshold,
      insertionPoints = [],
      strategy,
    } = insertionStrategy;

    // For fallback strategy, wait until near the end
    if (strategy === 'fallback') {
      const progressPercentage = processedTokenCount / totalTokenCount;
      return progressPercentage >= 0.8; // Insert when 80% of tokens are processed
    }

    // For random strategy, use the first insertion point as the target
    // (since we're inserting the entire fee block at once)
    if (insertionPoints.length > 0) {
      const targetInsertionPoint = insertionPoints[0];

      // Insert when we've reached or passed the target insertion point
      return currentTransactionCount >= targetInsertionPoint;
    }

    // Fallback: use minimum threshold
    return currentTransactionCount >= minimumThreshold;
  }

  /**
   * Execute fee block insertion based on insertion strategy
   * @param {Object} params - Fee insertion execution parameters
   * @param {Array} params.feeTransactions - Fee transactions to insert
   * @param {Object} params.insertionStrategy - Fee insertion strategy
   * @param {Array} params.transactions - Current transaction array to insert into
   * @param {number} params.currentTransactionCount - Current transaction count
   * @param {number} params.processedTokenCount - Tokens processed so far
   * @param {number} params.totalTokenCount - Total tokens to process
   * @returns {Object} - Execution result with insertion status
   */
  executeFeeBlockInsertion(params) {
    const {
      feeTransactions,
      insertionStrategy,
      transactions,
      currentTransactionCount,
      processedTokenCount,
      totalTokenCount,
    } = params;

    if (
      !feeTransactions ||
      !insertionStrategy ||
      feeTransactions.length === 0
    ) {
      return {
        inserted: false,
        reason: 'No fee transactions or strategy provided',
      };
    }

    const shouldInsert = this.shouldInsertFeeBlock(
      currentTransactionCount,
      insertionStrategy,
      processedTokenCount,
      totalTokenCount
    );

    if (shouldInsert) {
      // Insert all fee transactions as a cohesive block (deposit + transfer(s))
      transactions.push(...feeTransactions);

      return {
        inserted: true,
        position: currentTransactionCount,
        feeTransactionCount: feeTransactions.length,
        reason: `Inserted fee block at position ${currentTransactionCount} (${insertionStrategy.strategy} strategy)`,
      };
    }

    return {
      inserted: false,
      reason: `Conditions not met for fee insertion (current: ${currentTransactionCount}, strategy: ${insertionStrategy.strategy})`,
    };
  }

  /**
   * Execute fallback fee insertion at the end of transactions
   * @param {Object} params - Fallback insertion parameters
   * @param {Array} params.feeTransactions - Fee transactions to insert
   * @param {Array} params.transactions - Transaction array to insert into
   * @returns {Object} - Insertion result
   */
  executeFallbackFeeInsertion(params) {
    const { feeTransactions, transactions } = params;

    if (!feeTransactions || feeTransactions.length === 0) {
      return {
        inserted: false,
        reason: 'No fee transactions to insert',
      };
    }

    const insertionPosition = transactions.length;
    transactions.push(...feeTransactions);

    return {
      inserted: true,
      position: insertionPosition,
      feeTransactionCount: feeTransactions.length,
      reason: `Fallback insertion at end (position ${insertionPosition})`,
    };
  }

  /**
   * Process fee insertion logic with comprehensive state management
   * @param {Object} params - Fee insertion state parameters
   * @param {boolean} params.shouldInsertFees - Whether fee insertion is enabled
   * @param {Array} params.insertionPoints - Current insertion points
   * @param {number} params.currentTransactionIndex - Current transaction index
   * @param {number} params.feesInserted - Number of fees inserted so far
   * @param {Array} params.feeTransactions - Fee transactions to insert
   * @param {Object} params.results - Results object with transactions array
   * @returns {Object} - Updated insertion state
   */
  processFeeInsertion(params) {
    const {
      shouldInsertFees,
      insertionPoints,
      currentTransactionIndex,
      feesInserted,
      feeTransactions,
      results,
    } = params;

    let updatedInsertionPoints = insertionPoints;
    let updatedFeesInserted = feesInserted;
    let updatedTransactionIndex = currentTransactionIndex;

    // Check if we should insert fee transactions before processing this token
    if (
      shouldInsertFees &&
      updatedInsertionPoints.length > 0 &&
      updatedInsertionPoints[0] <= currentTransactionIndex
    ) {
      // Insert fee transactions at this point
      const feesToInsert = Math.min(
        feeTransactions.length - updatedFeesInserted,
        updatedInsertionPoints.length
      );

      for (let j = 0; j < feesToInsert; j++) {
        if (updatedFeesInserted < feeTransactions.length) {
          results.transactions.push(feeTransactions[updatedFeesInserted]);
          updatedFeesInserted++;
          updatedTransactionIndex++;
        }
      }

      // Remove used insertion points
      updatedInsertionPoints = updatedInsertionPoints.slice(feesToInsert);
    }

    return {
      insertionPoints: updatedInsertionPoints,
      feesInserted: updatedFeesInserted,
      currentTransactionIndex: updatedTransactionIndex,
    };
  }

  /**
   * Insert any remaining fee transactions as fallback
   * @param {Object} params - Remaining fee insertion parameters
   * @param {boolean} params.shouldInsertFees - Whether fee insertion is enabled
   * @param {number} params.feesInserted - Number of fees inserted so far
   * @param {Array} params.feeTransactions - Fee transactions array
   * @param {Object} params.results - Results object with transactions array
   */
  insertRemainingFees(params) {
    const { shouldInsertFees, feesInserted, feeTransactions, results } = params;

    if (shouldInsertFees && feesInserted < feeTransactions.length) {
      const remainingFees = feeTransactions.slice(feesInserted);
      results.transactions.push(...remainingFees);

      // Inserted remaining fee transactions as fallback
    }
  }
}

module.exports = FeeInsertionStrategy;
