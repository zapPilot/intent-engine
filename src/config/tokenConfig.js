/**
 * Token Configuration Registry
 * Unified multi-chain token registry for ERC20 tokens, wrapped tokens, and native tokens
 * Supports scalable token management across multiple chains for zapIn/zapOut operations
 */

/**
 * WETH Deposit ABI - Standard across all chains
 * Only includes the deposit function needed for ETH -> WETH conversion
 */
const WETH_DEPOSIT_ABI = [
  {
    constant: false,
    inputs: [],
    name: 'deposit',
    outputs: [],
    payable: true,
    stateMutability: 'payable',
    type: 'function',
  },
];

/**
 * ERC20 Transfer ABI - Standard ERC20 transfer function
 */
const ERC20_TRANSFER_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

/**
 * Multi-chain token registry
 * Structure: { chainId: { tokenSymbol: tokenMetadata } }
 */
const TOKEN_REGISTRY = {
  // Ethereum Mainnet (Chain ID: 1)
  1: {
    ETH: {
      type: 'native',
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      wrappedVersion: 'WETH',
    },
    WETH: {
      type: 'wrapped',
      symbol: 'WETH',
      name: 'Wrapped Ethereum',
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      decimals: 18,
      hasDeposit: true,
      nativeVersion: 'ETH',
    },
    USDC: {
      type: 'erc20',
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xA0b86a33E6441a8C8C5d56Aa14E4e66E8e6B9E2',
      decimals: 6,
    },
    USDT: {
      type: 'erc20',
      symbol: 'USDT',
      name: 'Tether USD',
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
    },
  },

  // Arbitrum One (Chain ID: 42161)
  42161: {
    ETH: {
      type: 'native',
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      wrappedVersion: 'WETH',
    },
    WETH: {
      type: 'wrapped',
      symbol: 'WETH',
      name: 'Wrapped Ethereum',
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      decimals: 18,
      hasDeposit: true,
      nativeVersion: 'ETH',
    },
    USDC: {
      type: 'erc20',
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      decimals: 6,
    },
    USDT: {
      type: 'erc20',
      symbol: 'USDT',
      name: 'Tether USD',
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      decimals: 6,
    },
  },

  // Base (Chain ID: 8453)
  8453: {
    ETH: {
      type: 'native',
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      wrappedVersion: 'WETH',
    },
    WETH: {
      type: 'wrapped',
      symbol: 'WETH',
      name: 'Wrapped Ethereum',
      address: '0x4200000000000000000000000000000000000006',
      decimals: 18,
      hasDeposit: true,
      nativeVersion: 'ETH',
    },
    USDC: {
      type: 'erc20',
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
    },
  },

  // Polygon (Chain ID: 137)
  137: {
    MATIC: {
      type: 'native',
      symbol: 'MATIC',
      name: 'Polygon',
      decimals: 18,
      wrappedVersion: 'WMATIC',
    },
    WMATIC: {
      type: 'wrapped',
      symbol: 'WMATIC',
      name: 'Wrapped Matic',
      address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      decimals: 18,
      hasDeposit: true,
      nativeVersion: 'MATIC',
    },
    USDC: {
      type: 'erc20',
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      decimals: 6,
    },
    WETH: {
      type: 'erc20',
      symbol: 'WETH',
      name: 'Wrapped Ethereum',
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      decimals: 18,
    },
  },

  // BSC (Chain ID: 56)
  56: {
    BNB: {
      type: 'native',
      symbol: 'BNB',
      name: 'BNB',
      decimals: 18,
      wrappedVersion: 'WBNB',
    },
    WBNB: {
      type: 'wrapped',
      symbol: 'WBNB',
      name: 'Wrapped BNB',
      address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      decimals: 18,
      hasDeposit: true,
      nativeVersion: 'BNB',
    },
    USDC: {
      type: 'erc20',
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      decimals: 18,
    },
    USDT: {
      type: 'erc20',
      symbol: 'USDT',
      name: 'Tether USD',
      address: '0x55d398326f99059fF775485246999027B3197955',
      decimals: 18,
    },
  },
};

