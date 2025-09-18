const express = require('express');
const IntentController = require('../controllers/IntentController');
const { validateIntentRequest } = require('../middleware/requestValidator');

const router = express.Router();

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
  IntentController.processDustZapIntent
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
router.get(
  '/api/dustzap/:intentId/stream',
  IntentController.handleDustZapStream
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
router.get('/api/v1/intents', IntentController.getSupportedIntents);

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
router.get('/api/v1/intents/health', IntentController.getIntentHealth);

/**
 * UnifiedZap Intent Endpoints - Multi-strategy allocation
 */

/**
 * @swagger
 * /api/v1/intents/unifiedZap:
 *   post:
 *     tags:
 *       - Intents
 *     summary: Execute UnifiedZap intent (multi-strategy allocation)
 *     description: Allocates funds across multiple DeFi strategies in a single transaction flow, with real-time SSE streaming
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
 *                     $ref: '#/components/schemas/UnifiedZapParams'
 *           examples:
 *             unifiedZapRequest:
 *               summary: Multi-strategy allocation request
 *               value:
 *                 userAddress: "0x2eCBC6f229feD06044CDb0dD772437a30190CD50"
 *                 chainId: 8453
 *                 params:
 *                   strategyAllocations:
 *                     - strategyId: "stablecoin"
 *                       percentage: 70
 *                     - strategyId: "eth"
 *                       percentage: 30
 *                   inputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
 *                   inputAmount: "1000000000"
 *                   slippage: 0.5
 *     responses:
 *       200:
 *         description: UnifiedZap intent initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnifiedZapResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/api/v1/intents/unifiedZap',
  validateIntentRequest,
  IntentController.processUnifiedZapIntent
);

/**
 * @swagger
 * /api/unifiedzap/{intentId}/stream:
 *   get:
 *     tags:
 *       - Intents
 *     summary: Stream UnifiedZap execution progress
 *     description: SSE endpoint for real-time multi-strategy allocation progress
 *     parameters:
 *       - in: path
 *         name: intentId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^unifiedZap_\d+_[a-fA-F0-9]{6}_[a-fA-F0-9]{16}$'
 *         description: Intent ID returned from UnifiedZap intent initiation
 *     responses:
 *       200:
 *         description: SSE stream with real-time processing updates
 *         headers:
 *           Content-Type:
 *             schema:
 *               type: string
 *               example: "text/event-stream"
 *       400:
 *         description: Invalid intent ID format
 *       404:
 *         description: Intent execution context not found
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/api/unifiedzap/:intentId/stream',
  IntentController.handleUnifiedZapStream
);

/**
 * @swagger
 * /api/v1/strategies:
 *   get:
 *     tags:
 *       - Strategies
 *     summary: Get available strategy categories
 *     description: Returns all available DeFi strategy categories for multi-strategy allocation
 *     responses:
 *       200:
 *         description: Strategy categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 strategies:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "stablecoin"
 *                       displayName:
 *                         type: string
 *                         example: "Stablecoins"
 *                       description:
 *                         type: string
 *                       targetAssets:
 *                         type: array
 *                         items:
 *                           type: string
 *                       chains:
 *                         type: array
 *                         items:
 *                           type: string
 *                       protocolCount:
 *                         type: integer
 *                 total:
 *                   type: integer
 *                 supportedChains:
 *                   type: array
 *                   items:
 *                     type: string
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/api/v1/strategies', IntentController.getStrategies);

/**
 * @swagger
 * /api/v1/strategies/{strategyId}/protocols:
 *   get:
 *     tags:
 *       - Strategies
 *     summary: Get protocol breakdown for a strategy
 *     description: Returns detailed protocol information for a specific strategy
 *     parameters:
 *       - in: path
 *         name: strategyId
 *         required: true
 *         schema:
 *           type: string
 *           example: "stablecoin"
 *         description: Strategy ID to get protocols for
 *       - in: query
 *         name: chain
 *         required: false
 *         schema:
 *           type: string
 *           example: "base"
 *         description: Optional chain filter
 *     responses:
 *       200:
 *         description: Strategy protocol details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 strategyId:
 *                   type: string
 *                 protocols:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       chain:
 *                         type: string
 *                       weight:
 *                         type: number
 *                       enabled:
 *                         type: boolean
 *       404:
 *         description: Strategy not found
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/api/v1/strategies/:strategyId/protocols',
  IntentController.getStrategyProtocols
);

/**
 * Placeholder endpoints for future intents
 */

/**
 * Optimize intent endpoint - Unified dustZap, rebalance, compound operations
 * POST /api/v1/intents/optimize
 */
router.post(
  '/api/v1/intents/optimize',
  validateIntentRequest,
  IntentController.processOptimizeIntent
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

const VaultController = require('../controllers/VaultController');

// Vault metadata endpoints
router.get('/api/v1/vaults', VaultController.getAllVaults);
router.get(
  '/api/v1/vaults/:vaultId/strategy',
  VaultController.getVaultStrategy
);

// Export both router and intentService for cleanup in tests
// Export both router and intentService for tests to perform cleanup
module.exports = router;
try {
  const IntentController = require('../controllers/IntentController');
  module.exports.intentService = IntentController.intentService;
} catch (_err) {
  // In case of isolated module loading during tests
}
