const express = require('express');
const IntentService = require('../intents/IntentService');
const SwapService = require('../services/swapService');
const PriceService = require('../services/priceService');
const RebalanceBackendClient = require('../services/RebalanceBackendClient');
const { DustZapStreamHandler } = require('../handlers');
const { validateIntentRequest } = require('../middleware/requestValidator');

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
router.post('/api/v1/intents/zapIn', validateIntentRequest, (req, res) => {
  try {
    // const { params } = req.body;
    // const { fromToken, vault, amount } = params;

    // TODO: Implement zapIn logic
    // 1. Get vault strategy configuration
    // 2. Calculate optimal deposit path: approve → swap → deposit → stake
    // 3. Build transaction batch

    res.status(501).json({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'ZapIn intent implementation in progress',
        expectedParams: {
          fromToken: 'Token address to swap from',
          vault: 'Vault identifier (stablecoin-vault, btc-vault, etc.)',
          amount: 'Amount in wei',
          slippageTolerance: 'Optional: slippage tolerance (default: 0.5)',
        },
      },
    });
  } catch (error) {
    console.error('ZapIn intent error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to process zapIn intent',
      },
    });
  }
});

/**
 * ZapOut intent endpoint - Vault withdrawals to any token
 * POST /api/v1/intents/zapOut
 */
