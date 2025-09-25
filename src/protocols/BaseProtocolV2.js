/**
 * BaseProtocolV2 - Simplified protocol abstraction for V2 multi-strategy system
 * Focused on transaction generation and gas estimation for intent-engine
 */

const { ethers } = require('ethers');

class BaseProtocolV2 {
  /**
   * Initialize protocol with configuration
   * @param {Object} config - Protocol configuration from unifiedZapConfig
   * @param {string} chain - Chain name (ethereum, arbitrum, base, etc.)
   * @param {number} chainId - Chain ID
   */
  constructor(config, chain, chainId) {
    this.config = config;
    this.chain = chain;
    this.chainId = chainId;
    this.mode = config.mode; // 'single' or 'LP'

    // Validate required configuration
    this._validateConfig();
  }

  /**
   * Generate approval transaction for token spending
   * @param {string} userAddress - User wallet address
   * @param {string} tokenAddress - Token contract address
   * @param {string} spenderAddress - Spender contract address
   * @param {BigInt|string} amount - Amount to approve
   * @returns {Promise<Object>} - Approval transaction object
   */
  getApprovalTransaction(userAddress, tokenAddress, spenderAddress, amount) {
    // Convert amount to BigInt if needed
    const approvalAmount =
      typeof amount === 'bigint' ? amount : BigInt(amount.toString());

    if (approvalAmount === 0n) {
      throw new Error('Approval amount cannot be zero');
    }

    if (!ethers.isAddress(tokenAddress) || !ethers.isAddress(spenderAddress)) {
      throw new Error('Invalid token or spender address');
    }

    // Standard ERC20 approval
    const approvalData = this._encodeERC20Approval(
      spenderAddress,
      approvalAmount
    );

    return {
      to: tokenAddress,
      data: approvalData,
      value: '0',
      gasLimit: null, // Will be estimated by executor
      description: `Approve ${this._formatAmount(approvalAmount)} tokens for ${this.config.name}`,
    };
  }

  /**
   * Generate deposit transaction for protocol
   * @param {string} userAddress - User wallet address
   * @param {string} inputToken - Input token address
   * @param {BigInt|string} amount - Amount to deposit
   * @param {Object} additionalParams - Protocol-specific parameters
   * @returns {Promise<Object>} - Deposit transaction object
   */
  getDepositTransaction(
    userAddress,
    inputToken,
    amount,
    _additionalParams = {}
  ) {
    throw new Error(
      'getDepositTransaction must be implemented by protocol subclass'
    );
  }

  /**
   * Estimate gas for all protocol operations
   * @param {string} userAddress - User wallet address
   * @param {string} inputToken - Input token address
   * @param {BigInt|string} amount - Amount to process
   * @param {Object} additionalParams - Protocol-specific parameters
   * @returns {Promise<Object>} - Gas estimates
   */
  estimateGas(userAddress, inputToken, amount, _additionalParams = {}) {
    throw new Error('estimateGas must be implemented by protocol subclass');
  }

  /**
   * Get protocol-specific token requirements
   * For single mode: returns input token requirements
   * For LP mode: returns token pair requirements
   * @param {string} inputToken - Input token address
   * @returns {Promise<Object>} - Token requirements
   */
  getTokenRequirements(inputToken) {
    if (this.mode === 'single') {
      return {
        mode: 'single',
        inputToken: this._getBestInputToken(inputToken),
        outputToken: this.config.zapInOutTokenAddress,
        requiresSwap: this._requiresSwap(inputToken),
      };
    } else if (this.mode === 'LP') {
      return {
        mode: 'LP',
        lpTokens: this.config.lpTokens,
        requiresSwap: true, // LP always requires token distribution
      };
    }

    throw new Error(`Unsupported mode: ${this.mode}`);
  }

  /**
   * Get protocol display information
   * @returns {Object} - Protocol info for UI display
   */
  getProtocolInfo() {
    return {
      id: this.config.id || `${this.chain}-${this.constructor.name}`,
      name: this.config.name || this.constructor.name,
      chain: this.chain,
      chainId: this.chainId,
      mode: this.mode,
      targetAsset: this.config.symbolOfBestTokenToZapInOut,
      enabled: this.config.enabled !== false,
    };
  }

