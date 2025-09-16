const IntentService = require('../intents/IntentService');
const RebalanceBackendClient = require('../services/RebalanceBackendClient');
const SwapService = require('../services/swapService');
const PriceService = require('../services/priceService');
const {
  DustZapStreamHandler,
  UnifiedZapStreamHandler,
} = require('../handlers');
const {
  mapDustZapError,
  mapUnifiedZapError,
} = require('../utils/errorHandlerUtils');
const UNIFIED_ZAP_CONFIG = require('../config/unifiedZapConfig');

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
const unifiedZapStreamHandlerInstance = new UnifiedZapStreamHandler(
  intentService
);

class IntentController {
  /**
   * Format protocol details for API response
   * @private
   */
  /**
   * Extract core protocol name from protocol data
   * @private
   */
  static _extractProtocolName(protocol) {
    // First try to extract from id (e.g., "aave-usdc-base" -> "aave")
    if (protocol.id) {
      const idParts = protocol.id.split('-');
      if (idParts.length > 0) {
        return idParts[0].toLowerCase();
      }
    }

    // Fallback to extracting from name (e.g., "Aave USDC" -> "aave")
    if (protocol.name) {
      const nameParts = protocol.name.split(' ');
      if (nameParts.length > 0) {
        return nameParts[0].toLowerCase();
      }
    }

    // Last resort: extract from implementation (e.g., "AaveProtocol" -> "aave")
    if (protocol.implementation) {
      const impl = protocol.implementation.replace(/Protocol$/, '').toLowerCase();
      return impl;
    }

    return 'unknown';
  }

  static _formatProtocolDetails(protocol) {
    return {
      id: protocol.id,
      protocol: IntentController._extractProtocolName(protocol),
      name: protocol.name.replace(/\s\([\w\s]+\)$/, ''), // Remove chain suffix like "(Arbitrum)"
      implementation: protocol.implementation,
      chain: protocol.chain,
      chainId: protocol.chainId,
      weight: protocol.weight,
      enabled: protocol.enabled !== false,
      mode: protocol.config?.mode || 'single',
      targetTokens:
        protocol.config?.lpTokens?.map(([symbol]) => symbol) ||
        [
          protocol.config?.symbolOfBestTokenToZapInOut ||
            protocol.config?.symbolOfBestTokenToZapOut,
        ].filter(Boolean),
    };
  }

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

  /**
   * Execute UnifiedZap intent (multi-strategy allocation)
   * POST /api/v1/intents/unifiedZap
   */
  static async processUnifiedZapIntent(req, res) {
    try {
      const result = await intentService.processIntent('unifiedZap', req.body);
      res.json(result);
    } catch (error) {
      console.error('UnifiedZap intent error:', error);
      const { statusCode, errorCode, message, details } =
        mapUnifiedZapError(error);
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
   * Stream UnifiedZap execution progress
   * GET /api/unifiedzap/{intentId}/stream
   */
  static handleUnifiedZapStream(req, res) {
    unifiedZapStreamHandlerInstance.handleStream(req, res);
  }

  /**
   * Get available strategy categories with full protocol details
   * GET /api/v1/strategies
   */
  static getStrategies(req, res) {
    try {
      const strategies = Object.entries(
        UNIFIED_ZAP_CONFIG.STRATEGY_CATEGORIES
      ).map(([id, config]) => ({
        id,
        displayName: config.displayName,
        description: config.description,
        targetAssets: config.targetAssets,
        chains: config.chains,
        protocolCount: config.protocols.length,
        enabledProtocolCount: config.protocols.filter(p => p.enabled !== false)
          .length,
        protocols: config.protocols.map(protocol =>
          IntentController._formatProtocolDetails(protocol)
        ),
      }));

      res.json({
        success: true,
        strategies,
        total: strategies.length,
        supportedChains: Object.keys(UNIFIED_ZAP_CONFIG.SUPPORTED_CHAINS),
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error getting strategies:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get available strategies',
        },
      });
    }
  }

  /**
   * Get protocol breakdown for a specific strategy
   * GET /api/v1/strategies/{strategyId}/protocols
   */
  static getStrategyProtocols(req, res) {
    try {
      const { strategyId } = req.params;
      const { chain } = req.query; // Optional chain filter

      const strategyConfig = UNIFIED_ZAP_CONFIG.STRATEGY_CATEGORIES[strategyId];
      if (!strategyConfig) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'STRATEGY_NOT_FOUND',
            message: `Strategy '${strategyId}' not found`,
            availableStrategies: Object.keys(
              UNIFIED_ZAP_CONFIG.STRATEGY_CATEGORIES
            ),
          },
        });
      }

      // Filter protocols by chain if specified
      let protocols = strategyConfig.protocols;
      if (chain) {
        protocols = protocols.filter(p => p.chain === chain);
      }

      // Format protocol information using reusable function
      const protocolDetails = protocols.map(protocol =>
        IntentController._formatProtocolDetails(protocol)
      );

      res.json({
        success: true,
        strategyId,
        strategyName: strategyConfig.displayName,
        chain: chain || 'all',
        protocols: protocolDetails,
        totalProtocols: protocolDetails.length,
        totalWeight: protocolDetails.reduce((sum, p) => sum + p.weight, 0),
        enabledProtocols: protocolDetails.filter(p => p.enabled).length,
      });
    } catch (error) {
      console.error('Error getting strategy protocols:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get strategy protocol details',
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
