/**
 * Test utilities and helpers for intent-engine tests
 */

/**
 * Valid test addresses for consistent testing
 */
const TEST_ADDRESSES = {
  VALID_USER: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
  VALID_TOKEN: '0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037',
  INVALID_ADDRESS: '0xinvalid',
};

/**
 * Common test data patterns
 */
const TEST_DATA = {
  VALID_CHAIN_IDS: [1, 42161, 8453, 10],
  VAULT_IDS: ['stablecoin-vault', 'btc-vault', 'eth-vault', 'index500-vault'],
  OPERATIONS: ['dustZap', 'rebalance', 'compound'],
};

/**
 * Mock response generators
 */
const createMockTokenBalance = (symbol = 'USDC', balance = '1000000') => ({
  symbol,
  balance,
  address: TEST_ADDRESSES.VALID_TOKEN,
  decimals: 6,
  price: 1.0,
});

const createMockSwapQuote = (fromAmount = '100', toAmount = '99') => ({
  fromAmount,
  toAmount,
  estimatedGas: '150000',
  gasCostUSD: 5.5,
  route: ['USDC', 'ETH'],
});

/**
 * Standard test request builders
 */
const buildIntentRequest = (intentType, params = {}) => ({
  userAddress: TEST_ADDRESSES.VALID_USER,
  chainId: 1,
  params: {
    ...params,
  },
});

const buildZapInRequest = (overrides = {}) =>
  buildIntentRequest('zapIn', {
    fromToken: TEST_ADDRESSES.VALID_TOKEN,
    vault: 'stablecoin-vault',
    amount: '1000000000000000000',
    slippageTolerance: 0.5,
    ...overrides,
  });

const buildZapOutRequest = (overrides = {}) =>
  buildIntentRequest('zapOut', {
    vault: 'stablecoin-vault',
    percentage: 50,
    toToken: TEST_ADDRESSES.VALID_TOKEN,
    slippageTolerance: 0.5,
    ...overrides,
  });

const buildOptimizeRequest = (operations = ['dustZap'], overrides = {}) =>
  buildIntentRequest('optimize', {
    operations,
    dustThreshold: 5,
    targetToken: 'ETH',
    rebalanceThreshold: 5,
    slippageTolerance: 0.5,
    ...overrides,
  });

/**
 * Test assertion helpers
 */
const expectValidResponse = (response, expectedFields = []) => {
  expect(response.body).toHaveProperty('success');
  expect(response.body).toHaveProperty('timestamp');
  expectedFields.forEach(field => {
    expect(response.body).toHaveProperty(field);
  });
};

const expectErrorResponse = (
  response,
  expectedCode,
  expectedMessage = null
) => {
  expect(response.body.success).toBe(false);
  expect(response.body.error).toHaveProperty('code', expectedCode);
  if (expectedMessage) {
    expect(response.body.error.message).toContain(expectedMessage);
  }
};

/**
 * Mock external service responses
 */
const mockRebalanceBackendResponses = {
  healthCheck: { status: 200 },
  getUserTokens: {
    tokens: [
      createMockTokenBalance('USDC', '1000000'),
      createMockTokenBalance('ETH', '500000000000000000'),
      createMockTokenBalance('DUST', '10000'), // Below threshold
    ],
  },
  bundlePortfolio: {
    net_worth: 1500,
    suggestions: [],
    estimated_interest: 75,
    portfolio_apr: 5.0,
    aggregated_positions: {},
    claimable_rewards: {},
  },
};

module.exports = {
  TEST_ADDRESSES,
  TEST_DATA,
  createMockTokenBalance,
  createMockSwapQuote,
  buildIntentRequest,
  buildZapInRequest,
  buildZapOutRequest,
  buildOptimizeRequest,
  expectValidResponse,
  expectErrorResponse,
  mockRebalanceBackendResponses,
};
