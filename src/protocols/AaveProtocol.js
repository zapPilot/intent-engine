/**
 * AaveProtocol - Aave lending protocol implementation for V2 multi-strategy system
 * Handles USDC/WBTC lending on Aave V3 across multiple chains
 */

const BaseProtocolV2 = require('./BaseProtocolV2');
const { ethers } = require('ethers');

class AaveProtocol extends BaseProtocolV2 {
  constructor(config, chain, chainId) {
    super(config, chain, chainId);

    // Validate Aave-specific configuration
    this._validateAaveConfig();

    // Initialize Aave-specific properties
    this.poolAddress = config.protocolAddress;
    this.aTokenAddress = config.assetAddress;
    this.underlyingTokenAddress = config.zapInOutTokenAddress;
    this.tokenDecimals = config.assetDecimals;
  }

  /**
   * Generate deposit transaction for Aave lending
   * @param {string} userAddress - User wallet address
   * @param {string} inputToken - Input token address (should match underlying)
   * @param {BigNumber|string} amount - Amount to deposit
   * @param {Object} additionalParams - Additional parameters (unused for Aave)
   * @returns {Promise<Object>} - Deposit transaction object
   */
  getDepositTransaction(
    userAddress,
    inputToken,
    amount,
    _additionalParams = {}
  ) {
    this._validateAddress(userAddress);
    this._validateAddress(inputToken);

    // Convert amount to BigNumber if needed
    const depositAmount = ethers.BigNumber.isBigNumber(amount)
      ? amount
      : ethers.BigNumber.from(amount.toString());

    if (depositAmount.isZero()) {
      throw new Error('Deposit amount cannot be zero');
    }

    // Ensure input token matches protocol's underlying token
    if (
      inputToken.toLowerCase() !== this.underlyingTokenAddress.toLowerCase()
    ) {
      throw new Error(
        `Input token ${inputToken} does not match protocol underlying token ${this.underlyingTokenAddress}`
      );
    }

    // Encode Aave supply function call
    const supplyData = this._encodeSupplyCall(
      this.underlyingTokenAddress,
      depositAmount,
      userAddress
    );

    return {
      to: this.poolAddress,
      data: supplyData,
      value: '0',
      gasLimit: null, // Will be estimated
      description: `Supply ${this._formatAmount(depositAmount, this.tokenDecimals)} ${this.config.symbolOfBestTokenToZapInOut} to Aave`,
    };
  }

  /**
   * Estimate gas for Aave operations
   * @param {string} userAddress - User wallet address
   * @param {string} inputToken - Input token address
   * @param {BigNumber|string} amount - Amount to process
   * @returns {Promise<Object>} - Gas estimates
   */
  estimateGas(userAddress, inputToken, amount) {
    try {
      // Convert amount to BigNumber
      const _processAmount = ethers.BigNumber.isBigNumber(amount)
        ? amount
        : ethers.BigNumber.from(amount.toString());

      // Base estimates for Aave operations
      const approvalGas = ethers.BigNumber.from('50000'); // ~50k gas for approval
      const supplyGas = ethers.BigNumber.from('200000'); // ~200k gas for supply

      return {
        approval: {
          gasLimit: approvalGas,
          description: 'Approve token spending',
        },
        deposit: {
          gasLimit: supplyGas,
          description: 'Supply tokens to Aave',
        },
        total: {
          gasLimit: approvalGas.add(supplyGas),
          description: 'Total estimated gas',
        },
      };
    } catch (error) {
      throw new Error(`Failed to estimate gas for Aave: ${error.message}`);
    }
  }

  /**
   * Get Aave-specific token requirements
   * @param {string} inputToken - Input token address
   * @returns {Promise<Object>} - Token requirements
   */
  getTokenRequirements(inputToken) {
    const baseRequirements = super.getTokenRequirements(inputToken);

    return {
      ...baseRequirements,
      protocolSpecific: {
        poolAddress: this.poolAddress,
        aTokenAddress: this.aTokenAddress,
        underlyingToken: this.underlyingTokenAddress,
        interestRateMode: 0, // Variable rate
        referralCode: 0,
      },
    };
  }

