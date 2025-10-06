const express = require('express');
const BalanceController = require('../controllers/balanceController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Balances
 *   description: Token balance management with Moralis API integration
 */

/**
 * @swagger
 * /balances/chains:
 *   get:
 *     summary: Get supported chain IDs
 *     tags: [Balances]
 *     responses:
 *       200:
 *         description: List of supported chains
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     chains:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["1", "137", "56", "42161", "10", "8453", "43114"]
 *                     count:
 *                       type: integer
 */
router.get('/chains', BalanceController.getSupportedChains);

/**
 * @swagger
 * /balances/cache/stats:
 *   get:
 *     summary: Get cache statistics
 *     tags: [Balances]
 *     responses:
 *       200:
 *         description: Cache statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     hits:
 *                       type: integer
 *                     misses:
 *                       type: integer
 *                     sets:
 *                       type: integer
 *                     evictions:
 *                       type: integer
 *                     size:
 *                       type: integer
 *                     hitRate:
 *                       type: string
 *                     memoryUsage:
 *                       type: string
 */
router.get('/cache/stats', BalanceController.getCacheStats);

/**
 * @swagger
 * /balances/cache:
 *   delete:
 *     summary: Clear cache entries
 *     tags: [Balances]
 *     parameters:
 *       - in: query
 *         name: address
 *         schema:
 *           type: string
 *         description: Wallet address to clear cache for
 *       - in: query
 *         name: chainId
 *         schema:
 *           type: string
 *         description: Chain ID to clear cache for
 *     responses:
 *       200:
 *         description: Cache cleared successfully
 *       400:
 *         description: Invalid input - address or chainId required
 */
router.delete('/cache', BalanceController.clearCache);

/**
 * @swagger
 * /balances/{chainId}/{address}:
 *   get:
 *     summary: Get ERC20 token balances for an address
 *     tags: [Balances]
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chain ID (e.g., 1 for Ethereum, 8453 for Base)
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: Wallet address (0x...)
 *       - in: query
 *         name: tokens
 *         schema:
 *           type: string
 *         description: Comma-separated token addresses to filter
 *         example: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,0x6B175474E89094C44Da98b954EedeAC495271d0F"
 *       - in: query
 *         name: skipCache
 *         schema:
 *           type: boolean
 *         description: Skip cache lookup and fetch fresh data
 *     responses:
 *       200:
 *         description: Token balances retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                     chainId:
 *                       type: string
 *                     balances:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           tokenAddress:
 *                             type: string
 *                           name:
 *                             type: string
 *                           symbol:
 *                             type: string
 *                           decimals:
 *                             type: integer
 *                           balance:
 *                             type: string
 *                           balanceFormatted:
 *                             type: string
 *                           logo:
 *                             type: string
 *                           thumbnail:
 *                             type: string
 *                           possibleSpam:
 *                             type: boolean
 *                           verifiedContract:
 *                             type: boolean
 *                     totalTokens:
 *                       type: integer
 *                     timestamp:
 *                       type: integer
 *                 cached:
 *                   type: boolean
 *       400:
 *         description: Invalid input parameters
 *       503:
 *         description: Service unavailable or rate limited
 */
router.get('/:chainId/:address', BalanceController.getBalances);

/**
 * @swagger
 * /balances/{chainId}/{address}/native:
 *   get:
 *     summary: Get native token balance (ETH, MATIC, etc.)
 *     tags: [Balances]
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chain ID
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: Wallet address (0x...)
 *     responses:
 *       200:
 *         description: Native balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                     chainId:
 *                       type: string
 *                     balance:
 *                       type: string
 *                     balanceFormatted:
 *                       type: string
 *                     timestamp:
 *                       type: integer
 *       400:
 *         description: Invalid input parameters
 *       503:
 *         description: Service unavailable
 */
router.get('/:chainId/:address/native', BalanceController.getNativeBalance);

module.exports = router;
