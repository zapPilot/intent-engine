const { body, param, query, validationResult } = require('express-validator');

const validateIntentRequest = [
  body('userAddress')
    .isEthereumAddress()
    .withMessage('Invalid userAddress: must be a valid Ethereum address'),
  body('chainId')
    .isInt({ gt: 0 })
    .withMessage('Invalid chainId: must be a positive integer'),
  body('params').isObject().withMessage('params object is required'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: errors.array()[0].msg,
          details: {
            field: errors.array()[0].param,
            value: errors.array()[0].value,
          },
        },
      });
    }
    next();
  },
];

/**
 * Validate balance request parameters
 * Route: GET /api/v1/balances/:chainId/:address
 */
const validateBalanceRequest = [
  param('chainId')
    .isInt({ gt: 0 })
    .withMessage('Invalid chainId: must be a positive integer'),
  param('address')
    .exists()
    .withMessage('Invalid address: must be a valid Ethereum address')
    .bail()
    .isString()
    .withMessage('Invalid address: must be a valid Ethereum address')
    .matches(/^0[xX][a-fA-F0-9]{40}$/)
    .withMessage('Invalid address: must be a valid Ethereum address')
    .customSanitizer(value => value.toLowerCase()),
  query('tokens')
    .optional()
    .isString()
    .custom(value => {
      // Validate comma-separated Ethereum addresses
      const addresses = value
        .split(',')
        .map(addr => addr.trim())
        .filter(Boolean);
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;

      for (const addr of addresses) {
        if (addr.toLowerCase() === 'native') {
          continue;
        }
        if (!addressRegex.test(addr)) {
          throw new Error(`Invalid token address: ${addr}`);
        }
      }
      return true;
    }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: errors.array()[0].msg,
          details: {
            field: errors.array()[0].param,
            value: errors.array()[0].value,
          },
        },
      });
    }
    next();
  },
];

module.exports = {
  validateIntentRequest,
  validateBalanceRequest,
};
