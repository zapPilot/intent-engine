/**
 * SSEStreamManager - Reusable SSE streaming utilities for intent endpoints
 * Standardizes SSE connection setup, error handling, and cleanup patterns
 */

const SSEEventFactory = require('./SSEEventFactory');

class SSEStreamManager {
  /**
   * Standard SSE headers for all streaming endpoints
   */
  static get SSE_HEADERS() {
    return {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    };
  }

  /**
   * Initialize SSE connection with standard headers and connection event
   * @param {Response} res - Express response object
   * @param {string} intentId - Intent identifier
   * @param {Object} metadata - Additional connection metadata
   * @returns {Function} Stream writer function
   */
  static initializeStream(res, intentId, metadata = {}) {
    // Set SSE headers
    res.writeHead(200, this.SSE_HEADERS);

    // Create stream writer
    const streamWriter = SSEEventFactory.createStreamWriter(res);

    // Send initial connection event
    const connectionEvent = SSEEventFactory.createConnectionEvent(
      intentId,
      metadata
    );
    streamWriter(connectionEvent);

    return streamWriter;
  }

  /**
   * Create standardized intent batch transaction events
   * @param {Object} batchData - Batch transaction data
   * @returns {Object} Intent batch transaction event
   */
  static createIntentBatchEvent(batchData) {
    const {
      batchId,
      intentType,
      transactions = [],
      batchIndex = 0,
      totalBatches = 1,
      status = 'completed',
      metadata = {},
      error = null,
    } = batchData;

    const baseEvent = {
      type: 'intent_batch',
      batchId,
      intentType,
      batchIndex,
      totalBatches,
      progress: (batchIndex + 1) / totalBatches,
      status, // 'processing', 'completed', 'failed'
      timestamp: new Date().toISOString(),
      metadata: {
        batchSize: transactions.length,
        ...metadata,
      },
    };

    // Add appropriate data based on status
    if (status === 'failed' && error) {
      return {
        ...baseEvent,
        error: typeof error === 'string' ? error : error.message,
        transactions: [], // Don't include transactions on failure
      };
    }

    return {
      ...baseEvent,
      transactions,
    };
  }

  /**
   * Create transaction-specific events for individual txns within a batch
   * @param {Object} txnData - Individual transaction data
   * @returns {Object} Transaction event
   */
  static createTransactionEvent(txnData) {
    const {
      transactionId,
      txnIndex,
      totalTxns,
      status = 'pending',
      transactionHash = null,
      gasUsed = null,
      blockNumber = null,
      error = null,
      metadata = {},
    } = txnData;

    return {
      type: 'transaction_update',
      transactionId,
      txnIndex,
      totalTxns,
      progress: (txnIndex + 1) / totalTxns,
      status, // 'pending', 'confirmed', 'failed'
      transactionHash,
      gasUsed,
      blockNumber,
      error: error ? (typeof error === 'string' ? error : error.message) : null,
      timestamp: new Date().toISOString(),
      metadata,
    };
  }

