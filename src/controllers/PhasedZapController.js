/**
 * PhasedZapController - HTTP controller for phased UnifiedZap execution
 *
 * Handles two-phase execution flow:
 * Phase 1: Generate swap transactions → store execution context
 * Phase 2: Query actual balances → generate deposit transactions
 */

const UnifiedZapExecutor = require('../executors/UnifiedZapExecutor');
const BalanceService = require('../services/balanceService');
const SwapService = require('../services/swapService');
const PriceService = require('../services/priceService');
const RebalanceBackendClient = require('../services/RebalanceBackendClient');
const { mapUnifiedZapError } = require('../utils/errorHandlerUtils');

// Initialize services
const swapService = new SwapService();
const priceService = new PriceService();
const rebalanceClient = new RebalanceBackendClient();
const balanceService = new BalanceService();

// Initialize executor with balanceService for phased execution
const executor = new UnifiedZapExecutor(
  swapService,
  priceService,
  rebalanceClient,
  balanceService
);

class PhasedZapController {
  /**
   * Initialize Phase 1 - Generate swap-only transactions
   * POST /api/v1/intents/unified-zap/phased/init
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  static async initializePhase1(req, res) {
    try {
      const request = req.body;

      // Validate request has required fields
      if (!request.userAddress || !request.chainId || !request.params) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message:
              'Missing required fields: userAddress, chainId, and params are required',
          },
        });
      }

      // Call executor to initialize Phase 1
      const result = await executor.initializePhasedExecution(request);

      // Return Phase 1 response
      res.json({
        success: true,
        executionId: result.executionId,
        phase: result.phase,
        transactions: result.transactions,
        metadata: {
          totalStrategies: result.metadata.totalStrategies,
          totalProtocols: result.metadata.totalProtocols,
          swapCount: result.transactions.length,
          userAddress: result.metadata.userAddress,
          chainId: result.metadata.chainId,
          expiresAt: new Date(result.metadata.expiresAt).toISOString(),
          nextStep:
            'Execute Phase 1 transactions on-chain, then call /phased/continue/:executionId',
        },
      });
    } catch (error) {
      console.error('Phase 1 initialization error:', error);

      // Map error to appropriate HTTP response
      const { statusCode, errorCode, message, details } =
        mapUnifiedZapError(error);

      res.status(statusCode).json({
        success: false,
        error: {
          code: errorCode,
          message,
          details,
        },
      });
    }
  }

  /**
   * Continue to Phase 2 - Query balances and generate deposit transactions
   * POST /api/v1/intents/unified-zap/phased/continue/:executionId
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  static async continueToPhase2(req, res) {
    try {
      const { executionId } = req.params;

      // Validate executionId
      if (!executionId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'executionId is required',
          },
        });
      }

      // Call executor to continue to Phase 2
      const result = await executor.continueToNextPhase(executionId);

      // Return Phase 2 response
      res.json({
        success: true,
        executionId: result.executionId,
        phase: result.phase,
        transactions: result.transactions,
        actualBalances: result.actualBalances,
        metadata: {
          totalProtocols: result.metadata.totalProtocols,
          depositCount: result.transactions.length,
          balanceQueryTime: new Date(
            result.metadata.balanceQueryTime
          ).toISOString(),
        },
      });
    } catch (error) {
      console.error('Phase 2 continuation error:', error);

      // Handle specific error cases
      if (error.message.includes('not found or expired')) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'EXECUTION_NOT_FOUND',
            message: error.message,
          },
        });
      }

      if (error.message.includes('Invalid phase')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PHASE',
            message: error.message,
          },
        });
      }

      if (
        error.message.includes('No non-zero balances') ||
        error.message.includes('Zero balances detected') ||
        error.message.includes('Missing balances for tokens')
      ) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_BALANCES',
            message: error.message,
            details: {
              suggestion:
                'Ensure Phase 1 swap transactions completed successfully before calling Phase 2',
            },
          },
        });
      }

      // Map other errors
      const { statusCode, errorCode, message, details } =
        mapUnifiedZapError(error);

      res.status(statusCode).json({
        success: false,
        error: {
          code: errorCode,
          message,
          details,
        },
      });
    }
  }

  /**
   * Get execution status
   * GET /api/v1/intents/unified-zap/phased/status/:executionId
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  static async getStatus(req, res) {
    try {
      const { executionId } = req.params;

      // Validate executionId
      if (!executionId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'executionId is required',
          },
        });
      }

      // Retrieve execution state from store
      const state = executor.phasedStore.get(executionId);

      if (!state) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'EXECUTION_NOT_FOUND',
            message: `Execution ${executionId} not found or expired`,
          },
        });
      }

      // Build metadata response
      const metadata = {
        userAddress: state.userAddress,
        chainId: state.chainId,
        swapTokenAddresses: state.swapTokenAddresses,
        createdAt: new Date(state.createdAt).toISOString(),
        expiresAt: new Date(state.expiresAt).toISOString(),
      };

      // Add actual balances if Phase 2 was started
      if (state.actualBalances) {
        metadata.actualBalances = state.actualBalances;
      }

      // Return status response
      res.json({
        success: true,
        executionId: state.executionId,
        phase: state.phase,
        status: state.status,
        metadata,
      });
    } catch (error) {
      console.error('Get status error:', error);

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve execution status',
          details: {
            error: error.message,
          },
        },
      });
    }
  }

  /**
   * Get executor instance (for testing)
   * @returns {UnifiedZapExecutor}
   */
  static getExecutor() {
    return executor;
  }

  /**
   * Get phased store statistics (for debugging/monitoring)
   * @returns {Object} - Store statistics
   */
  static getStoreStats() {
    return executor.phasedStore.getStats();
  }
}

module.exports = PhasedZapController;
