const express = require('express');
const { validateIntentRequest } = require('../middleware/requestValidator');

const router = express.Router();

/**
 * Phased UnifiedZap Routes
 *
 * Two-phase execution flow for multi-strategy allocation:
 * Phase 1: Execute all swap transactions, wait for on-chain confirmation
 * Phase 2: Query actual balances via Moralis, execute deposits with actual amounts
 *
 * This approach eliminates "dust" tokens from swap estimation errors.
 */

/**
 * @swagger
 * /api/v1/intents/unified-zap/phased/init:
 *   post:
 *     tags:
 *       - Phased Execution
 *     summary: Initialize Phase 1 of phased UnifiedZap execution
 *     description: |
 *       Generates Phase 1 transactions (all swaps and approvals) for multi-strategy allocation.
 *       After executing these transactions on-chain, call the continue endpoint with the executionId
 *       to proceed to Phase 2 (deposits with actual on-chain balances).
 *
 *       **Flow:**
 *       1. Call this endpoint to get Phase 1 transactions
 *       2. User signs and executes all swap transactions on-chain
 *       3. Wait for transaction confirmations
 *       4. Call `/phased/continue/:executionId` to get Phase 2 deposit transactions
 *
 *       **Benefits:**
 *       - Eliminates dust tokens from swap estimation errors
 *       - Uses actual on-chain balances for deposits
 *       - Reduces transaction failures from insufficient balances
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
 *             phasedInitRequest:
 *               summary: Initialize phased execution for stablecoin strategy
 *               value:
 *                 userAddress: "0x2eCBC6f229feD06044CDb0dD772437a30190CD50"
 *                 chainId: 8453
 *                 params:
 *                   strategyAllocations:
 *                     - strategyId: "stablecoin"
 *                       percentage: 100
 *                   inputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
 *                   inputAmount: "1000000000"
 *                   slippage: 0.5
 *     responses:
 *       200:
 *         description: Phase 1 transactions generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, executionId, phase, transactions, metadata]
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 executionId:
 *                   type: string
 *                   format: uuid
 *                   example: "550e8400-e29b-41d4-a716-446655440000"
 *                   description: Unique execution ID to use for Phase 2 continuation
 *                 phase:
 *                   type: integer
 *                   example: 1
 *                   description: Current phase number
 *                 transactions:
 *                   type: array
 *                   description: Phase 1 swap transactions (approvals and swaps)
 *                   items:
 *                     type: object
 *                     properties:
 *                       to:
 *                         type: string
 *                         example: "0x1111111254EEB25477B68fb85Ed929f73A960582"
 *                       data:
 *                         type: string
 *                         example: "0x12aa3caf..."
 *                       value:
 *                         type: string
 *                         example: "0"
 *                       gasLimit:
 *                         type: string
 *                         example: "300000"
 *                       description:
 *                         type: string
 *                         example: "Swap USDC to WETH via 1inch"
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     totalStrategies:
 *                       type: integer
 *                       example: 1
 *                     totalProtocols:
 *                       type: integer
 *                       example: 3
 *                     swapCount:
 *                       type: integer
 *                       example: 2
 *                     userAddress:
 *                       type: string
 *                       example: "0x2eCBC6f229feD06044CDb0dD772437a30190CD50"
 *                     chainId:
 *                       type: integer
 *                       example: 8453
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-01T00:30:00.000Z"
 *                       description: Execution state expires after 30 minutes
 *                     nextStep:
 *                       type: string
 *                       example: "Execute Phase 1 transactions on-chain, then call /phased/continue/:executionId"
 *             examples:
 *               phase1Response:
 *                 summary: Successful Phase 1 initialization
 *                 value:
 *                   success: true
 *                   executionId: "550e8400-e29b-41d4-a716-446655440000"
 *                   phase: 1
 *                   transactions:
 *                     - to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
 *                       data: "0x095ea7b3..."
 *                       value: "0"
 *                       gasLimit: "60000"
 *                       description: "Approve USDC for 1inch Router"
 *                     - to: "0x1111111254EEB25477B68fb85Ed929f73A960582"
 *                       data: "0x12aa3caf..."
 *                       value: "0"
 *                       gasLimit: "250000"
 *                       description: "Swap 700 USDC to USDC for Aave"
 *                   metadata:
 *                     totalStrategies: 1
 *                     totalProtocols: 3
 *                     swapCount: 2
 *                     userAddress: "0x2eCBC6f229feD06044CDb0dD772437a30190CD50"
 *                     chainId: 8453
 *                     expiresAt: "2024-01-01T00:30:00.000Z"
 *                     nextStep: "Execute Phase 1 transactions on-chain, then call /phased/continue/:executionId"
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "VALIDATION_ERROR"
 *                     message:
 *                       type: string
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/api/v1/intents/unified-zap/phased/init',
  validateIntentRequest,
  async (req, res) => {
    try {
      const PhasedZapController = require('../controllers/PhasedZapController');
      await PhasedZapController.initializePhase1(req, res);
    } catch (error) {
      console.error('Error loading PhasedZapController:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to initialize phased execution',
        },
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/intents/unified-zap/phased/continue/{executionId}:
 *   post:
 *     tags:
 *       - Phased Execution
 *     summary: Continue to Phase 2 of phased UnifiedZap execution
 *     description: |
 *       Queries actual on-chain balances via Moralis and generates Phase 2 transactions
 *       (deposits and stakes) using the actual token amounts from completed swaps.
 *
 *       **Prerequisites:**
 *       - All Phase 1 swap transactions must be confirmed on-chain
 *       - ExecutionId must be valid and not expired (30-minute TTL)
 *
 *       **Process:**
 *       1. Validates executionId and retrieves stored execution context
 *       2. Queries actual token balances via Moralis API
 *       3. Validates balances are non-zero
 *       4. Generates deposit/approval transactions with actual amounts
 *       5. Returns Phase 2 transactions ready for execution
 *     parameters:
 *       - in: path
 *         name: executionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *         description: Execution ID from Phase 1 initialization
 *     responses:
 *       200:
 *         description: Phase 2 transactions generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, executionId, phase, transactions, actualBalances, metadata]
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 executionId:
 *                   type: string
 *                   format: uuid
 *                   example: "550e8400-e29b-41d4-a716-446655440000"
 *                 phase:
 *                   type: integer
 *                   example: 2
 *                 transactions:
 *                   type: array
 *                   description: Phase 2 deposit/approval transactions
 *                   items:
 *                     type: object
 *                     properties:
 *                       to:
 *                         type: string
 *                       data:
 *                         type: string
 *                       value:
 *                         type: string
 *                       gasLimit:
 *                         type: string
 *                       description:
 *                         type: string
 *                 actualBalances:
 *                   type: object
 *                   description: Actual on-chain balances queried from Moralis
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       raw:
 *                         type: string
 *                         example: "699850000"
 *                         description: Raw balance in smallest unit
 *                       formatted:
 *                         type: string
 *                         example: "699.85"
 *                         description: Human-readable balance
 *                       decimals:
 *                         type: integer
 *                         example: 6
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     totalProtocols:
 *                       type: integer
 *                     depositCount:
 *                       type: integer
 *                     balanceQueryTime:
 *                       type: string
 *                       format: date-time
 *             examples:
 *               phase2Response:
 *                 summary: Successful Phase 2 continuation
 *                 value:
 *                   success: true
 *                   executionId: "550e8400-e29b-41d4-a716-446655440000"
 *                   phase: 2
 *                   transactions:
 *                     - to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
 *                       data: "0x095ea7b3..."
 *                       value: "0"
 *                       gasLimit: "60000"
 *                       description: "Approve 699.85 USDC for Aave Pool"
 *                     - to: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"
 *                       data: "0xe8eda9df..."
 *                       value: "0"
 *                       gasLimit: "300000"
 *                       description: "Supply 699.85 USDC to Aave"
 *                   actualBalances:
 *                     "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913":
 *                       raw: "699850000"
 *                       formatted: "699.85"
 *                       decimals: 6
 *                   metadata:
 *                     totalProtocols: 3
 *                     depositCount: 3
 *                     balanceQueryTime: "2024-01-01T00:05:30.000Z"
 *       400:
 *         description: Invalid executionId or execution context
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "INVALID_EXECUTION_ID"
 *                     message:
 *                       type: string
 *                       example: "Execution not found or expired"
 *       404:
 *         description: Execution not found or expired (30-minute TTL)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "EXECUTION_NOT_FOUND"
 *                     message:
 *                       type: string
 *                       example: "Execution 550e8400-e29b-41d4-a716-446655440000 not found or expired (TTL: 30 minutes)"
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/api/v1/intents/unified-zap/phased/continue/:executionId',
  async (req, res) => {
    try {
      const PhasedZapController = require('../controllers/PhasedZapController');
      await PhasedZapController.continueToPhase2(req, res);
    } catch (error) {
      console.error('Error loading PhasedZapController:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to continue phased execution',
        },
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/intents/unified-zap/phased/status/{executionId}:
 *   get:
 *     tags:
 *       - Phased Execution
 *     summary: Get status of phased execution
 *     description: |
 *       Retrieves the current status and metadata of a phased execution.
 *       Useful for debugging and tracking execution state.
 *
 *       **Returns:**
 *       - Current phase (1 or 2)
 *       - Execution status (pending, completed, failed)
 *       - Timestamps (created, expires)
 *       - User address and chain ID
 *       - Token addresses being tracked
 *     parameters:
 *       - in: path
 *         name: executionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *         description: Execution ID to query
 *     responses:
 *       200:
 *         description: Execution status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, executionId, phase, status, metadata]
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 executionId:
 *                   type: string
 *                   format: uuid
 *                   example: "550e8400-e29b-41d4-a716-446655440000"
 *                 phase:
 *                   type: integer
 *                   example: 1
 *                   description: Current phase (1 or 2)
 *                 status:
 *                   type: string
 *                   enum: [pending, completed, failed]
 *                   example: "pending"
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     userAddress:
 *                       type: string
 *                       example: "0x2eCBC6f229feD06044CDb0dD772437a30190CD50"
 *                     chainId:
 *                       type: string
 *                       example: "8453"
 *                     swapTokenAddresses:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"]
 *                       description: Token addresses to query after Phase 1
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-01T00:00:00.000Z"
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-01T00:30:00.000Z"
 *                     actualBalances:
 *                       type: object
 *                       description: Only present if Phase 2 was started
 *             examples:
 *               statusResponse:
 *                 summary: Phase 1 pending status
 *                 value:
 *                   success: true
 *                   executionId: "550e8400-e29b-41d4-a716-446655440000"
 *                   phase: 1
 *                   status: "pending"
 *                   metadata:
 *                     userAddress: "0x2eCBC6f229feD06044CDb0dD772437a30190CD50"
 *                     chainId: "8453"
 *                     swapTokenAddresses: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"]
 *                     createdAt: "2024-01-01T00:00:00.000Z"
 *                     expiresAt: "2024-01-01T00:30:00.000Z"
 *       404:
 *         description: Execution not found or expired
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "EXECUTION_NOT_FOUND"
 *                     message:
 *                       type: string
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/api/v1/intents/unified-zap/phased/status/:executionId',
  async (req, res) => {
    try {
      const PhasedZapController = require('../controllers/PhasedZapController');
      await PhasedZapController.getStatus(req, res);
    } catch (error) {
      console.error('Error loading PhasedZapController:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve execution status',
        },
      });
    }
  }
);

module.exports = router;