  /**
   * Handle streaming errors with proper cleanup
   * @param {Response} res - Express response object
   * @param {Error|string} error - Error that occurred
   * @param {Object} context - Additional error context
   */
  static handleStreamError(res, error, context = {}) {
    console.error('SSE streaming error:', error);

    try {
      // If headers haven't been sent, send error response
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            error: {
              code: 'STREAMING_ERROR',
              message: 'Failed to process streaming request',
            },
          })
        );
        return;
      }

      // If already streaming, send error event
      const streamWriter = SSEEventFactory.createStreamWriter(res);
      const errorEvent = SSEEventFactory.createErrorEvent(error, context);
      streamWriter(errorEvent);

      // Close the connection after a small delay
      setTimeout(() => {
        res.end();
      }, 100);
    } catch (writeError) {
      console.error('Error handling stream error:', writeError);
      // Force close connection if all else fails
      if (!res.destroyed) {
        res.destroy();
      }
    }
  }

  /**
   * Gracefully close SSE stream with optional final event
   * @param {Response} res - Express response object
   * @param {Object} finalEvent - Optional final event to send before closing
   * @param {number} delay - Delay before closing (ms)
   */
  static closeStream(res, finalEvent = null, delay = 100) {
    try {
      if (finalEvent && !res.destroyed) {
        const streamWriter = SSEEventFactory.createStreamWriter(res);
        streamWriter(finalEvent);
      }

      // Add delay to ensure event is processed before connection closes
      setTimeout(() => {
        if (!res.destroyed) {
          res.end();
        }
      }, delay);
    } catch (error) {
      console.error('Error closing stream:', error);
      if (!res.destroyed) {
        res.destroy();
      }
    }
  }

  /**
   * Create a complete SSE endpoint handler with validation and error handling
   * @param {Object} options - Handler configuration
   * @returns {Function} Express route handler
   */
  static createStreamEndpoint(options) {
    const {
      validateParams,
      getExecutionContext,
      processStream,
      cleanup = () => {},
      intentType = 'unknown',
    } = options;

    return async (req, res) => {
      let streamWriter = null;
      const { intentId } = req.params;

      try {
        // Validate parameters
        if (validateParams) {
          const validation = validateParams(req);
          if (!validation.isValid) {
            return res.status(validation.statusCode).json({
              success: false,
              error: validation.error,
            });
          }
        }

        // Get execution context
        const executionContext = getExecutionContext(intentId);
        if (!executionContext) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'INTENT_NOT_FOUND',
              message: 'Intent execution context not found',
            },
          });
        }

        // Initialize stream
        streamWriter = this.initializeStream(res, intentId, {
          intentType,
          totalItems: executionContext.totalItems || 0,
        });

        // Process the streaming operation
        await processStream(executionContext, streamWriter);

        // Clean up and close
        cleanup(intentId);
        this.closeStream(res);
      } catch (error) {
        // Clean up on error
        cleanup(intentId);
        this.handleStreamError(res, error, { intentId });
      }
    };
  }

  /**
   * Validation helper for intent IDs
   * @param {Object} req - Express request object
   * @param {Function} validateId - Intent ID validation function
   * @param {Function} isExpired - Intent ID expiration check function
   * @returns {Object} Validation result
   */
  static validateIntentId(req, validateId, isExpired = null) {
    const { intentId } = req.params;

    if (!validateId(intentId)) {
      return {
        isValid: false,
        statusCode: 400,
        error: {
          code: 'INVALID_INTENT_ID',
          message: 'Invalid intent ID format',
        },
      };
    }

    // Check if expired
    if (isExpired && isExpired(intentId)) {
      return {
        isValid: false,
        statusCode: 410,
        error: {
          code: 'INTENT_EXPIRED',
          message: 'Intent ID has expired',
        },
      };
    }

    return { isValid: true };
  }
}

/**
 * DustZapSSEOrchestrator - Orchestrates SSE streaming for DustZap intents
 * Separates infrastructure concerns from business logic
 */
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
      console.error('SSE orchestration error:', error);

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
    // Delegate to executor's pure business method, then emit SSE events
    const businessResults =
      await this.dustZapHandler.executor.processTokensBusiness(
        executionContext
      );

    // Transform business results into SSE events
    this.emitTokenProcessingEvents(businessResults, streamWriter);

    return businessResults;
  }

  /**
   * Emit SSE events based on business processing results
   * @param {Object} businessResults - Results from pure business logic
   * @param {Function} streamWriter - SSE stream writer
   */
  emitTokenProcessingEvents(businessResults, streamWriter) {
    const { successful, failed } = businessResults;
    const totalTokens = successful.length + failed.length;

    // Emit events for successful tokens
    successful.forEach((result, resultIndex) => {
      // Use tokenIndex from result if available, otherwise use resultIndex
      const tokenIndex =
        typeof result.tokenIndex === 'number' ? result.tokenIndex : resultIndex;

      const tokenReadyEvent = SSEEventFactory.createTokenReadyEvent({
        tokenIndex: tokenIndex,
        token: result.token,
        transactions: result.transactions,
        // ✅ ADD: Missing swap quote data for progress bar
        provider: result.swapQuote?.provider,
        expectedTokenAmount: result.swapQuote?.toAmount || '0',
        minToAmount: result.swapQuote?.minToAmount || '0',
        toUsd: result.swapQuote?.toUsd || 0,
        gasCostUSD: result.swapQuote?.gasCostUSD || 0,
        tradingLoss: result.tradingLoss, // ✅ KEY FIX: Add trading loss for progress bar
        // Pass processedTokens and totalTokens for progress calculation
        processedTokens: tokenIndex,
        totalTokens: totalTokens,
      });
      streamWriter(tokenReadyEvent);
    });

    // Emit events for failed tokens
    failed.forEach((result, resultIndex) => {
      // Use tokenIndex from result if available, otherwise use resultIndex
      const tokenIndex =
        typeof result.tokenIndex === 'number' ? result.tokenIndex : resultIndex;

      const tokenFailedEvent = SSEEventFactory.createTokenFailedEvent({
        tokenIndex: tokenIndex,
        token: result.token,
        error: result.error,
        provider: 'failed',
        // Add trading loss even for failed tokens if available
        tradingLoss: result.tradingLoss || null,
        // Pass processedTokens and totalTokens for progress calculation
        processedTokens: tokenIndex,
        totalTokens: totalTokens,
      });
      streamWriter(tokenFailedEvent);
    });
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

module.exports = {
  SSEStreamManager,
  DustZapSSEOrchestrator,
};
