/**
 * Balance Endpoint Validation Middleware
 *
 * Validates:
 * - chainId: Must be one of the supported chains (1, 137, 42161, 8453, 10)
 * - wallet: Must be a valid Ethereum address
 * - tokens: Optional comma-separated list of valid token addresses
 */

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

const buildError = (field, message, value) => ({ field, message, value });

/**
 * Custom validator: Check if value is a valid Ethereum address
 */
const isValidAddress = value => {
  if (!value || typeof value !== 'string') {
    return false;
  }

  try {
    if (isAddress(value)) {
      return true;
    }
  } catch {
    // Ignore and fall back to lowercase check
  }

  try {
    return isAddress(value.toLowerCase());
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

const normalizeTokens = value =>
  value
    .split(',')
    .map(addr => addr.trim().toLowerCase())
    .filter(Boolean);

/**
 * Validate balance query parameters and return collected errors + normalized values.
 * @param {Object} query
 * @returns {{errors: Array, normalized: Object}}
 */
const validateBalanceQuery = query => {
  const errors = [];
  const normalized = {};

  const rawChainId = query?.chainId;
  const parsedChainId = Number(rawChainId);

  if (!Number.isInteger(parsedChainId)) {
    errors.push(
      buildError('chainId', 'chainId must be an integer', rawChainId)
    );
  } else if (!SUPPORTED_CHAIN_IDS.includes(parsedChainId)) {
    const chainList = SUPPORTED_CHAIN_IDS.join(', ');
    const chainDescriptions = Object.entries(SUPPORTED_CHAINS)
      .map(([id, name]) => `${id}=${name}`)
      .join(', ');
    errors.push(
      buildError(
        'chainId',
        `chainId must be one of: ${chainList} (${chainDescriptions})`,
        rawChainId
      )
    );
  } else {
    normalized.chainId = parsedChainId;
  }

  const rawWallet =
    typeof query?.wallet === 'string' ? query.wallet.trim() : '';
  if (!rawWallet) {
    errors.push(
      buildError('wallet', 'wallet address is required', query?.wallet)
    );
  } else if (!isValidAddress(rawWallet)) {
    errors.push(
      buildError(
        'wallet',
        'wallet must be a valid Ethereum address (0x... format)',
        query?.wallet
      )
    );
  } else {
    normalized.wallet = rawWallet.toLowerCase();
  }

  if (query?.tokens !== undefined) {
    const tokensValue =
      typeof query.tokens === 'string' ? query.tokens.trim() : '';

    if (tokensValue && !areValidAddresses(tokensValue)) {
      errors.push(
        buildError(
          'tokens',
          'tokens must be a comma-separated list of valid Ethereum addresses (max 50 tokens)',
          query.tokens
        )
      );
    } else if (tokensValue) {
      normalized.tokens = normalizeTokens(tokensValue);
    }
  }

  return { errors, normalized };
};

const balanceValidator = (req, res, next) => {
  const { errors, normalized } = validateBalanceQuery(req.query || {});

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid request parameters',
      errors,
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

  if (normalized.chainId !== undefined) {
    req.query.chainId = normalized.chainId;
  }

  if (normalized.wallet) {
    req.query.wallet = normalized.wallet;
  }

  if (Array.isArray(normalized.tokens)) {
    req.query.tokens = normalized.tokens.join(',');
    req.query.tokensList = normalized.tokens;
  }

  next();
};

module.exports = balanceValidator;

// Export for testing and reuse
module.exports.validateBalanceQuery = validateBalanceQuery;
module.exports.SUPPORTED_CHAINS = SUPPORTED_CHAINS;
module.exports.SUPPORTED_CHAIN_IDS = SUPPORTED_CHAIN_IDS;
module.exports.isValidAddress = isValidAddress;
module.exports.areValidAddresses = areValidAddresses;
