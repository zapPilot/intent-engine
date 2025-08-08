const express = require('express');
const IntentService = require('../intents/IntentService');
const SwapService = require('../services/swapService');
const PriceService = require('../services/priceService');
const RebalanceBackendClient = require('../services/RebalanceBackendClient');
const { DustZapStreamHandler } = require('../handlers');

const router = express.Router();

// Initialize services
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

/**
 * Input validation middleware for intent requests
 */
function validateIntentRequest(req, res, next) {
  const { userAddress, chainId, params } = req.body;

  // Validate userAddress
  if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid userAddress: must be a valid Ethereum address',
        details: { field: 'userAddress', value: userAddress },
      },
    });
  }

  // Validate chainId
  if (!chainId || !Number.isInteger(chainId) || chainId <= 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid chainId: must be a positive integer',
        details: { field: 'chainId', value: chainId },
      },
    });
  }

  // Validate params
  if (!params || typeof params !== 'object') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'params object is required',
        details: { field: 'params', value: params },
      },
    });
  }

  next();
}

/**
 * @swagger
 * /api/v1/intents/dustZap:
 *   post:
 *     tags:
 *       - Intents
 *     summary: Execute DustZap intent
 *     description: Converts dust tokens (small value tokens) to ETH using optimal swap routes across multiple DEX aggregators. Returns a streaming response for real-time processing updates.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/IntentRequest'
 *               - type: object
 *                 properties:
 *                   params:
 *                     $ref: '#/components/schemas/DustZapParams'
 *           examples:
 *             dustZapRequest:
 *               summary: Basic DustZap request
 *               value:
 *                 userAddress: "0x2eCBC6f229feD06044CDb0dD772437a30190CD50"
 *                 chainId: 8453
 *                 params:
 *                   dustThreshold: 5
 *                   targetToken: "ETH"
 *                   toTokenAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
 *                   toTokenDecimals: 18
 *                   slippage: 1
 *                   referralAddress: "0x1234567890123456789012345678901234567890"
 *                   dustTokens:
 *                     - address: "0x1217bfe6c773eec6cc4a38b5dc45b92292b6e189"
 *                       symbol: "OpenUSDT"
 *                       amount: 0.943473
 *                       price: 0.99985
 *                       decimals: 6
 *                       raw_amount_hex_str: "0xe6571"
 *                     - address: "0x526728dbc96689597f85ae4cd716d4f7fccbae9d"
 *                       symbol: "msUSD"
 *                       amount: 0.040852155251341185
 *                       price: 0.9962465895840099
 *                       decimals: 18
 *                       raw_amount_hex_str: "0x9122d19a10b77f"
 *     responses:
 *       200:
 *         description: DustZap intent initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DustZapResponse'
 *             examples:
 *               dustZapResponse:
 *                 summary: Successful DustZap response
 *                 value:
 *                   success: true
 *                   intentType: "dustZap"
 *                   mode: "streaming"
 *                   intentId: "dustZap_1640995200000_abc123_def456789abcdef0"
 *                   streamUrl: "/api/dustzap/dustZap_1640995200000_abc123_def456789abcdef0/stream"
 *                   metadata:
 *                     totalTokens: 5
 *                     estimatedDuration: "5-10 seconds"
 *                     streamingEnabled: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       503:
 *         $ref: '#/components/responses/ServiceUnavailable'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/api/v1/intents/dustZap',
  validateIntentRequest,
  async (req, res) => {
    try {
      const result = await intentService.processIntent('dustZap', req.body);
      res.json(result);
    } catch (error) {
      console.error('DustZap intent error:', error);

      let statusCode = 500;
      let errorCode = 'INTERNAL_SERVER_ERROR';
      let message =
        'An unexpected error occurred while processing dustZap intent';
      let details = {};

      // Handle specific error types
      if (error.message.includes('No dust tokens found')) {
        statusCode = 400;
        errorCode = 'NO_DUST_TOKENS';
        message = error.message;
      } else if (
        error.message.includes('Invalid') ||
        error.message.includes('must be')
      ) {
        statusCode = 400;
        errorCode = 'VALIDATION_ERROR';
        message = error.message;
      } else if (error.message.includes('Rebalance backend')) {
        statusCode = 503;
        errorCode = 'EXTERNAL_SERVICE_ERROR';
        message = 'Unable to fetch token balances from backend service';
        details = { service: 'rebalance_backend' };
      } else if (error.message.includes('swap quote')) {
        statusCode = 503;
        errorCode = 'LIQUIDITY_ERROR';
        message = 'Unable to find swap routes for some tokens';
      }

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
);

/**
 * @swagger
 * /api/dustzap/{intentId}/stream:
 *   get:
 *     tags:
 *       - Intents
 *     summary: Stream DustZap execution progress
 *     description: |
 *       A Server-Sent Events (SSE) endpoint that streams real-time progress updates during DustZap intent execution — including token-by-token processing, transaction data, and completion status.
 *       To consume the stream:
 *       <ul>
 *         <li>In JavaScript, use EventSource with the onmessage handler.</li>
 *         <li>In Flutter, use a package like eventsource or manually parse the HTTP stream.</li>
 *       </ul>
 *     parameters:
 *       - in: path
 *         name: intentId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^dustZap_\d+_[a-fA-F0-9]{6}_[a-fA-F0-9]{16}$'
 *           example: "dustZap_1640995200000_abc123_def456789abcdef0"
 *         description: Intent ID returned from DustZap intent initiation
 *     responses:
 *       200:
 *         description: SSE stream with real-time processing updates
 *         headers:
 *           Content-Type:
 *             schema:
 *               type: string
 *               example: "text/event-stream"
 *           Cache-Control:
 *             schema:
 *               type: string
 *               example: "no-cache"
 *           Connection:
 *             schema:
 *               type: string
 *               example: "keep-alive"
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               description: SSE events with JSON data
 *             examples:
 *               connectedEvent:
 *                 summary: Initial connection event
 *                 value: |
 *                   data: {"type":"connected","intentId":"dustZap_123","totalTokens":5,"timestamp":"2024-01-01T00:00:00.000Z"}
 *               tokenReadyEvent:
 *                 summary: Token processing completed
 *                 value: |
 *                   data: {"type":"token_ready","tokenIndex":0,"tokenSymbol":"TOKEN1","transactions":[...],"progress":0.2,"timestamp":"2024-01-01T00:00:00.000Z"}
 *               completeEvent:
 *                 summary: All processing completed
 *                 value: |
 *                   data: {"type":"complete","transactions":[...],"metadata":{"totalTokens":5,"processedTokens":5},"timestamp":"2024-01-01T00:00:00.000Z"}
 *       400:
 *         description: Invalid intent ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Intent execution context not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       410:
 *         description: Intent ID has expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */

