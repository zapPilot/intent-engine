const express = require('express');
const SwapService = require('../services/swapService');
const PriceService = require('../services/priceService');
const {
  swapQuoteValidation,
  bulkPricesValidation,
  handleValidationErrors,
  validateTokenAddresses,
} = require('../utils/validation');

const router = express.Router();
const swapService = new SwapService();
const priceService = new PriceService();

/**
 * @swagger
 * /swap/quote:
 *   get:
 *     tags:
 *       - Swaps
 *     summary: Get optimal swap quote
 *     description: Automatically finds the second-best swap route across multiple DEX aggregators (1inch, Paraswap, 0x Protocol) considering both output value and gas costs. Uses intelligent fallback logic and returns comprehensive quote data.
 *     parameters:
 *       - in: query
 *         name: chainId
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/ChainId'
 *         description: Blockchain network ID
 *       - in: query
 *         name: fromTokenAddress
 *         required: true
 *         schema:
 *           type: string
 *           example: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
 *         description: Source token contract address
 *       - in: query
 *         name: fromTokenDecimals
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 18
 *           example: 18
 *         description: Source token decimals
 *       - in: query
 *         name: toTokenAddress
 *         required: true
 *         schema:
 *           type: string
 *           example: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
 *         description: Destination token contract address
 *       - in: query
 *         name: toTokenDecimals
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 18
 *           example: 6
 *         description: Destination token decimals
 *       - in: query
 *         name: amount
 *         required: true
 *         schema:
 *           type: string
 *           example: "1000000000000000000"
 *         description: Amount to swap in smallest token unit (wei)
 *       - in: query
 *         name: fromAddress
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/EthereumAddress'
 *         description: User's wallet address
 *       - in: query
 *         name: slippage
 *         required: true
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *           example: 1
 *         description: Slippage tolerance percentage
 *       - in: query
 *         name: to_token_price
 *         required: true
 *         schema:
 *           type: number
 *           example: 1000
 *         description: Destination token price in USD
 *       - in: query
 *         name: eth_price
 *         required: false
 *         schema:
 *           type: number
 *           example: 3000
 *           default: 1000
 *         description: ETH price in USD for gas cost calculations
 *     responses:
 *       200:
 *         description: Successful swap quote retrieved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SwapQuoteResponse'
 *             examples:
 *               swapQuote:
 *                 summary: Successful swap quote
 *                 value:
 *                   approve_to: "0x1111111254EEB25477B68fb85Ed929f73A960582"
 *                   to: "0x1111111254EEB25477B68fb85Ed929f73A960582"
 *                   toAmount: "1000000000"
 *                   minToAmount: "990000000"
 *                   data: "0x0502b1c5..."
 *                   gasCostUSD: 25.5
 *                   gas: "200000"
 *                   custom_slippage: 100
 *                   toUsd: 974.5
 *                   provider: "1inch"
 *                   allQuotes:
 *                     - provider: "1inch"
 *                       toUsd: 974.5
 *                       gasCostUSD: 25.5
 *                       toAmount: "1000000000"
 *                     - provider: "paraswap"
 *                       toUsd: 970.2
 *                       gasCostUSD: 29.8
 *                       toAmount: "995000000"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/swap/quote',
  swapQuoteValidation,
  handleValidationErrors,
  validateTokenAddresses,
  async (req, res, next) => {
    try {
      const {
        chainId,
        fromTokenAddress,
        fromTokenDecimals,
        toTokenAddress,
        toTokenDecimals,
        amount,
        fromAddress,
        slippage,
        eth_price,
        to_token_price,
      } = req.query;

      const swapParams = {
        chainId,
        fromTokenAddress,
        fromTokenDecimals: parseInt(fromTokenDecimals),
        toTokenAddress,
        toTokenDecimals: parseInt(toTokenDecimals),
        amount,
        fromAddress,
        slippage: parseFloat(slippage),
        eth_price,
        toTokenPrice: parseFloat(to_token_price),
      };

      const bestQuote = await swapService.getSecondBestSwapQuote(swapParams);

      res.json(bestQuote);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /swap/providers:
 *   get:
 *     tags:
 *       - Swaps
 *     summary: Get supported DEX providers
 *     description: Returns a list of all supported DEX aggregator providers available for swap operations
 *     responses:
 *       200:
 *         description: List of supported providers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [providers]
 *               properties:
 *                 providers:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["1inch", "paraswap", "0x"]
 *             examples:
 *               providersList:
 *                 summary: Supported DEX providers
 *                 value:
 *                   providers: ["1inch", "paraswap", "0x"]
 */
router.get('/swap/providers', (req, res) => {
  const providers = swapService.getSupportedProviders();
  res.json({ providers });
});