/**
 * Chain metadata for network identification
 */
const CHAIN_METADATA = {
  1: { name: 'Ethereum', nativeToken: 'ETH' },
  42161: { name: 'Arbitrum', nativeToken: 'ETH' },
  8453: { name: 'Base', nativeToken: 'ETH' },
  137: { name: 'Polygon', nativeToken: 'MATIC' },
  56: { name: 'BSC', nativeToken: 'BNB' },
};

/**
 * Token Configuration Service
 * Provides methods to query and manage token configurations across chains
 */
class TokenConfigService {
  /**
   * Get token metadata for a specific chain and symbol
   * @param {number} chainId - Chain ID
   * @param {string} symbol - Token symbol
   * @returns {Object|null} - Token metadata or null if not found
   */
  static getToken(chainId, symbol) {
    const chain = TOKEN_REGISTRY[chainId];
    if (!chain) {
      return null;
    }
    return chain[symbol.toUpperCase()] || null;
  }

  /**
   * Get WETH address for a specific chain
   * @param {number} chainId - Chain ID
   * @returns {string|null} - WETH contract address or null if not supported
   */
  static getWETHAddress(chainId) {
    const chain = TOKEN_REGISTRY[chainId];
    if (!chain) {
      return null;
    }

    // Find the wrapped version of the native token
    const nativeToken = CHAIN_METADATA[chainId]?.nativeToken;
    if (!nativeToken) {
      return null;
    }

    const nativeTokenData = chain[nativeToken];
    if (!nativeTokenData?.wrappedVersion) {
      return null;
    }

    const wrappedToken = chain[nativeTokenData.wrappedVersion];
    return wrappedToken?.address || null;
  }

  /**
   * Get native token symbol for a chain
   * @param {number} chainId - Chain ID
   * @returns {string|null} - Native token symbol or null
   */
  static getNativeTokenSymbol(chainId) {
    return CHAIN_METADATA[chainId]?.nativeToken || null;
  }

  /**
   * Check if a token supports deposit function (is wrapped native token)
   * @param {number} chainId - Chain ID
   * @param {string} symbol - Token symbol
   * @returns {boolean} - True if token supports deposit
   */
  static hasDepositFunction(chainId, symbol) {
    const token = this.getToken(chainId, symbol);
    return Boolean(token?.hasDeposit);
  }

  /**
   * Get all tokens for a specific chain
   * @param {number} chainId - Chain ID
   * @returns {Object|null} - All tokens for the chain or null
   */
  static getChainTokens(chainId) {
    return TOKEN_REGISTRY[chainId] || null;
  }

  /**
   * Get supported chain IDs
   * @returns {number[]} - Array of supported chain IDs
   */
  static getSupportedChains() {
    return Object.keys(TOKEN_REGISTRY).map(Number);
  }

  /**
   * Check if a chain is supported
   * @param {number} chainId - Chain ID to check
   * @returns {boolean} - True if chain is supported
   */
  static isChainSupported(chainId) {
    return Boolean(TOKEN_REGISTRY[chainId]);
  }

  /**
   * Get wrapped version of native token
   * @param {number} chainId - Chain ID
   * @returns {Object|null} - Wrapped token metadata or null
   */
  static getWrappedNativeToken(chainId) {
    const nativeSymbol = this.getNativeTokenSymbol(chainId);
    if (!nativeSymbol) {
      return null;
    }

    const nativeToken = this.getToken(chainId, nativeSymbol);
    if (!nativeToken?.wrappedVersion) {
      return null;
    }

    return this.getToken(chainId, nativeToken.wrappedVersion);
  }
}

module.exports = {
  TOKEN_REGISTRY,
  CHAIN_METADATA,
  WETH_DEPOSIT_ABI,
  ERC20_TRANSFER_ABI,
  TokenConfigService,
};