  /**
   * Validate protocol configuration
   * @private
   */
  _validateConfig() {
    const required = ['mode'];
    const missing = required.filter(key => !this.config[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required config: ${missing.join(', ')}`);
    }

    if (!['single', 'LP'].includes(this.config.mode)) {
      throw new Error(
        `Invalid mode: ${this.config.mode}. Must be 'single' or 'LP'`
      );
    }

    // Validate single mode requirements
    if (this.config.mode === 'single') {
      const singleRequired = ['assetAddress', 'protocolAddress'];
      const singleMissing = singleRequired.filter(key => !this.config[key]);
      if (singleMissing.length > 0) {
        throw new Error(
          `Missing required config for single mode: ${singleMissing.join(', ')}`
        );
      }
    }

    // Validate LP mode requirements
    if (this.config.mode === 'LP') {
      if (
        !this.config.lpTokens ||
        !Array.isArray(this.config.lpTokens) ||
        this.config.lpTokens.length !== 2
      ) {
        throw new Error('LP mode requires exactly 2 lpTokens');
      }
    }
  }

  /**
   * Get best input token for this protocol
   * @param {string} inputToken - Original input token
   * @returns {string} - Best token address for this protocol
   * @private
   */
  _getBestInputToken(inputToken) {
    // Default: use protocol's preferred token or input token
    return this.config.zapInOutTokenAddress || inputToken;
  }

  /**
   * Check if swap is required from input token to protocol token
   * @param {string} inputToken - Input token address
   * @returns {boolean} - Whether swap is required
   * @private
   */
  _requiresSwap(inputToken) {
    const protocolToken = this.config.zapInOutTokenAddress;
    return (
      protocolToken && inputToken.toLowerCase() !== protocolToken.toLowerCase()
    );
  }

  /**
   * Encode ERC20 approval transaction data
   * @param {string} spender - Spender address
   * @param {BigInt} amount - Approval amount
   * @returns {string} - Encoded transaction data
   * @private
   */
  _encodeERC20Approval(spender, amount) {
    const iface = new ethers.Interface([
      'function approve(address spender, uint256 amount) returns (bool)',
    ]);

    return iface.encodeFunctionData('approve', [spender, amount]);
  }

  /**
   * Format amount for display
   * @param {BigInt} amount - Amount to format
   * @param {number} decimals - Token decimals
   * @returns {string} - Formatted amount
   * @private
   */
  _formatAmount(amount, decimals = 18) {
    try {
      return ethers.formatUnits(amount, decimals);
    } catch {
      return amount.toString();
    }
  }

  /**
   * Get deadline timestamp (10 minutes from now)
   * @returns {number} - Unix timestamp
   * @protected
   */
  _getDeadline() {
    return Math.floor(Date.now() / 1000) + 600;
  }

  /**
   * Apply slippage to amount
   * @param {BigInt} amount - Original amount
   * @param {number} slippage - Slippage percentage (0.5 for 0.5%)
   * @returns {BigInt} - Amount with slippage applied
   * @protected
   */
  _applySlippage(amount, slippage) {
    const slippageBasisPoints = Math.floor(slippage * 100);
    const multiplier = BigInt(10000 - slippageBasisPoints);
    return (amount * multiplier) / 10000n;
  }

  /**
   * Validate Ethereum address
   * @param {string} address - Address to validate
   * @throws {Error} - If address is invalid
   * @protected
   */
  _validateAddress(address) {
    if (!address || !ethers.isAddress(address)) {
      throw new Error(`Invalid address: ${address}`);
    }
  }

  /**
   * Get unique identifier for this protocol instance
   * @returns {string} - Unique ID
   */
  getUniqueId() {
    return `${this.chain}/${this.constructor.name}/${this.config.id || 'default'}`;
  }
}

module.exports = BaseProtocolV2;