// Clean DustZap stream endpoint using handler class

// Replace the auto-generated endpoint with our custom handler class
router.get('/api/dustzap/:intentId/stream', (req, res) =>
  dustZapStreamHandlerInstance.handleStream(req, res)
);

/**
 * @swagger
 * /api/v1/intents:
 *   get:
 *     tags:
 *       - Intents
 *     summary: Get supported intent types
 *     description: Returns a list of all supported intent types and their configurations
 *     responses:
 *       200:
 *         description: List of supported intents retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, intents, total]
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 intents:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["dustZap"]
 *                 total:
 *                   type: integer
 *                   example: 1
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/api/v1/intents', (req, res) => {
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
});

/**
 * @swagger
 * /api/v1/intents/health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Intent service health check
 *     description: Performs health checks on intent service and all dependent services including swap service, price service, and rebalance backend
 *     responses:
 *       200:
 *         description: All services are healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, status, services, timestamp]
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: string
 *                   enum: [healthy, degraded]
 *                   example: "healthy"
 *                 services:
 *                   type: object
 *                   properties:
 *                     intentService:
 *                       type: boolean
 *                       example: true
 *                     swapService:
 *                       type: boolean
 *                       example: true
 *                     priceService:
 *                       type: boolean
 *                       example: true
 *                     rebalanceBackend:
 *                       type: boolean
 *                       example: true
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-01T00:00:00.000Z"
 *       503:
 *         description: One or more services are unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 status:
 *                   type: string
 *                   example: "degraded"
 *                 services:
 *                   type: object
 *                   additionalProperties:
 *                     type: boolean
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Health check failed due to internal error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Health check failed"
 */
router.get('/api/v1/intents/health', async (req, res) => {
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
});

/**
 * Placeholder endpoints for future intents
 */

/**
 * ZapIn intent endpoint - Vault deposits from any token
 * POST /api/v1/intents/zapIn
 */
