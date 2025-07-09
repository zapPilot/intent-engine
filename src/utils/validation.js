const { body, query, validationResult } = require('express-validator');

/**
 * Validation rules for swap quote endpoint (aggregates all providers)
 */
const swapQuoteValidation = [
  query('chainId')
    .notEmpty()
    .withMessage('chainId is required')
    .isString()
    .withMessage('chainId must be a string'),
  
  query('fromTokenAddress')
    .notEmpty()
    .withMessage('fromTokenAddress is required')
    .isString()
    .withMessage('fromTokenAddress must be a string'),
  
  query('fromTokenDecimals')
    .notEmpty()
    .withMessage('fromTokenDecimals is required')
    .isInt({ min: 0, max: 18 })
    .withMessage('fromTokenDecimals must be an integer between 0 and 18'),
  
  query('toTokenAddress')
    .notEmpty()
    .withMessage('toTokenAddress is required')
    .isString()
    .withMessage('toTokenAddress must be a string'),
  
  query('toTokenDecimals')
    .notEmpty()
    .withMessage('toTokenDecimals is required')
    .isInt({ min: 0, max: 18 })
    .withMessage('toTokenDecimals must be an integer between 0 and 18'),
  
  query('amount')
    .notEmpty()
    .withMessage('amount is required')
    .isString()
    .withMessage('amount must be a string'),
  
  query('fromAddress')
    .notEmpty()
    .withMessage('fromAddress is required')
    .isString()
    .withMessage('fromAddress must be a string'),
  
  query('slippage')
    .notEmpty()
    .withMessage('slippage is required')
    .isFloat({ min: 0, max: 100 })
    .withMessage('slippage must be a number between 0 and 100'),
  
  query('eth_price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('eth_price must be a positive number'),
  
  query('to_token_price')
    .notEmpty()
    .withMessage('to_token_price is required')
    .isFloat({ min: 0 })
    .withMessage('to_token_price must be a positive number'),
];

/**
 * Validation rules for swap data endpoint with specific provider
 */
const swapDataValidation = [
  ...swapQuoteValidation,
  query('provider')
    .notEmpty()
    .withMessage('provider is required')
    .isIn(['1inch', 'paraswap', '0x'])
    .withMessage('provider must be one of: 1inch, paraswap, 0x'),
];

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  next();
};

/**
 * Validate that fromTokenAddress and toTokenAddress are different
 */
const validateTokenAddresses = (req, res, next) => {
  const { fromTokenAddress, toTokenAddress } = req.query;
  
  if (fromTokenAddress.toLowerCase() === toTokenAddress.toLowerCase()) {
    return res.status(400).json({
      error: 'fromTokenAddress and toTokenAddress cannot be the same',
    });
  }
  
  next();
};

module.exports = {
  swapQuoteValidation,
  swapDataValidation,
  handleValidationErrors,
  validateTokenAddresses,
};