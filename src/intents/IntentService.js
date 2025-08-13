const DustZapIntentHandler = require('./DustZapIntentHandler');

/**
 * Intent Service - Orchestrates different intent handlers
 */
class IntentService {
  constructor(swapService, priceService, rebalanceClient) {
    this.handlers = new Map();

    // Register intent handlers
    this.handlers.set(
      'dustZap',
      new DustZapIntentHandler(swapService, priceService, rebalanceClient)
    );
    // Future handlers can be added here:
    // this.handlers.set('zapIn', new ZapInIntentHandler(...));
    // this.handlers.set('zapOut', new ZapOutIntentHandler(...));
    // this.handlers.set('rebalance', new RebalanceIntentHandler(...));
  }

  /**
   * Process an intent request
   * @param {string} intentType - Type of intent (dustZap, zapIn, zapOut, rebalance)
   * @param {Object} request - Intent request object
   * @returns {Promise<Object>} - Intent response with transactions
   */
  async processIntent(intentType, request) {
    // Validate intent type
    if (!intentType || typeof intentType !== 'string') {
      throw new Error('Intent type is required and must be a string');
    }

    // Get handler for intent type
    const handler = this.handlers.get(intentType);
    if (!handler) {
      throw new Error(
        `Unknown intent type: ${intentType}. Supported types: ${Array.from(this.handlers.keys()).join(', ')}`
      );
    }

    // Validate request structure
    this.validateRequest(request);

    try {
      // Execute intent
      const result = await handler.execute(request);

      // Ensure result has required fields
      if (!result || typeof result !== 'object') {
        throw new Error('Intent handler returned invalid result');
      }

      // All intents now use SSE streaming mode
      if (!result.intentId || !result.streamUrl) {
        throw new Error(
          'SSE streaming response must include intentId and streamUrl'
        );
      }

      return result;
    } catch (error) {
      console.error(`Error processing ${intentType} intent:`, error);
      throw error;
    }
  }

  /**
   * Validate basic request structure
   * @param {Object} request - Intent request
   */
  validateRequest(request) {
    if (!request || typeof request !== 'object') {
      throw new Error('Request must be an object');
    }

    const { userAddress, chainId, params } = request;

    if (!userAddress) {
      throw new Error('userAddress is required');
    }

    if (!chainId) {
      throw new Error('chainId is required');
    }

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
  }

  /**
   * Get list of supported intent types
   * @returns {Array<string>} - Array of supported intent type names
   */
  getSupportedIntents() {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if an intent type is supported
   * @param {string} intentType - Intent type to check
   * @returns {boolean} - True if intent type is supported
   */
  isIntentSupported(intentType) {
    return this.handlers.has(intentType);
  }

  /**
   * Get handler instance for testing/debugging
   * @param {string} intentType - Intent type
   * @returns {Object|null} - Handler instance or null if not found
   */
  getHandler(intentType) {
    return this.handlers.get(intentType) || null;
  }

  /**
   * Clean up all handlers (cleanup timers, intervals, etc.)
   * Essential for preventing Jest test hanging
   */
  cleanup() {
    for (const [intentType, handler] of this.handlers) {
      if (handler && typeof handler.cleanup === 'function') {
        try {
          handler.cleanup();
        } catch (error) {
          console.warn(
            `Error cleaning up ${intentType} handler:`,
            error.message
          );
        }
      }
    }
  }

  /**
   * Process an optimize intent request
   * @param {Object} request - Optimize intent request object
   * @returns {Promise<Object>} - Optimize intent response with results of sub-operations
   */
  async processOptimizeIntent(request) {
    this.validateRequest(request);

    const { userAddress, chainId, params } = request;
    const {
      operations = ['dustZap'], // Default to dustZap only
      slippageTolerance = 0.5,
    } = params;

    const validOperations = ['dustZap', 'rebalance', 'compound'];
    const invalidOps = operations.filter(op => !validOperations.includes(op));
    if (invalidOps.length > 0) {
      throw new Error(`Invalid operations: ${invalidOps.join(', ')}`);
    }

    console.log(
      'FIXED VERSION: IntentService.processOptimizeIntent - input chainId:',
      chainId,
      'operations:',
      operations
    );

    const results = {
      success: true,
      userAddress,
      chainId: chainId, // Use the actual chainId from request
      operations: {},
      summary: {
        totalOperations: operations.length,
        executedOperations: 0,
        estimatedGasUSD: 0,
        transactions: [],
      },
    };

    // Process operations in order
    for (const operation of operations) {
      if (operation === 'dustZap') {
        try {
          const dustZapResult = await this.processIntent('dustZap', {
            userAddress,
            chainId,
            params: {
              dustThreshold: params.dustThreshold || 5,
              targetToken: params.targetToken || 'USDC',
              slippageTolerance,
            },
          });

          results.operations.dustZap = {
            success: true,
            ...dustZapResult,
          };
          results.summary.executedOperations++;

          if (dustZapResult.transactions) {
            results.summary.transactions.push(...dustZapResult.transactions);
          }
          if (dustZapResult.summary?.totalGasUSD) {
            results.summary.estimatedGasUSD +=
              dustZapResult.summary.totalGasUSD;
          }
        } catch (dustError) {
          results.operations.dustZap = {
            success: false,
            error: dustError.message,
          };
        }
      } else if (operation === 'rebalance') {
        results.operations.rebalance = {
          success: false,
          error: 'Rebalance operation not yet implemented',
          placeholder: {
            description:
              'Will analyze portfolio deviation and rebalance based on vault strategy',
            expectedLogic: [
              '1. Get current portfolio weights from rebalance_backend',
              '2. Compare with target vault strategy weights',
              '3. Calculate rebalancing actions if deviation > threshold',
              '4. Execute cross-chain and local rebalancing transactions',
            ],
            requiredIntegration: 'rebalance_backend /bundle_portfolio endpoint',
          },
        };
      } else if (operation === 'compound') {
        results.operations.compound = {
          success: false,
          error: 'Compound operation not yet implemented',
          placeholder: {
            description:
              'Will claim and reinvest pending rewards across all vault positions',
            expectedLogic: [
              '1. Identify all positions with claimable rewards',
              '2. Calculate optimal compounding strategy',
              '3. Claim rewards and swap to optimal vault tokens',
              '4. Reinvest into highest APR positions within vault strategy',
            ],
            requiredIntegration:
              'rebalance_backend /bundle_portfolio claimable_rewards',
          },
        };
      }
    }

    return results;
  }
}

module.exports = IntentService;
