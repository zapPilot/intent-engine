const { ethers } = require('ethers');

const ZAP_TOKEN_STRATEGY_TYPES = Object.freeze({
  FIXED: 'fixed',
  PASSTHROUGH: 'passthrough',
  OPTIONS: 'options',
});

function isAddressEqual(a, b) {
  if (!a || !b) {
    return false;
  }
  return a.toLowerCase() === b.toLowerCase();
}

function normalizeToken(token) {
  if (!token) {
    return null;
  }

  const { address, symbol = null, decimals = null } = token;

  if (!address || typeof address !== 'string') {
    throw new Error('Zap token metadata is missing a valid address');
  }

  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid zap token address: ${address}`);
  }

  if (decimals !== null && decimals !== undefined) {
    if (!Number.isInteger(decimals) || decimals < 0) {
      throw new Error(
        `Invalid decimals for zap token ${address}: ${decimals}`
      );
    }
  }

  return {
    symbol,
    address,
    addressLower: address.toLowerCase(),
    decimals: decimals === undefined ? null : decimals,
  };
}

function deriveLegacyStrategyDefaults(config = {}) {
  const defaults = {};

  if (
    config.symbolOfBestTokenToZapInOut &&
    config.zapInOutTokenAddress &&
    ethers.isAddress(config.zapInOutTokenAddress)
  ) {
    defaults.defaultInputToken = {
      symbol: config.symbolOfBestTokenToZapInOut,
      address: config.zapInOutTokenAddress,
      decimals:
        Number.isInteger(config.assetDecimals) && config.assetDecimals >= 0
          ? config.assetDecimals
          : null,
    };
  }

  if (
    config.symbolOfBestTokenToZapOut &&
    config.bestTokenAddressToZapOut &&
    ethers.isAddress(config.bestTokenAddressToZapOut)
  ) {
    defaults.defaultOutputToken = {
      symbol: config.symbolOfBestTokenToZapOut,
      address: config.bestTokenAddressToZapOut,
      decimals:
        Number.isInteger(config.decimalOfBestTokenToZapOut) &&
        config.decimalOfBestTokenToZapOut >= 0
          ? config.decimalOfBestTokenToZapOut
          : null,
    };
  }

  if (!defaults.defaultInputToken && defaults.defaultOutputToken) {
    defaults.defaultInputToken = defaults.defaultOutputToken;
  }

  if (!defaults.defaultOutputToken && defaults.defaultInputToken) {
    defaults.defaultOutputToken = defaults.defaultInputToken;
  }

  return defaults;
}

function normalizeZapTokenStrategy(rawStrategy, legacyDefaults = {}) {
  const { defaultInputToken, defaultOutputToken } = legacyDefaults || {};

  const fallbackToken =
    defaultInputToken || defaultOutputToken || legacyDefaults?.token || null;

  if (!rawStrategy) {
    if (fallbackToken) {
      const normalizedToken = normalizeToken(fallbackToken);
      const normalizedOutput = normalizeToken(
        defaultOutputToken || fallbackToken
      );

      return {
        type: ZAP_TOKEN_STRATEGY_TYPES.FIXED,
        tokens: [normalizedToken],
        defaultInputToken: normalizeToken(defaultInputToken || fallbackToken),
        defaultOutputToken: normalizedOutput,
      };
    }

    return {
      type: ZAP_TOKEN_STRATEGY_TYPES.PASSTHROUGH,
      tokens: [],
      defaultInputToken: defaultInputToken
        ? normalizeToken(defaultInputToken)
        : null,
      defaultOutputToken: defaultOutputToken
        ? normalizeToken(defaultOutputToken)
        : null,
    };
  }

  const type = (rawStrategy.type || '').toLowerCase();

  if (!Object.values(ZAP_TOKEN_STRATEGY_TYPES).includes(type)) {
    throw new Error(`Invalid zapTokenStrategy type: ${rawStrategy.type}`);
  }

  if (type === ZAP_TOKEN_STRATEGY_TYPES.FIXED) {
    const token =
      rawStrategy.token ||
      rawStrategy.defaultToken ||
      rawStrategy.defaultInputToken ||
      fallbackToken;

    if (!token) {
      throw new Error('Fixed zap token strategy requires a token');
    }

    const normalizedToken = normalizeToken(token);
    const normalizedOutput = normalizeToken(
      rawStrategy.defaultOutputToken || token
    );

    return {
      type,
      tokens: [normalizedToken],
      defaultInputToken: normalizedToken,
      defaultOutputToken: normalizedOutput,
    };
  }

  if (type === ZAP_TOKEN_STRATEGY_TYPES.OPTIONS) {
    if (!Array.isArray(rawStrategy.tokens) || rawStrategy.tokens.length === 0) {
      throw new Error('Options zap token strategy requires at least one token');
    }

    const normalizedTokens = rawStrategy.tokens.map(normalizeToken);
    const normalizedInput = normalizeToken(
      rawStrategy.defaultInputToken || normalizedTokens[0]
    );
    const normalizedOutput = normalizeToken(
      rawStrategy.defaultOutputToken || normalizedInput
    );

    return {
      type,
      tokens: normalizedTokens,
      defaultInputToken: normalizedInput,
      defaultOutputToken: normalizedOutput,
    };
  }

  // Passthrough strategy
  const normalizedTokens = Array.isArray(rawStrategy.tokens)
    ? rawStrategy.tokens.map(normalizeToken)
    : [];

  const normalizedInput = rawStrategy.defaultInputToken
    ? normalizeToken(rawStrategy.defaultInputToken)
    : defaultInputToken
    ? normalizeToken(defaultInputToken)
    : null;

  const normalizedOutput = rawStrategy.defaultOutputToken
    ? normalizeToken(rawStrategy.defaultOutputToken)
    : defaultOutputToken
    ? normalizeToken(defaultOutputToken)
    : null;

  return {
    type,
    tokens: normalizedTokens,
    defaultInputToken: normalizedInput,
    defaultOutputToken: normalizedOutput,
  };
}

function findStrategyToken(strategy, address) {
  if (!strategy || !address) {
    return null;
  }

  const normalized = address.toLowerCase();

  if (strategy.tokens && strategy.tokens.length > 0) {
    const match = strategy.tokens.find(
      token => token.addressLower === normalized
    );
    if (match) {
      return match;
    }
  }

  if (
    strategy.defaultInputToken &&
    strategy.defaultInputToken.addressLower === normalized
  ) {
    return strategy.defaultInputToken;
  }

  if (
    strategy.defaultOutputToken &&
    strategy.defaultOutputToken.addressLower === normalized
  ) {
    return strategy.defaultOutputToken;
  }

  return null;
}

function getDefaultInputToken(strategy) {
  if (!strategy) {
    return null;
  }

  if (strategy.defaultInputToken) {
    return strategy.defaultInputToken;
  }

  if (strategy.tokens && strategy.tokens.length > 0) {
    return strategy.tokens[0];
  }

  return null;
}

function getDefaultOutputToken(strategy) {
  if (!strategy) {
    return null;
  }

  if (strategy.defaultOutputToken) {
    return strategy.defaultOutputToken;
  }

  if (strategy.defaultInputToken) {
    return strategy.defaultInputToken;
  }

  if (strategy.tokens && strategy.tokens.length > 0) {
    return strategy.tokens[0];
  }

  return null;
}

function requiresSwapForToken(strategy, inputToken) {
  if (!strategy || !inputToken) {
    return false;
  }

  const normalized = inputToken.toLowerCase();

  if (strategy.type === ZAP_TOKEN_STRATEGY_TYPES.PASSTHROUGH) {
    if (!strategy.tokens || strategy.tokens.length === 0) {
      return false;
    }
    return !strategy.tokens.some(token => token.addressLower === normalized);
  }

  if (strategy.type === ZAP_TOKEN_STRATEGY_TYPES.OPTIONS) {
    return !strategy.tokens.some(token => token.addressLower === normalized);
  }

  // Fixed strategy
  const defaultToken = getDefaultInputToken(strategy);
  if (!defaultToken) {
    return false;
  }
  return defaultToken.addressLower !== normalized;
}

function getStrategyTokenSymbols(strategy) {
  if (!strategy) {
    return [];
  }

  const symbols = new Set();

  const candidateTokens = [];

  if (strategy.tokens && strategy.tokens.length > 0) {
    candidateTokens.push(...strategy.tokens);
  }

  if (strategy.defaultInputToken) {
    candidateTokens.push(strategy.defaultInputToken);
  }

  if (strategy.defaultOutputToken) {
    candidateTokens.push(strategy.defaultOutputToken);
  }

  candidateTokens
    .filter(Boolean)
    .forEach(token => {
      if (token.symbol) {
        symbols.add(token.symbol);
      }
    });

  if (symbols.size === 0 && strategy.type === ZAP_TOKEN_STRATEGY_TYPES.PASSTHROUGH) {
    return ['ANY'];
  }

  return Array.from(symbols);
}

module.exports = {
  ZAP_TOKEN_STRATEGY_TYPES,
  normalizeToken,
  normalizeZapTokenStrategy,
  deriveLegacyStrategyDefaults,
  getDefaultInputToken,
  getDefaultOutputToken,
  getStrategyTokenSymbols,
  findStrategyToken,
  requiresSwapForToken,
  isAddressEqual,
};
