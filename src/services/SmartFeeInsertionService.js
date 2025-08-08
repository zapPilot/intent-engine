/**
 * Smart Fee Insertion Service
 * Handles intelligent placement of fee transactions to ensure ETH availability
 * and prevent predictable fee transaction locations
 */

const crypto = require('crypto');
const DUST_ZAP_CONFIG = require('../config/dustZapConfig');

/**
 * Service responsible for calculating optimal fee transaction insertion points
 */
class SmartFeeInsertionService {
  /**
   * Calculate minimum threshold for fee insertion based on expected ETH availability
   * @param {Array} batches - Array of token batches to be processed
   * @param {number} totalFeeETH - Total fee amount needed in ETH
   * @param {Object} options - Configuration options
   * @param {number} options.minimumThresholdPercentage - Minimum percentage of swaps to complete (default: 0.4)
   * @param {number} options.safetyBuffer - Additional safety buffer (default: 0.1)
   * @returns {number} - Minimum transaction index where fees can be inserted
   */
  calculateMinimumThreshold(batches, totalFeeETH, options = {}) {
    const {
      minimumThresholdPercentage = 0.4, // Wait for 40% of swaps to complete
      safetyBuffer = 0.1, // Add 10% safety buffer
    } = options;

    // Calculate total number of swap transactions (approve + swap per token)
    const totalTokens = batches.reduce((sum, batch) => sum + batch.length, 0);
    const totalSwapTransactions =
      totalTokens * DUST_ZAP_CONFIG.TRANSACTIONS_PER_TOKEN;

    // Calculate minimum threshold with safety buffer
    const minimumSwapPercentage = minimumThresholdPercentage + safetyBuffer;
    const minimumSwapsNeeded = Math.ceil(
      totalSwapTransactions * minimumSwapPercentage
    );

    // Ensure we have at least some transactions completed before inserting fees
    const absoluteMinimum = Math.ceil(totalTokens * 0.2); // At least 20% of tokens processed

    return Math.max(minimumSwapsNeeded, absoluteMinimum);
  }

  /**
   * Generate random insertion points for fee transactions
   * @param {number} minimumIndex - Minimum index where fees can be inserted
   * @param {number} maxIndex - Maximum index (total transaction count)
   * @param {number} feeTransactionCount - Number of fee transactions to insert
   * @param {Object} options - Configuration options
   * @param {number} options.spreadFactor - How spread out the fee transactions should be (default: 0.3)
   * @returns {Array<number>} - Sorted array of insertion indices
   */
  generateRandomInsertionPoints(
    minimumIndex,
    maxIndex,
    feeTransactionCount,
    options = {}
  ) {
    const { spreadFactor = 0.3 } = options;

    if (minimumIndex >= maxIndex) {
      // Fallback: if minimum index is too high, insert near the end but still randomized
      const fallbackRange = Math.max(3, Math.floor(maxIndex * 0.1)); // Use last 10% or at least 3 positions
      const fallbackStart = Math.max(0, maxIndex - fallbackRange);
      return this.generateRandomInsertionPointsInRange(
        fallbackStart,
        maxIndex,
        feeTransactionCount
      );
    }

    const availableRange = maxIndex - minimumIndex;

    if (availableRange < feeTransactionCount) {
      // Not enough space to spread out, place sequentially with small random offsets
      return this.generateSequentialWithRandomOffset(
        minimumIndex,
        maxIndex,
        feeTransactionCount
      );
    }

    // Calculate optimal spread based on available range
    const spreadRange = Math.floor(availableRange * spreadFactor);
    const insertionPoints = [];

    // Generate random points with good distribution
    for (let i = 0; i < feeTransactionCount; i++) {
      const basePosition =
        minimumIndex + Math.floor((i * availableRange) / feeTransactionCount);
      const maxRandomOffset = Math.min(spreadRange, availableRange);
      const randomOffset =
        maxRandomOffset > 0 ? crypto.randomInt(0, maxRandomOffset) : 0;
      const insertionPoint = Math.min(
        basePosition + randomOffset,
        maxIndex - 1
      );

      insertionPoints.push(insertionPoint);
    }

    // Sort and ensure uniqueness
    const uniquePoints = [...new Set(insertionPoints)].sort((a, b) => a - b);

    // If we lost some points due to duplicates, fill in randomly
    while (
      uniquePoints.length < feeTransactionCount &&
      uniquePoints[uniquePoints.length - 1] < maxIndex - 1
    ) {
      const randomPoint = crypto.randomInt(minimumIndex, maxIndex);
      if (!uniquePoints.includes(randomPoint)) {
        uniquePoints.push(randomPoint);
        uniquePoints.sort((a, b) => a - b);
      }
    }

    return uniquePoints.slice(0, feeTransactionCount);
  }

  /**
   * Generate random insertion points within a specific range
   * @param {number} startIndex - Start of range
   * @param {number} endIndex - End of range
   * @param {number} count - Number of points to generate
   * @returns {Array<number>} - Random insertion points
   */
  generateRandomInsertionPointsInRange(startIndex, endIndex, count) {
    const points = [];
    const range = endIndex - startIndex;

    for (let i = 0; i < count && points.length < range; i++) {
      let randomPoint;
      let attempts = 0;

      do {
        randomPoint = startIndex + crypto.randomInt(0, range);
        attempts++;
      } while (points.includes(randomPoint) && attempts < 10);

      if (!points.includes(randomPoint)) {
        points.push(randomPoint);
      }
    }

    return points.sort((a, b) => a - b);
  }

  /**
   * Generate sequential points with small random offsets
   * @param {number} minimumIndex - Minimum starting index
   * @param {number} maxIndex - Maximum index
   * @param {number} count - Number of points needed
   * @returns {Array<number>} - Sequential points with random offsets
   */
  generateSequentialWithRandomOffset(minimumIndex, maxIndex, count) {
    const points = [];
    const spacing = Math.max(1, Math.floor((maxIndex - minimumIndex) / count));

    for (let i = 0; i < count; i++) {
      const basePosition = minimumIndex + i * spacing;
      const maxOffset = Math.min(spacing - 1, 2); // Small random offset
      const randomOffset =
        maxOffset > 0 ? crypto.randomInt(0, maxOffset + 1) : 0;
      const insertionPoint = Math.min(
        basePosition + randomOffset,
        maxIndex - 1
      );

      points.push(insertionPoint);
    }

    return points;
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
    const minimumThreshold = this.calculateMinimumThreshold(
      batches,
      totalFeeETH,
      options
    );
    const insertionPoints = this.generateRandomInsertionPoints(
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

      console.log(
        `Inserted ${remainingFees.length} remaining fee transactions as fallback`
      );
    }
  }
}

module.exports = SmartFeeInsertionService;