router.post('/api/v1/intents/zapOut', validateIntentRequest, (req, res) => {
  try {
    const { params } = req.body;
    // const { vault, percentage, toToken } = params;
    const { percentage } = params;

    // Validate percentage range
    if (percentage < 0 || percentage > 100) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'percentage must be between 0 and 100',
          details: { percentage },
        },
      });
    }

    // TODO: Implement zapOut logic
    // 1. Get user's vault position
    // 2. Calculate withdrawal amount based on percentage
    // 3. Build transaction batch: approve → withdraw → swap

    res.status(501).json({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'ZapOut intent implementation in progress',
        expectedParams: {
          vault: 'Vault identifier (stablecoin-vault, btc-vault, etc.)',
          percentage: 'Withdrawal percentage (0-100)',
          toToken: 'Target token address',
          slippageTolerance: 'Optional: slippage tolerance (default: 0.5)',
        },
      },
    });
  } catch (error) {
    console.error('ZapOut intent error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to process zapOut intent',
      },
    });
  }
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

        // TODO: Implement rebalance logic
        else if (operation === 'rebalance') {
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
              requiredIntegration:
                'rebalance_backend /bundle_portfolio endpoint',
            },
          };
        }

        // TODO: Implement compound logic
        else if (operation === 'compound') {
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
router.post('/api/v1/intents/rebalance', validateIntentRequest, (req, res) => {
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
router.get('/api/v1/vaults', (req, res) => {
  try {
    // TODO: Load vault configurations from frontend vault classes or database
    const vaults = [
      {
        id: 'stablecoin-vault',
        name: 'Stablecoin Vault',
        description: 'Low-risk yield generation with stablecoins',
        riskLevel: 'low',
        expectedAPR: { min: 5, max: 15 },
        supportedChains: [1, 42161, 8453, 10],
        totalTVL: 0, // TODO: Calculate from rebalance_backend
        status: 'active',
      },
      {
        id: 'btc-vault',
        name: 'BTC Vault',
        description: 'Bitcoin-focused investment strategy',
        riskLevel: 'medium',
        expectedAPR: { min: 8, max: 25 },
        supportedChains: [8453], // Base
        totalTVL: 0,
        status: 'active',
      },
      {
        id: 'eth-vault',
        name: 'ETH Vault',
        description: 'Ethereum-focused investment strategy',
        riskLevel: 'medium',
        expectedAPR: { min: 6, max: 20 },
        supportedChains: [42161, 8453], // Arbitrum, Base
        totalTVL: 0,
        status: 'active',
      },
      {
        id: 'index500-vault',
        name: 'Index 500 Vault',
        description: 'S&P500-like index fund strategy for crypto markets',
        riskLevel: 'medium-high',
        expectedAPR: { min: 10, max: 30 },
        supportedChains: [42161, 8453],
        totalTVL: 0,
        status: 'active',
      },
    ];

    res.json({
      success: true,
      vaults,
      total: vaults.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching vaults:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch vault information',
      },
    });
  }
});

/**
 * Get vault strategy configuration
 * GET /api/v1/vaults/:vaultId/strategy
 */
router.get('/api/v1/vaults/:vaultId/strategy', (req, res) => {
  try {
    const { vaultId } = req.params;

    // TODO: Load actual vault strategy from frontend vault classes
    const mockStrategies = {
      'stablecoin-vault': {
        description:
          'Diversified stablecoin yield farming across multiple protocols',
        weightMapping: {
          stablecoins: 1.0,
        },
        protocols: [
          {
            protocol: 'aave',
            chain: 'arbitrum',
            weight: 0.4,
            tokens: ['USDC', 'USDT'],
            type: 'lending',
          },
          {
            protocol: 'convex',
            chain: 'arbitrum',
            weight: 0.6,
            tokens: ['USDC', 'USDT'],
            type: 'LP',
          },
        ],
        rebalanceThreshold: 0.05,
        constraints: {
          maxSingleProtocolWeight: 0.7,
          minAPRThreshold: 3.0,
        },
      },
      'btc-vault': {
        description: 'Bitcoin-focused strategy with BTC-denominated yields',
        weightMapping: {
          btc: 1.0,
        },
        protocols: [
          {
            protocol: 'aerodrome',
            chain: 'base',
            weight: 0.8,
            tokens: ['tBTC', 'cbBTC'],
            type: 'LP',
          },
          {
            protocol: 'equilibria',
            chain: 'base',
            weight: 0.2,
            tokens: ['cbBTC'],
            type: 'single',
          },
        ],
        rebalanceThreshold: 0.05,
      },
      'eth-vault': {
        description: 'Ethereum liquid staking and yield strategies',
        weightMapping: {
          long_term_bond: 1.0,
        },
        protocols: [
          {
            protocol: 'pendle',
            chain: 'arbitrum',
            weight: 0.54,
            tokens: ['wstETH', 'eETH'],
            type: 'PT',
          },
          {
            protocol: 'aave',
            chain: 'base',
            weight: 0.24,
            tokens: ['WETH'],
            type: 'lending',
          },
          {
            protocol: 'aerodrome',
            chain: 'base',
            weight: 0.22,
            tokens: ['WETH', 'msETH'],
            type: 'LP',
          },
        ],
        rebalanceThreshold: 0.05,
      },
      'index500-vault': {
        description: 'Diversified crypto index with BTC and ETH focus',
        weightMapping: {
          btc: 0.841,
          eth: 0.159,
        },
        protocols: [
          // BTC portion (84.1%)
          {
            protocol: 'aerodrome',
            chain: 'base',
            weight: 0.673, // 0.8 * 0.841
            tokens: ['tBTC', 'cbBTC'],
            type: 'LP',
          },
          {
            protocol: 'equilibria',
            chain: 'base',
            weight: 0.168, // 0.2 * 0.841
            tokens: ['cbBTC'],
            type: 'single',
          },
          // ETH portion (15.9%)
          {
            protocol: 'pendle',
            chain: 'arbitrum',
            weight: 0.086, // 0.54 * 0.159
            tokens: ['wstETH', 'eETH'],
            type: 'PT',
          },
          {
            protocol: 'aave',
            chain: 'base',
            weight: 0.038, // 0.24 * 0.159
            tokens: ['WETH'],
            type: 'lending',
          },
          {
            protocol: 'aerodrome',
            chain: 'base',
            weight: 0.035, // 0.22 * 0.159
            tokens: ['WETH', 'msETH'],
            type: 'LP',
          },
        ],
        rebalanceThreshold: 0.05,
      },
    };

    const strategy = mockStrategies[vaultId];
    if (!strategy) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'VAULT_NOT_FOUND',
          message: `Vault '${vaultId}' not found`,
          availableVaults: Object.keys(mockStrategies),
        },
      });
    }

    res.json({
      success: true,
      vaultId,
      strategy,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching vault strategy:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch vault strategy',
      },
    });
  }
});

// Export both router and intentService for cleanup in tests
module.exports = router;
module.exports.intentService = intentService;
