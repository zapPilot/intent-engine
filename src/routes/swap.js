const express = require('express');
const SwapService = require('../services/swapService');
const PriceService = require('../services/priceService');
const { 
  swapQuoteValidation,
  swapDataValidation,
  bulkPricesValidation,
  handleValidationErrors, 
  validateTokenAddresses 
} = require('../utils/validation');

const router = express.Router();
const swapService = new SwapService();
const priceService = new PriceService();

/**
 * GET /swap/quote
 * Get the best swap quote from all available DEX aggregators
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

      const bestQuote = await swapService.getBestSwapQuote(swapParams);
      
      res.json(bestQuote);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /supported_providers
 * Get list of supported DEX aggregator providers
 */
router.get('/swap/providers', (req, res) => {
  const providers = swapService.getSupportedProviders();
  res.json({ providers });
});

/**
 * GET /tokens/prices
 * Get bulk token prices from multiple providers with fallback logic
 */
router.get(
  '/tokens/prices',
  bulkPricesValidation,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const {
        tokens,
        useCache = 'true',
        timeout = '5000',
      } = req.query;

      // Parse comma-separated tokens and clean up whitespace
      const tokenSymbols = tokens.split(',').map(token => token.trim()).filter(token => token);
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
 * GET /tokens/price/:symbol
 * Get price for a single token
 */
router.get(
  '/tokens/price/:symbol',
  async (req, res, next) => {
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
  }
);

/**
 * GET /tokens/providers
 * Get list of supported price providers
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
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

module.exports = router;