router.post('/api/v1/intents/zapIn', validateIntentRequest, (req, res, next) => {
  const { AppError } = require('../utils/errors');
  // Feature not yet implemented
  next(new AppError('ZapIn intent not yet implemented', 501, 'NOT_IMPLEMENTED', {
    expectedParams: {
      fromToken: 'Token address to swap from',
      vault: 'Vault identifier (stablecoin-vault, btc-vault, etc.)',
      amount: 'Amount in wei',
      slippageTolerance: 'Optional: slippage tolerance (default: 0.5)',
    },
  }));
});

/**
 * ZapOut intent endpoint - Vault withdrawals to any token
 * POST /api/v1/intents/zapOut
 */
router.post('/api/v1/intents/zapOut', validateIntentRequest, (req, res, next) => {
  const { AppError } = require('../utils/errors');
  // Feature not yet implemented
  next(new AppError('ZapOut intent not yet implemented', 501, 'NOT_IMPLEMENTED', {
    expectedParams: {
      vault: 'Vault identifier (stablecoin-vault, btc-vault, etc.)',
      percentage: 'Withdrawal percentage (0-100)',
      toToken: 'Target token address',
      slippageTolerance: 'Optional: slippage tolerance (default: 0.5)',
    },
  }));
});

/**
 * Optimize intent endpoint - Unified dustZap, rebalance, compound operations
 * POST /api/v1/intents/optimize
 */
router.post(
  '/api/v1/intents/optimize',
  validateIntentRequest,
  async (req, res) => {
    try {
      const { userAddress, chainId, params } = req.body;
      const {
        operations = ['dustZap'], // Default to dustZap only
        slippageTolerance = 0.5,
      } = params;

      // Validate operations array
      if (!Array.isArray(operations) || operations.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'operations must be a non-empty array',
            details: { operations },
          },
        });
      }

      const validOperations = ['dustZap', 'rebalance', 'compound'];
      const invalidOps = operations.filter(op => !validOperations.includes(op));
      if (invalidOps.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: `Invalid operations: ${invalidOps.join(', ')}`,
            details: { validOperations, invalidOperations: invalidOps },
          },
        });
      }

      const results = {
        success: true,
        userAddress,
        chainId,
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
          // Implement dustZap logic using existing service
          try {
            const dustZapResult = await intentService.processIntent('dustZap', {
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
        }

        // Rebalance operation not yet implemented
        else if (operation === 'rebalance') {
          const { AppError } = require('../utils/errors');
          throw new AppError('Rebalance operation not yet implemented', 501, 'NOT_IMPLEMENTED');
        }

        // Compound operation not yet implemented
        else if (operation === 'compound') {
          const { AppError } = require('../utils/errors');
          throw new AppError('Compound operation not yet implemented', 501, 'NOT_IMPLEMENTED');
        }
      }

      res.json(results);
    } catch (error) {
      console.error('Optimize intent error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process optimize intent',
        },
      });
    }
  }
);

// Legacy rebalance endpoint (deprecated - use optimize instead)
router.post('/api/v1/intents/rebalance', (req, res) => {
  res.status(301).json({
    success: false,
    error: {
      code: 'ENDPOINT_DEPRECATED',
      message:
        'This endpoint is deprecated. Use POST /api/v1/intents/optimize with operations: ["rebalance"]',
    },
    redirectTo: '/api/v1/intents/optimize',
  });
});

/**
 * Vault metadata endpoints
 */

/**
 * Get all available vaults
 * GET /api/v1/vaults
 */
router.get('/api/v1/vaults', (req, res, next) => {
  const { AppError } = require('../utils/errors');
  // Vault configurations not yet implemented
  next(new AppError('Vault configurations not yet implemented', 501, 'NOT_IMPLEMENTED', {
    message: 'Vault metadata will be loaded from frontend vault classes or database',
    expectedVaults: ['stablecoin-vault', 'btc-vault', 'eth-vault', 'index500-vault', 'real-yield-vault'],
  }));
});

/**
 * Get vault strategy configuration
 * GET /api/v1/vaults/:vaultId/strategy
 */
router.get('/api/v1/vaults/:vaultId/strategy', (req, res, next) => {
  const { AppError } = require('../utils/errors');
  // Vault strategy configurations not yet implemented
  next(new AppError('Vault strategy configurations not yet implemented', 501, 'NOT_IMPLEMENTED', {
    message: 'Vault strategies will be loaded from frontend vault classes',
    vaultId: req.params.vaultId,
});

// Export both router and intentService for cleanup in tests
module.exports = router;
module.exports.intentService = intentService;
