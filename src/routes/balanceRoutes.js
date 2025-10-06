const express = require('express');
const BalanceController = require('../controllers/balanceController');
const { validateBalanceRequest } = require('../middleware/requestValidator');
const { balanceRateLimit } = require('../middleware/rateLimiter');

const router = express.Router();

/**
 * @swagger
 * /api/v1/balances/{chainId}/{address}:
 *   get:
 *     tags:
 *       - Balances
 *     summary: Get token balances for an address
 *     description: |
 *       Retrieves token balances for a specific wallet address on a given blockchain.
 *       Results are cached to improve performance and reduce RPC calls.
 *       Rate limited to 100 requests per minute per client.
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           example: 8453
 *         description: Chain ID (1=Ethereum, 8453=Base, 42161=Arbitrum, etc.)
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *           example: "0x2eCBC6f229feD06044CDb0dD772437a30190CD50"
 *         description: Wallet address (checksummed or lowercase)
 *       - in: query
 *         name: tokens
 *         required: false
 *         schema:
 *           type: string
 *           example: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,0x4200000000000000000000000000000000000006"
 *         description: Optional comma-separated list of token contract addresses to query. If omitted, queries all known tokens for the chain.
 *     responses:
 *       200:
 *         description: Token balances retrieved successfully
 *         headers:
 *           X-RateLimit-Limit:
 *             schema:
 *               type: integer
 *               example: 100
 *             description: Maximum requests allowed per window
 *           X-RateLimit-Remaining:
 *             schema:
 *               type: integer
 *               example: 95
 *             description: Remaining requests in current window
 *           X-RateLimit-Reset:
 *             schema:
 *               type: integer
 *               example: 1640995260
 *             description: Unix timestamp when the rate limit resets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [chainId, address, balances, cached, timestamp, ttl]
 *               properties:
 *                 chainId:
 *                   type: integer
 *                   example: 8453
 *                   description: Chain ID
 *                 address:
 *                   type: string
 *                   example: "0x2ecbc6f229fed06044cdb0dd772437a30190cd50"
 *                   description: Wallet address (normalized to lowercase)
 *                 balances:
 *                   type: array
 *                   description: Array of token balance objects
 *                   items:
 *                     type: object
 *                     required: [token, symbol, decimals, balance, balanceFormatted]
 *                     properties:
 *                       token:
 *                         type: string
 *                         example: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
 *                         description: Token contract address
 *                       symbol:
 *                         type: string
 *                         example: "USDC"
 *                         description: Token symbol
 *                       decimals:
 *                         type: integer
 *                         example: 6
 *                         description: Token decimals
 *                       balance:
 *                         type: string
 *                         example: "1000000000"
 *                         description: Raw balance (wei/smallest unit)
 *                       balanceFormatted:
 *                         type: string
 *                         example: "1000.0"
 *                         description: Human-readable balance
 *                       price:
 *                         type: number
 *                         example: 0.9998
 *                         description: Token price in USD (if available)
 *                       valueUsd:
 *                         type: number
 *                         example: 999.8
 *                         description: Balance value in USD (if price available)
 *                 cached:
 *                   type: boolean
 *                   example: true
 *                   description: Whether the response was served from cache
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-01T00:00:00.000Z"
 *                   description: Timestamp when data was fetched
 *                 ttl:
 *                   type: integer
 *                   example: 30
 *                   description: Time-to-live in seconds before cache expires
 *             examples:
 *               successResponse:
 *                 summary: Successful balance query
 *                 value:
 *                   chainId: 8453
 *                   address: "0x2ecbc6f229fed06044cdb0dd772437a30190cd50"
 *                   balances:
 *                     - token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
 *                       symbol: "USDC"
 *                       decimals: 6
 *                       balance: "1000000000"
 *                       balanceFormatted: "1000.0"
 *                       price: 0.9998
 *                       valueUsd: 999.8
 *                     - token: "0x4200000000000000000000000000000000000006"
 *                       symbol: "WETH"
 *                       decimals: 18
 *                       balance: "500000000000000000"
 *                       balanceFormatted: "0.5"
 *                       price: 3500.0
 *                       valueUsd: 1750.0
 *                   cached: false
 *                   timestamp: "2024-01-01T00:00:00.000Z"
 *                   ttl: 30
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
 *                       example: "INVALID_INPUT"
 *                     message:
 *                       type: string
 *                       example: "Invalid chainId: must be a positive integer"
 *                     details:
 *                       type: object
 *       429:
 *         description: Rate limit exceeded
 *         headers:
 *           Retry-After:
 *             schema:
 *               type: integer
 *               example: 30
 *             description: Seconds to wait before retrying
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
 *                       example: "RATE_LIMIT_EXCEEDED"
 *                     message:
 *                       type: string
 *                       example: "Too many requests, please try again later"
 *                     details:
 *                       type: object
 *                       properties:
 *                         limit:
 *                           type: integer
 *                           example: 100
 *                         windowMs:
 *                           type: integer
 *                           example: 60000
 *                         retryAfter:
 *                           type: integer
 *                           example: 30
 *       503:
 *         description: RPC provider or external service unavailable
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
 *                       example: "RPC_ERROR"
 *                     message:
 *                       type: string
 *                       example: "RPC provider unavailable"
 *       500:
 *         description: Internal server error
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
 *                       example: "INTERNAL_SERVER_ERROR"
 *                     message:
 *                       type: string
 */
router.get(
  '/api/v1/balances/:chainId/:address',
  balanceRateLimit,
  validateBalanceRequest,
  BalanceController.getBalances
);

module.exports = router;
