const crypto = require('crypto');

/**
 * Intent ID Generator Utility
 * Generates unique identifiers for tracking intent execution and SSE streams
 */
class IntentIdGenerator {
  /**
   * Generate a unique intent ID
   * @param {string} intentType - Type of intent (e.g., 'dustZap', 'rebalance')
   * @param {string} userAddress - User's wallet address
   * @returns {string} - Unique intent ID
   */
  static generate(intentType, userAddress) {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(8).toString('hex');
    const addressSuffix = userAddress.slice(-6); // Last 6 chars of address

    return `${intentType}_${timestamp}_${addressSuffix}_${randomBytes}`;
  }

  /**
   * Generate a shorter intent ID for development/testing
   * @param {string} intentType - Type of intent
   * @returns {string} - Short intent ID
   */
  static generateShort(intentType) {
    const randomBytes = crypto.randomBytes(4).toString('hex');
    return `${intentType}_${randomBytes}`;
  }

  /**
   * Validate intent ID format
   * @param {string} intentId - Intent ID to validate
   * @returns {boolean} - Whether the ID is valid
   */
  static validate(intentId) {
    if (!intentId || typeof intentId !== 'string') {
      return false;
    }

    // Check for basic format: intentType_timestamp_address_random
    const parts = intentId.split('_');
    return parts.length >= 2 && parts[0].length > 0;
  }

  /**
   * Extract intent type from intent ID
   * @param {string} intentId - Intent ID
   * @returns {string|null} - Intent type or null if invalid
   */
  static extractIntentType(intentId) {
    if (!this.validate(intentId)) {
      return null;
    }

    return intentId.split('_')[0];
  }

  /**
   * Check if intent ID is expired (older than specified duration)
   * @param {string} intentId - Intent ID
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
   * @returns {boolean} - Whether the intent ID is expired
   */
  static isExpired(intentId, maxAgeMs = 3600000) {
    if (!this.validate(intentId)) {
      return true;
    }

    const parts = intentId.split('_');
    if (parts.length < 4) {
      return true; // Assume short IDs don't expire quickly
    }

    const timestamp = parseInt(parts[1], 10);
    if (isNaN(timestamp)) {
      return true;
    }

    const age = Date.now() - timestamp;
    return age > maxAgeMs;
  }
}

module.exports = IntentIdGenerator;
