const { isAddress } = require('ethers');

const buildErrorResponse = (message, field, value) => ({
  success: false,
  error: {
    code: 'INVALID_INPUT',
    message,
    details: {
      field,
      value,
    },
  },
});

const parsePositiveInteger = value => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const normalizeAddress = value =>
  typeof value === 'string' ? value.trim() : '';

const isEthereumAddress = value => {
  if (!value || typeof value !== 'string') {
    return false;
  }

  try {
    if (isAddress(value)) {
      return true;
    }
  } catch {
    // ignore and fall back to lowercase normalization
  }

  try {
    return isAddress(value.toLowerCase());
  } catch {
    return false;
  }
};

const validateIntentRequest = (req, res, next) => {
  const { userAddress, chainId, params } = req.body || {};

  const normalizedAddress = normalizeAddress(userAddress);
  if (!normalizedAddress || !isAddress(normalizedAddress)) {
    return res
      .status(400)
      .json(
        buildErrorResponse(
          'Invalid userAddress: must be a valid Ethereum address',
          'userAddress',
          userAddress
        )
      );
  }

  const parsedChainId = parsePositiveInteger(chainId);
  if (parsedChainId === null) {
    return res
      .status(400)
      .json(
        buildErrorResponse(
          'Invalid chainId: must be a positive integer',
          'chainId',
          chainId
        )
      );
  }

  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return res
      .status(400)
      .json(buildErrorResponse('params object is required', 'params', params));
  }

  req.body.userAddress = normalizedAddress;
  req.body.chainId = parsedChainId;

  return next();
};

const validateBalanceRequest = (req, res, next) => {
  const errors = [];

  const chainId = parsePositiveInteger(req.params?.chainId);
  if (chainId === null) {
    errors.push({
      message: 'Invalid chainId: must be a positive integer',
      field: 'chainId',
      value: req.params?.chainId,
    });
  }

  const address = normalizeAddress(req.params?.address);
  if (!address || !isEthereumAddress(address)) {
    errors.push({
      message: 'Invalid address: must be a valid Ethereum address',
      field: 'address',
      value: req.params?.address,
    });
  }

  const tokensParam = req.query?.tokens;
  if (tokensParam !== undefined) {
    if (typeof tokensParam !== 'string') {
      errors.push({
        message: 'tokens must be a comma-separated list of addresses',
        field: 'tokens',
        value: tokensParam,
      });
    } else {
      const addresses = tokensParam
        .split(',')
        .map(token => token.trim())
        .filter(Boolean);

      const invalid = addresses.find(token => {
        if (token.toLowerCase() === 'native') {
          return false;
        }
        return !/^0x[a-fA-F0-9]{40}$/.test(token);
      });

      if (invalid) {
        errors.push({
          message: `Invalid token address: ${invalid}`,
          field: 'tokens',
          value: tokensParam,
        });
      }
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: errors[0].message,
        details: errors[0],
      },
    });
  }

  if (chainId !== null) {
    req.params.chainId = chainId;
  }
  req.params.address = address.toLowerCase();

  if (tokensParam !== undefined && typeof tokensParam === 'string') {
    req.query.tokens = tokensParam;
  }

  return next();
};

module.exports = {
  validateIntentRequest,
  validateBalanceRequest,
};
