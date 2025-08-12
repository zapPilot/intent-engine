const { body, validationResult } = require('express-validator');

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

module.exports = {
  validateIntentRequest,
};
