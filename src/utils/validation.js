const respondWithErrors = (res, errors) =>
  res.status(400).json({
    error: 'Validation failed',
    details: errors,
  });

const isNonEmptyString = value =>
  typeof value === 'string' && value.trim() !== '';

const ensureFloatInRange = (value, { min, max, message }) => {
  if (!isNonEmptyString(value) && typeof value !== 'number') {
    return { valid: false, parsed: null, error: message };
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(parsed)) {
    return { valid: false, parsed: null, error: message };
  }

  if (min !== undefined && parsed < min) {
    return { valid: false, parsed: null, error: message };
  }
  if (max !== undefined && parsed > max) {
    return { valid: false, parsed: null, error: message };
  }

  return { valid: true, parsed };
};

const ensureIntInRange = (value, { min, max, message }) => {
  if (!isNonEmptyString(value) && typeof value !== 'number') {
    return { valid: false, parsed: null, error: message };
  }

  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return { valid: false, parsed: null, error: message };
  }

  if (min !== undefined && parsed < min) {
    return { valid: false, parsed: null, error: message };
  }

  if (max !== undefined && parsed > max) {
    return { valid: false, parsed: null, error: message };
  }

  return { valid: true, parsed };
};

const sanitizeString = value =>
  typeof value === 'string' ? value.trim() : value;

const swapQuoteValidation = (req, res, next) => {
  const { query } = req;
  const errors = [];

  const requiredStringFields = [
    ['chainId', 'chainId is required'],
    ['fromTokenAddress', 'fromTokenAddress is required'],
    ['toTokenAddress', 'toTokenAddress is required'],
    ['amount', 'amount is required'],
    ['fromAddress', 'fromAddress is required'],
    ['to_token_price', 'to_token_price is required'],
  ];

  requiredStringFields.forEach(([field, message]) => {
    if (!isNonEmptyString(query[field])) {
      errors.push({ field, msg: message, value: query[field] });
    } else {
      query[field] = sanitizeString(query[field]);
    }
  });

  const decimalChecks = [
    [
      'fromTokenDecimals',
      'fromTokenDecimals must be an integer between 0 and 18',
    ],
    ['toTokenDecimals', 'toTokenDecimals must be an integer between 0 and 18'],
  ];

  decimalChecks.forEach(([field, message]) => {
    if (!isNonEmptyString(query[field])) {
      errors.push({ field, msg: `${field} is required`, value: query[field] });
      return;
    }

    const result = ensureIntInRange(query[field], { min: 0, max: 18, message });
    if (!result.valid) {
      errors.push({ field, msg: message, value: query[field] });
    }
  });

  const slippageResult = ensureFloatInRange(query.slippage, {
    min: 0,
    max: 100,
    field: 'slippage',
    message: 'slippage must be a number between 0 and 100',
  });
  if (!slippageResult.valid) {
    errors.push({
      field: 'slippage',
      msg: 'slippage is required',
      value: query.slippage,
    });
  } else if (Number.isNaN(slippageResult.parsed)) {
    errors.push({
      field: 'slippage',
      msg: 'slippage must be a number between 0 and 100',
      value: query.slippage,
    });
  }

  if (
    query.eth_price !== undefined &&
    query.eth_price !== null &&
    query.eth_price !== ''
  ) {
    const ethPriceResult = ensureFloatInRange(query.eth_price, {
      min: 0,
      message: 'eth_price must be a positive number',
    });
    if (!ethPriceResult.valid) {
      errors.push({
        field: 'eth_price',
        msg: 'eth_price must be a positive number',
        value: query.eth_price,
      });
    }
  }

  const toTokenPriceResult = ensureFloatInRange(query.to_token_price, {
    min: 0,
    message: 'to_token_price must be a positive number',
  });
  if (!toTokenPriceResult.valid) {
    errors.push({
      field: 'to_token_price',
      msg: 'to_token_price must be a positive number',
      value: query.to_token_price,
    });
  }

  if (errors.length > 0) {
    return respondWithErrors(res, errors);
  }

  return next();
};

const swapDataValidation = (req, res, next) => {
  const providerAllowed = ['1inch', 'paraswap', '0x'];
  const { provider } = req.query;
  const errors = [];

  if (!isNonEmptyString(provider)) {
    errors.push({
      field: 'provider',
      msg: 'provider is required',
      value: provider,
    });
  } else if (!providerAllowed.includes(provider.trim())) {
    errors.push({
      field: 'provider',
      msg: 'provider must be one of: 1inch, paraswap, 0x',
      value: provider,
    });
  } else {
    req.query.provider = provider.trim();
  }

  if (errors.length > 0) {
    return respondWithErrors(res, errors);
  }

  return swapQuoteValidation(req, res, next);
};

const bulkPricesValidation = (req, res, next) => {
  const { tokens, useCache, timeout } = req.query;
  const errors = [];

  if (!isNonEmptyString(tokens)) {
    errors.push({
      field: 'tokens',
      msg: 'tokens parameter is required',
      value: tokens,
    });
  } else {
    const splitTokens = tokens
      .split(',')
      .map(token => token.trim())
      .filter(token => token);

    if (splitTokens.length === 0) {
      errors.push({
        field: 'tokens',
        msg: 'tokens cannot be empty',
        value: tokens,
      });
    } else if (splitTokens.length > 100) {
      errors.push({
        field: 'tokens',
        msg: 'tokens cannot exceed 100 items',
        value: tokens,
      });
    } else {
      for (const token of splitTokens) {
        if (!/^[a-zA-Z0-9_-]+$/.test(token)) {
          errors.push({
            field: 'tokens',
            msg: `invalid token symbol: ${token}. Only alphanumeric characters, dashes, and underscores allowed`,
            value: tokens,
          });
          break;
        }
        if (token.length > 20) {
          errors.push({
            field: 'tokens',
            msg: `token symbol too long: ${token}. Maximum 20 characters allowed`,
            value: tokens,
          });
          break;
        }
      }
    }
  }

  if (useCache !== undefined) {
    if (!['true', 'false', true, false].includes(useCache)) {
      errors.push({
        field: 'useCache',
        msg: 'useCache must be a boolean',
        value: useCache,
      });
    }
  }

  if (timeout !== undefined && timeout !== '') {
    const timeoutResult = ensureIntInRange(timeout, {
      min: 1000,
      max: 30000,
      message: 'timeout must be between 1000 and 30000 milliseconds',
    });
    if (!timeoutResult.valid) {
      errors.push({
        field: 'timeout',
        msg: 'timeout must be between 1000 and 30000 milliseconds',
        value: timeout,
      });
    }
  }

  if (errors.length > 0) {
    return respondWithErrors(res, errors);
  }

  req.query.tokens = tokens
    .split(',')
    .map(token => token.trim())
    .filter(token => token);

  if (typeof useCache === 'string') {
    req.query.useCache = useCache === 'true';
  }

  if (timeout !== undefined && timeout !== '') {
    req.query.timeout = Number.parseInt(timeout, 10);
  }

  return next();
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
  bulkPricesValidation,
  validateTokenAddresses,
};
