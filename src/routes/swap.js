const express = require('express');
const SwapService = require('../services/swapService');
const { 
  swapQuoteValidation,
  swapDataValidation, 
  handleValidationErrors, 
  validateTokenAddresses 
} = require('../utils/validation');

const router = express.Router();
const swapService = new SwapService();

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
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

module.exports = router;