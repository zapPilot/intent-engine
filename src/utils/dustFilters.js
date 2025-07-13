/**
 * Dust token filtering utilities based on existing dustZap implementation
 */

/**
 * Filter and identify dust tokens from user's token balances
 * @param {Array} tokens - Array of token balance objects
 * @param {number} dustThreshold - Minimum USD value to be considered dust (default: 0.005)
 * @returns {Array} - Filtered array of dust tokens
 */
function filterDustTokens(tokens, dustThreshold = 0.005) {
  if (!Array.isArray(tokens)) {
    return [];
  }
  return tokens
    .filter(token => {
      // Must have valid price data
      if (!token.price || token.price <= 0) {
        return false;
      }

      // Calculate USD value (convert from wei to decimal)
      const amount = parseFloat(token.amount || 0);
      const price = parseFloat(token.price);
      const value = amount * price;
      // Must be above dust threshold
      if (value <= dustThreshold) {
        return false;
      }

      // Exclude LP tokens (contain "-" or "/" in symbol)
      if (
        token.symbol &&
        (token.symbol.includes('-') || token.symbol.includes('/'))
      ) {
        return false;
      }

      // Exclude major stablecoins and native tokens
      if (isExcludedToken(token.symbol)) {
        return false;
      }

      // Exclude Aave protocol tokens
      if (isAaveToken(token.symbol)) {
        return false;
      }

      return true;
    })
    .map(token => ({
      ...token,
      value: parseFloat(token.amount) * parseFloat(token.price),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3); // Sort by value descending
}

/**
 * Check if token symbol is in the exclusion list
 * @param {string} symbol - Token symbol
 * @returns {boolean} - True if token should be excluded
 */
function isExcludedToken(symbol) {
  if (!symbol) {
    return false;
  }

  const excludedTokens = [
    'USDC',
    'USDT',
    'DAI',
    'BUSD',
    'FRAX',
    'LUSD', // Stablecoins
    'ETH',
    'WETH',
    'BNB',
    'WBNB',
    'MATIC',
    'WMATIC',
    'AVAX',
    'WAVAX', // Native tokens
    'ALP', // Specific exclusions from original implementation
  ];

  return excludedTokens.includes(symbol.toUpperCase());
}

/**
 * Check if token is an Aave protocol token
 * @param {string} symbol - Token symbol
 * @returns {boolean} - True if token is Aave protocol token
 */
function isAaveToken(symbol) {
  if (!symbol) {
    return false;
  }

  const aavePatterns = [
    /^a[A-Z]+$/, // aTokens (aUSDC, aETH, etc.)
    /^variableDebt/, // Variable debt tokens
    /^stableDebt/, // Stable debt tokens
  ];

  return aavePatterns.some(pattern => pattern.test(symbol));
}

/**
 * Group dust tokens into batches for transaction processing
 * @param {Array} dustTokens - Array of dust tokens
 * @param {number} batchSize - Maximum tokens per batch (default: 10)
 * @returns {Array} - Array of batches, each containing up to batchSize tokens
 */
function groupIntoBatches(dustTokens, batchSize = 10) {
  const batches = [];

  for (let i = 0; i < dustTokens.length; i += batchSize) {
    batches.push(dustTokens.slice(i, i + batchSize));
  }

  return batches;
}

/**
 * Calculate total USD value of dust tokens
 * @param {Array} dustTokens - Array of dust tokens
 * @returns {number} - Total USD value
 */
function calculateTotalValue(dustTokens) {
  return dustTokens.reduce((total, token) => {
    return total + (token.value || 0);
  }, 0);
}

/**
 * Validate token object structure
 * @param {Object} token - Token object
 * @returns {boolean} - True if token has required fields
 */
function isValidToken(token) {
  return (
    token &&
    typeof token.address === 'string' &&
    typeof token.symbol === 'string' &&
    typeof token.amount !== 'undefined' &&
    typeof token.price !== 'undefined'
  );
}

module.exports = {
  filterDustTokens,
  isExcludedToken,
  isAaveToken,
  groupIntoBatches,
  calculateTotalValue,
  isValidToken,
};
