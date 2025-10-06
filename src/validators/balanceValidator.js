/**
 * Balance Endpoint Validation Middleware
 *
 * Validates:
 * - chainId: Must be one of the supported chains (1, 137, 42161, 8453, 10)
 * - wallet: Must be a valid Ethereum address
 * - tokens: Optional array of valid token addresses
 *
 * Uses express-validator for validation rules.
 */

const { query, validationResult } = require('express-validator');
const { isAddress } = require('ethers');

/**
 * Supported blockchain networks
 */
const SUPPORTED_CHAINS = {
  1: 'Ethereum Mainnet',
  10: 'Optimism',
  137: 'Polygon',
  8453: 'Base',
  42161: 'Arbitrum One',
};

const SUPPORTED_CHAIN_IDS = Object.keys(SUPPORTED_CHAINS).map(Number);

/**
 * Custom validator: Check if value is a valid Ethereum address
 */
const isValidAddress = value => {
  if (!value) {
    return false;
  }
  try {
    return isAddress(value);
  } catch {
    return false;
  }
};

/**
 * Custom validator: Check if all items in comma-separated list are valid addresses
 */
const areValidAddresses = value => {
  if (!value) {
    return true; // Optional field
  }

  const addresses = value
    .split(',')
    .map(addr => addr.trim())
    .filter(Boolean);

  if (addresses.length === 0) {
    return true;
  }
  if (addresses.length > 50) {
    return false; // Prevent abuse with too many tokens
  }

  return addresses.every(isValidAddress);
};

/**
 * Validation rules for balance endpoint
 */
const balanceValidationRules = [
  query('chainId')
    .exists()
    .withMessage('chainId is required')
    .isInt()
    .withMessage('chainId must be an integer')
    .toInt()
    .custom(value => SUPPORTED_CHAIN_IDS.includes(value))
    .withMessage(
      `chainId must be one of: ${SUPPORTED_CHAIN_IDS.join(', ')} (${Object.entries(
        SUPPORTED_CHAINS
      )
        .map(([id, name]) => `${id}=${name}`)
        .join(', ')})`
    ),

  query('wallet')
    .exists()
    .withMessage('wallet address is required')
    .trim()
    .notEmpty()
    .withMessage('wallet address cannot be empty')
    .custom(isValidAddress)
    .withMessage('wallet must be a valid Ethereum address (0x... format)')
    .customSanitizer(value => value.toLowerCase()),

  query('tokens')
    .optional()
    .trim()
    .custom(areValidAddresses)
    .withMessage(
      'tokens must be a comma-separated list of valid Ethereum addresses (max 50 tokens)'
    )
    .customSanitizer(value => {
      if (!value) {
        return undefined;
      }
      // Normalize to lowercase array
      return value
        .split(',')
        .map(addr => addr.trim().toLowerCase())
        .filter(Boolean);
    }),
];

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value,
    }));

    return res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid request parameters',
      errors: formattedErrors,
      details: {
        supportedChains: SUPPORTED_CHAINS,
        example: {
          chainId: 1,
          wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
          tokens:
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,0xdAC17F958D2ee523a2206206994597C13D831ec7',
        },
      },
    });
  }

  next();
};

/**
 * Combined validation middleware for balance endpoint
 *
 * Usage:
 *   router.get('/balance', balanceRateLimit, balanceValidator, getBalance);
 *
 * Query Parameters:
 *   - chainId: number (required) - One of 1, 10, 137, 8453, 42161
 *   - wallet: string (required) - Valid Ethereum address
 *   - tokens: string (optional) - Comma-separated list of token addresses
 *
 * Example:
 *   GET /balance?chainId=1&wallet=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb&tokens=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
 */
const balanceValidator = [...balanceValidationRules, handleValidationErrors];

module.exports = balanceValidator;

// Export for testing and reuse
module.exports.balanceValidationRules = balanceValidationRules;
module.exports.handleValidationErrors = handleValidationErrors;
module.exports.SUPPORTED_CHAINS = SUPPORTED_CHAINS;
module.exports.SUPPORTED_CHAIN_IDS = SUPPORTED_CHAIN_IDS;
module.exports.isValidAddress = isValidAddress;
module.exports.areValidAddresses = areValidAddresses;
