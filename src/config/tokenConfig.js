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
      zapEnabled: true,
    },
    WETH: {
      type: 'wrapped',
      symbol: 'WETH',
      name: 'Wrapped Ethereum',
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      decimals: 18,
      hasDeposit: true,
      nativeVersion: 'ETH',
      zapEnabled: true,
    },
    USDC: {
      type: 'erc20',
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xA0b86a33E6441a8C8C5d56Aa14E4e66E8e6B9E2',
      decimals: 6,
      zapEnabled: true,
    },
    USDT: {
      type: 'erc20',
      symbol: 'USDT',
      name: 'Tether USD',
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
      zapEnabled: true,
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
      zapEnabled: true,
    },
    WETH: {
      type: 'wrapped',
      symbol: 'WETH',
      name: 'Wrapped Ethereum',
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      decimals: 18,
      hasDeposit: true,
      nativeVersion: 'ETH',
      zapEnabled: true,
    },
    USDC: {
      type: 'erc20',
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      decimals: 6,
      zapEnabled: true,
    },
    USDT: {
      type: 'erc20',
      symbol: 'USDT',
      name: 'Tether USD',
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      decimals: 6,
      zapEnabled: true,
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
      zapEnabled: true,
    },
    WETH: {
      type: 'wrapped',
      symbol: 'WETH',
      name: 'Wrapped Ethereum',
      address: '0x4200000000000000000000000000000000000006',
      decimals: 18,
      hasDeposit: true,
      nativeVersion: 'ETH',
      zapEnabled: true,
    },
    USDC: {
      type: 'erc20',
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
      zapEnabled: true,
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
   * Get token metadata by address for a specific chain
   * @param {number} chainId - Chain ID
   * @param {string} address - Token contract address
   * @returns {Object|null} - Token metadata or null if not found
   */
  static getTokenByAddress(chainId, address) {
    if (!address || typeof address !== 'string') {
      return null;
    }

    const chain = TOKEN_REGISTRY[chainId];
    if (!chain) {
      return null;
    }

    const normalizedAddress = address.toLowerCase();

    for (const token of Object.values(chain)) {
      if (
        token?.address &&
        typeof token.address === 'string' &&
        token.address.toLowerCase() === normalizedAddress
      ) {
        return token;
      }
    }

    return null;
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

  /**
   * Get zap-enabled tokens for a specific chain
   * @param {number} chainId - Chain ID
   * @returns {Object} - Formatted response with chain info and zap-enabled tokens
   */
  static getZapTokens(chainId) {
    const chainTokens = TOKEN_REGISTRY[chainId];
    const chainMetadata = CHAIN_METADATA[chainId];

    if (!chainTokens || !chainMetadata) {
      return null;
    }

    // Filter only zap-enabled tokens and format for API response
    const zapTokens = Object.values(chainTokens)
      .filter(token => token.zapEnabled)
      .map(token => ({
        symbol: token.symbol,
        name: token.name,
        address: token.address || 'native',
        decimals: token.decimals,
        type: token.type,
        ...(token.wrappedVersion && { wrappedVersion: token.wrappedVersion }),
        ...(token.nativeVersion && { nativeVersion: token.nativeVersion }),
        ...(token.hasDeposit && { hasDeposit: token.hasDeposit }),
      }));

    return {
      chainId,
      chainName: chainMetadata.name.toLowerCase(),
      nativeToken: chainMetadata.nativeToken,
      tokens: zapTokens,
    };
  }
}

module.exports = {
  TOKEN_REGISTRY,
  CHAIN_METADATA,
  WETH_DEPOSIT_ABI,
  ERC20_TRANSFER_ABI,
  TokenConfigService,
};
