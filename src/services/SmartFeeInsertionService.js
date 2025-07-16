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
}

module.exports = SmartFeeInsertionService;
