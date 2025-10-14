/**
 * PhasedExecutionStore - In-memory state management for phased zap execution
 *
 * Stores execution state between Phase 1 (swaps) and Phase 2 (deposits)
 * with automatic TTL-based cleanup to prevent memory leaks.
 */

class PhasedExecutionStore {
  constructor(ttlMinutes = 30) {
    /**
     * In-memory store: executionId -> PhasedExecutionState
     * @type {Map<string, Object>}
     */
    this.store = new Map();

    /**
     * Time-to-live in milliseconds
     * @type {number}
     */
    this.TTL_MS = ttlMinutes * 60 * 1000;

    /**
     * Cleanup interval timer
     * @type {NodeJS.Timeout}
     */
    this.cleanupInterval = this._startCleanupInterval();
  }

  /**
   * Store new phased execution state
   * @param {string} executionId - Unique execution identifier
   * @param {Object} state - Execution state object
   * @param {number} state.phase - Current phase (1 or 2)
   * @param {string} state.status - Status: 'pending' | 'completed' | 'failed'
   * @param {string} state.executionContext - Serialized execution context (JSON string)
   * @param {string[]} state.swapTokenAddresses - Token addresses to query after phase 1
   * @param {Object} [state.actualBalances] - Actual balances from Moralis (set in phase 2)
   * @param {string} state.userAddress - User wallet address
   * @param {string|number} state.chainId - Blockchain chain ID
   */
  set(executionId, state) {
    const now = Date.now();

    this.store.set(executionId, {
      ...state,
      executionId,
      createdAt: now,
      expiresAt: now + this.TTL_MS,
    });
  }

  /**
   * Retrieve execution state
   * @param {string} executionId - Execution identifier
   * @returns {Object|null} - Execution state or null if not found/expired
   */
  get(executionId) {
    const state = this.store.get(executionId);

    if (!state) {
      return null;
    }

    // Check expiration
    const now = Date.now();
    if (now > state.expiresAt) {
      this.store.delete(executionId);
      return null;
    }

    return state;
  }

  /**
   * Update existing execution state
   * @param {string} executionId - Execution identifier
   * @param {Partial<Object>} updates - State updates to merge
   * @throws {Error} - If execution not found or expired
   */
  update(executionId, updates) {
    const state = this.get(executionId);

    if (!state) {
      throw new Error(
        `Execution ${executionId} not found or expired (TTL: ${this.TTL_MS / 1000 / 60} minutes)`
      );
    }

    this.store.set(executionId, {
      ...state,
      ...updates,
    });
  }

  /**
   * Delete execution state
   * @param {string} executionId - Execution identifier
   * @returns {boolean} - True if deleted, false if not found
   */
  delete(executionId) {
    return this.store.delete(executionId);
  }

  /**
   * Get current store size
   * @returns {number} - Number of stored executions
   */
  size() {
    return this.store.size;
  }

  /**
   * Get all execution IDs (for debugging)
   * @returns {string[]} - Array of execution IDs
   */
  keys() {
    return Array.from(this.store.keys());
  }

  /**
   * Clear all stored executions
   */
  clear() {
    this.store.clear();
  }

  /**
   * Remove expired entries
   * @private
   * @returns {number} - Number of entries removed
   */
  _cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [id, state] of this.store.entries()) {
      if (now > state.expiresAt) {
        this.store.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      console.warn(
        `[PhasedExecutionStore] Cleaned up ${removed} expired execution(s)`
      );
    }

    return removed;
  }

  /**
   * Start automatic cleanup interval
   * @private
   * @returns {NodeJS.Timeout} - Interval timer
   */
  _startCleanupInterval() {
    // Run cleanup every 5 minutes
    const interval = setInterval(
      () => {
        this._cleanup();
      },
      5 * 60 * 1000
    );

    // Allow process to exit even if interval is running
    if (interval.unref) {
      interval.unref();
    }

    return interval;
  }

  /**
   * Gracefully shut down the store
   * Clears interval and all stored data
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.store.clear();
    console.warn('[PhasedExecutionStore] Destroyed and cleared');
  }

  /**
   * Get statistics about store usage
   * @returns {Object} - Store statistics
   */
  getStats() {
    const now = Date.now();
    let active = 0;
    let expired = 0;

    for (const state of this.store.values()) {
      if (now > state.expiresAt) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.store.size,
      active,
      expired,
      ttlMinutes: this.TTL_MS / 1000 / 60,
    };
  }
}

module.exports = PhasedExecutionStore;
