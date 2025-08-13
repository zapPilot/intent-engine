const IntentService = require('../intents/IntentService');
const RebalanceBackendClient = require('../services/RebalanceBackendClient');
const SwapService = require('../services/swapService');
const PriceService = require('../services/priceService');
const { DustZapStreamHandler } = require('../handlers');
const { mapDustZapError } = require('../utils/errorHandlerUtils');

// Initialize services (these should ideally be injected or managed by a DI container)
const swapService = new SwapService();
const priceService = new PriceService();
const rebalanceClient = new RebalanceBackendClient();
const intentService = new IntentService(
  swapService,
  priceService,
  rebalanceClient
);

// Initialize stream handlers
const dustZapStreamHandlerInstance = new DustZapStreamHandler(intentService);

class IntentController {
  /**
   * Execute DustZap intent
   * POST /api/v1/intents/dustZap
   */
  static async processDustZapIntent(req, res) {
    try {
      const result = await intentService.processIntent('dustZap', req.body);
      res.json(result);
    } catch (error) {
      console.error('DustZap intent error:', error);
      const { statusCode, errorCode, message, details } =
        mapDustZapError(error);
      res.status(statusCode).json({
        success: false,
        error: {
          code: errorCode,
          message: message,
          details: details,
        },
      });
    }
  }

  /**
   * Stream DustZap execution progress
   * GET /api/dustzap/{intentId}/stream
   */
  static handleDustZapStream(req, res) {
    dustZapStreamHandlerInstance.handleStream(req, res);
  }

  /**
   * Get supported intent types
   * GET /api/v1/intents
   */
  static getSupportedIntents(req, res) {
    try {
      const supportedIntents = intentService.getSupportedIntents();
      res.json({
        success: true,
        intents: supportedIntents,
        total: supportedIntents.length,
      });
    } catch (error) {
      console.error('Error getting supported intents:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get supported intents',
        },
      });
    }
  }

  /**
   * Intent service health check
   * GET /api/v1/intents/health
   */
  static async getIntentHealth(req, res) {
    try {
      const healthChecks = {
        intentService: true,
        swapService: true,
        priceService: true,
        rebalanceBackend: await rebalanceClient.healthCheck(),
      };

      const allHealthy = Object.values(healthChecks).every(
        status => status === true
      );
      const statusCode = allHealthy ? 200 : 503;

      res.status(statusCode).json({
        success: allHealthy,
        status: allHealthy ? 'healthy' : 'degraded',
        services: healthChecks,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Health check error:', error);
      res.status(500).json({
        success: false,
        status: 'error',
        message: 'Health check failed',
      });
    }
  }

  /**
   * Process optimize intent (unified dustZap, rebalance, compound operations)
   * POST /api/v1/intents/optimize
   */
  static async processOptimizeIntent(req, res) {
    try {
      const result = await intentService.processOptimizeIntent(req.body);
      res.json(result);
    } catch (error) {
      console.error('Optimize intent error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process optimize intent',
          details: error.message,
        },
      });
    }
  }

  // Expose intentService for testing purposes
  static get intentService() {
    return intentService;
  }
}

module.exports = IntentController;
