/**
 * Execution Context Manager - Manages execution contexts with cleanup
 */
class ExecutionContextManager {
  constructor(config) {
    this.executionContexts = new Map();
    this.config = config;
    this.cleanupTimer = null;

    this.startCleanupTimer();
  }

  /**
   * Store execution context for processing
   * @param {string} intentId - Intent ID
   * @param {Object} executionContext - Execution context to store
   */
  storeExecutionContext(intentId, executionContext) {
    this.executionContexts.set(intentId, {
      ...executionContext,
      intentId,
      createdAt: Date.now(),
    });
  }

  /**
   * Retrieve execution context for processing
   * @param {string} intentId - Intent ID
   * @returns {Object|null} - Execution context or null if not found
   */
  getExecutionContext(intentId) {
    return this.executionContexts.get(intentId) || null;
  }

  /**
   * Remove execution context after processing
   * @param {string} intentId - Intent ID
   */
  removeExecutionContext(intentId) {
    this.executionContexts.delete(intentId);
  }

  /**
   * Start cleanup timer for expired contexts
   */
  startCleanupTimer() {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredContexts();
    }, this.config.SSE_STREAMING.CLEANUP_INTERVAL);
  }

  /**
   * Cleanup expired execution contexts
   */
  cleanupExpiredContexts() {
    const now = Date.now();
    const maxAge = this.config.SSE_STREAMING.CONNECTION_TIMEOUT;

    for (const [intentId, context] of this.executionContexts.entries()) {
      if (now - context.createdAt > maxAge) {
        this.executionContexts.delete(intentId);
      }
    }
  }

  /**
   * Cleanup method - clears the interval timer
   */
  cleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get status information for debugging
   */
  getStatus() {
    return {
      activeContexts: this.executionContexts.size,
      timerActive: !!this.cleanupTimer,
    };
  }
}

module.exports = ExecutionContextManager;