/**
 * @swagger
 * /tokens/prices:
 *   get:
 *     tags:
 *       - Prices
 *     summary: Get bulk token prices
 *     description: Get prices for multiple tokens with intelligent fallback across price providers (CoinMarketCap, CoinGecko). Includes comprehensive caching, rate limiting, and metadata.
 *     parameters:
 *       - in: query
 *         name: tokens
 *         required: true
 *         schema:
 *           type: string
 *           example: "btc,eth,usdc"
 *         description: Comma-separated list of token symbols
 *       - in: query
 *         name: useCache
 *         required: false
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *           default: "true"
 *         description: Whether to use cached prices
 *       - in: query
 *         name: timeout
 *         required: false
 *         schema:
 *           type: string
 *           example: "5000"
 *           default: "5000"
 *         description: Request timeout in milliseconds
 *     responses:
 *       200:
 *         description: Token prices retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TokenPricesResponse'
 *             examples:
 *               bulkPrices:
 *                 summary: Successful bulk price response
 *                 value:
 *                   results:
 *                     btc:
 *                       success: true
 *                       price: 45000.5
 *                       symbol: "btc"
 *                       provider: "coinmarketcap"
 *                       timestamp: "2024-01-01T00:00:00.000Z"
 *                       fromCache: false
 *                       metadata:
 *                         tokenId: "1"
 *                         marketCap: 850000000000
 *                         volume24h: 25000000000
 *                         percentChange24h: 2.5
 *                     eth:
 *                       success: true
 *                       price: 2800.25
 *                       symbol: "eth"
 *                       provider: "coinmarketcap"
 *                       timestamp: "2024-01-01T00:00:00.000Z"
 *                       fromCache: false
 *                   errors: []
 *                   totalRequested: 2
 *                   fromCache: 0
 *                   fromProviders: 2
 *                   failed: 0
 *                   timestamp: "2024-01-01T00:00:00.000Z"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/tokens/prices',
  bulkPricesValidation,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { tokens, useCache = 'true', timeout = '5000' } = req.query;

      // Parse comma-separated tokens and clean up whitespace
      const tokenSymbols = tokens
        .split(',')
        .map(token => token.trim())
        .filter(token => token);
      const options = {
        useCache: useCache === 'true',
        timeout: parseInt(timeout),
      };

      const result = await priceService.getBulkPrices(tokenSymbols, options);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /tokens/price/{symbol}:
 *   get:
 *     tags:
 *       - Prices
 *     summary: Get single token price
 *     description: Get price for a single token with intelligent fallback across price providers
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *           example: "btc"
 *         description: Token symbol (e.g. btc, eth, usdc)
 *       - in: query
 *         name: useCache
 *         required: false
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *           default: "true"
 *         description: Whether to use cached prices
 *       - in: query
 *         name: timeout
 *         required: false
 *         schema:
 *           type: string
 *           example: "5000"
 *           default: "5000"
 *         description: Request timeout in milliseconds
 *     responses:
 *       200:
 *         description: Token price retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 price:
 *                   type: number
 *                   example: 45000.5
 *                 symbol:
 *                   type: string
 *                   example: "btc"
 *                 provider:
 *                   type: string
 *                   example: "coinmarketcap"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 fromCache:
 *                   type: boolean
 *                   example: false
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     tokenId:
 *                       type: string
 *                     marketCap:
 *                       type: number
 *                     volume24h:
 *                       type: number
 *                     percentChange24h:
 *                       type: number
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/tokens/price/:symbol', async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const { useCache = 'true', timeout = '5000' } = req.query;

    const options = {
      useCache: useCache === 'true',
      timeout: parseInt(timeout),
    };

    const result = await priceService.getPrice(symbol, options);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /tokens/providers:
 *   get:
 *     tags:
 *       - Prices
 *     summary: Get price provider status
 *     description: Returns detailed information about supported price providers, their status, and current rate limiting state
 *     responses:
 *       200:
 *         description: Price provider information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [providers, status, rateLimits]
 *               properties:
 *                 providers:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["coinmarketcap", "coingecko"]
 *                 status:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       available:
 *                         type: boolean
 *                       apiKeysCount:
 *                         type: integer
 *                       currentKeyIndex:
 *                         type: integer
 *                       requiresApiKey:
 *                         type: boolean
 *                 rateLimits:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       tokens:
 *                         type: integer
 *                       capacity:
 *                         type: integer
 *                       rate:
 *                         type: number
 *             examples:
 *               providerStatus:
 *                 summary: Price provider status
 *                 value:
 *                   providers: ["coinmarketcap", "coingecko"]
 *                   status:
 *                     coinmarketcap:
 *                       name: "coinmarketcap"
 *                       available: true
 *                       apiKeysCount: 2
 *                       currentKeyIndex: 0
 *                     coingecko:
 *                       name: "coingecko"
 *                       available: true
 *                       requiresApiKey: false
 *                   rateLimits:
 *                     coinmarketcap:
 *                       tokens: 25
 *                       capacity: 30
 *                       rate: 0.5
 *                     coingecko:
 *                       tokens: 95
 *                       capacity: 100
 *                       rate: 1.67
 */
router.get('/tokens/providers', (req, res) => {
  const providers = priceService.getSupportedProviders();
  const status = priceService.getStatus();
  res.json({
    providers,
    status: status.providers,
    rateLimits: status.rateLimits,
  });
});

/**
 * @swagger
 * /health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Basic health check
 *     description: Simple health check endpoint to verify API is running
 *     responses:
 *       200:
 *         description: API is healthy and operational
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *             examples:
 *               healthCheck:
 *                 summary: Healthy response
 *                 value:
 *                   status: "healthy"
 *                   timestamp: "2024-01-01T00:00:00.000Z"
 */
router.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

module.exports = router;