  /**
   * Validate Aave-specific configuration
   * @private
   */
  _validateAaveConfig() {
    const required = [
      'protocolAddress',
      'assetAddress',
      'zapInOutTokenAddress',
      'assetDecimals',
      'symbolOfBestTokenToZapInOut',
    ];

    const missing = required.filter(key => !this.config[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required Aave config: ${missing.join(', ')}`);
    }

    // Validate addresses
    const addresses = [
      'protocolAddress',
      'assetAddress',
      'zapInOutTokenAddress',
    ];
    addresses.forEach(key => {
      if (!ethers.utils.isAddress(this.config[key])) {
        throw new Error(`Invalid ${key}: ${this.config[key]}`);
      }
    });

    // Validate decimals
    if (
      !Number.isInteger(this.config.assetDecimals) ||
      this.config.assetDecimals < 0
    ) {
      throw new Error(`Invalid assetDecimals: ${this.config.assetDecimals}`);
    }
  }

  /**
   * Encode Aave supply function call
   * @param {string} asset - Asset address to supply
   * @param {BigNumber} amount - Amount to supply
   * @param {string} onBehalfOf - Address to receive aTokens
   * @param {number} referralCode - Referral code (default 0)
   * @returns {string} - Encoded function data
   * @private
   */
  _encodeSupplyCall(asset, amount, onBehalfOf, referralCode = 0) {
    // Aave V3 Pool interface
    const poolInterface = new ethers.utils.Interface([
      'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
    ]);

    return poolInterface.encodeFunctionData('supply', [
      asset,
      amount,
      onBehalfOf,
      referralCode,
    ]);
  }

  /**
   * Get Aave protocol info with additional details
   * @returns {Object} - Extended protocol info
   */
  getProtocolInfo() {
    const baseInfo = super.getProtocolInfo();

    return {
      ...baseInfo,
      protocol: 'Aave',
      version: 'V3',
      type: 'Lending',
      apy: null, // Could be fetched from Aave API
      totalSupplied: null, // Could be fetched from Aave API
      utilization: null, // Could be fetched from Aave API
      addresses: {
        pool: this.poolAddress,
        aToken: this.aTokenAddress,
        underlying: this.underlyingTokenAddress,
      },
    };
  }

  /**
   * Get withdrawal transaction (for future use)
   * @param {string} userAddress - User wallet address
   * @param {BigNumber|string} amount - Amount to withdraw
   * @returns {Promise<Object>} - Withdrawal transaction
   */
  getWithdrawalTransaction(userAddress, amount) {
    this._validateAddress(userAddress);

    const withdrawAmount = ethers.BigNumber.isBigNumber(amount)
      ? amount
      : ethers.BigNumber.from(amount.toString());

    const withdrawData = this._encodeWithdrawCall(
      this.underlyingTokenAddress,
      withdrawAmount,
      userAddress
    );

    return {
      to: this.poolAddress,
      data: withdrawData,
      value: '0',
      gasLimit: null,
      description: `Withdraw ${this._formatAmount(withdrawAmount, this.tokenDecimals)} ${this.config.symbolOfBestTokenToZapInOut} from Aave`,
    };
  }

  /**
   * Encode Aave withdraw function call
   * @param {string} asset - Asset address to withdraw
   * @param {BigNumber} amount - Amount to withdraw (use ethers.constants.MaxUint256 for max)
   * @param {string} to - Address to receive tokens
   * @returns {string} - Encoded function data
   * @private
   */
  _encodeWithdrawCall(asset, amount, to) {
    const poolInterface = new ethers.utils.Interface([
      'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
    ]);

    return poolInterface.encodeFunctionData('withdraw', [asset, amount, to]);
  }
}

module.exports = AaveProtocol;
