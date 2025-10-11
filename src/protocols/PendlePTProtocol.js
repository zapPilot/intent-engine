/**
 * PendlePTProtocol - Pendle Principal Token protocol implementation
 * Handles PT token minting and YT interaction on Pendle markets
 */

const BaseProtocolV2 = require('./BaseProtocolV2');
const { ethers } = require('ethers');

class PendlePTProtocol extends BaseProtocolV2 {
  constructor(config, chain, chainId) {
    super(config, chain, chainId);

    // Validate Pendle-specific configuration
    this._validatePendleConfig();

    // Initialize Pendle-specific properties
    this.marketAddress = config.marketAddress;
    this.ptTokenAddress = config.assetAddress;
    this.ytTokenAddress = config.ytAddress;
    this.underlyingTokenAddress = config.bestTokenAddressToZapOut;
    this.tokenDecimals = config.assetDecimals;

    // Pendle router addresses (chain-specific)
    this.routerAddresses = this._getPendleRouterAddresses();
  }

  /**
   * Generate deposit transaction for Pendle PT minting
   * @param {string} userAddress - User wallet address
   * @param {string} inputToken - Input token address
   * @param {BigInt|string} amount - Amount to deposit
   * @param {Object} additionalParams - Slippage and other params
   * @returns {Promise<Object>} - Deposit transaction object
   */
  getDepositTransaction(
    userAddress,
    inputToken,
    amount,
    additionalParams = {}
  ) {
    this._validateAddress(userAddress);
    this._validateAddress(inputToken);

    const depositAmount =
      typeof amount === 'bigint' ? amount : BigInt(amount.toString());

    if (depositAmount === 0n) {
      throw new Error('Deposit amount cannot be zero');
    }

    const slippage = additionalParams.slippage || 0.5;
    const deadline = this._getDeadline();

    // For Pendle, we need to mint PT+YT from underlying asset
    // This typically involves swapping to underlying asset first (if needed) then minting

    if (
      inputToken.toLowerCase() === this.underlyingTokenAddress.toLowerCase()
    ) {
      // Direct minting from underlying asset
      return this._getMintPTTransaction(
        userAddress,
        depositAmount,
        slippage,
        deadline
      );
    } else {
      // Need to swap first, then mint - this would typically be handled at executor level
      throw new Error(
        `Input token ${inputToken} requires swap to ${this.underlyingTokenAddress} before Pendle minting`
      );
    }
  }

  /**
   * Estimate gas for Pendle operations
   * @param {string} userAddress - User wallet address
   * @param {string} inputToken - Input token address
   * @param {BigInt|string} amount - Amount to process
   * @returns {Promise<Object>} - Gas estimates
   */
  estimateGas(_userAddress, _inputToken, _amount) {
    try {
      // Pendle operations are more gas-intensive due to market interactions
      const approvalGas = BigInt(50000);
      const mintPTGas = BigInt(400000); // PT minting is complex

      return {
        approval: {
          gasLimit: approvalGas,
          description: 'Approve underlying token',
        },
        deposit: {
          gasLimit: mintPTGas,
          description: 'Mint PT tokens via Pendle',
        },
        total: {
          gasLimit: approvalGas + mintPTGas,
          description: 'Total estimated gas for Pendle PT',
        },
      };
    } catch (error) {
      throw new Error(`Failed to estimate gas for Pendle: ${error.message}`);
    }
  }

  /**
   * Get Pendle-specific token requirements
   * @param {string} inputToken - Input token address
   * @returns {Promise<Object>} - Token requirements
   */
  getTokenRequirements(inputToken) {
    const baseRequirements = super.getTokenRequirements(inputToken);

    return {
      ...baseRequirements,
      protocolSpecific: {
        marketAddress: this.marketAddress,
        ptTokenAddress: this.ptTokenAddress,
        ytTokenAddress: this.ytTokenAddress,
        underlyingToken: this.underlyingTokenAddress,
        routerAddress: this.routerAddresses.router,
        requiresMarketInteraction: true,
      },
    };
  }

  /**
   * Validate Pendle-specific configuration
   * @private
   */
  _validatePendleConfig() {
    const required = [
      'marketAddress',
      'assetAddress',
      'ytAddress',
      'bestTokenAddressToZapOut',
      'assetDecimals',
      'symbolOfBestTokenToZapOut',
    ];

    const missing = required.filter(key => !this.config[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required Pendle config: ${missing.join(', ')}`);
    }

    // Validate addresses
    const addresses = [
      'marketAddress',
      'assetAddress',
      'ytAddress',
      'bestTokenAddressToZapOut',
    ];
    addresses.forEach(key => {
      if (!ethers.isAddress(this.config[key])) {
        throw new Error(`Invalid ${key}: ${this.config[key]}`);
      }
    });
  }

  /**
   * Get PT minting transaction
   * @param {string} userAddress - User address
   * @param {BigInt} amount - Amount to mint
   * @param {number} slippage - Slippage tolerance
   * @param {number} deadline - Transaction deadline
   * @returns {Object} - Mint transaction
   * @private
   */
  _getMintPTTransaction(userAddress, amount, slippage, deadline) {
    // Calculate minimum PT out with slippage
    const minPTOut = this._applySlippage(amount, slippage);

    // Encode mint transaction for Pendle Router
    const mintData = this._encodeMintPTCall(
      userAddress,
      this.marketAddress,
      amount,
      minPTOut,
      deadline
    );

    return {
      to: this.routerAddresses.router,
      data: mintData,
      value: '0',
      gasLimit: null,
      description: `Mint PT tokens from ${this._formatAmount(amount, this.tokenDecimals)} ${this.config.symbolOfBestTokenToZapOut}`,
    };
  }

  /**
   * Encode Pendle PT minting call
   * @param {string} receiver - Address to receive PT+YT
   * @param {string} market - Market address
   * @param {BigInt} netTokenIn - Amount of underlying token
   * @param {BigInt} minPTOut - Minimum PT tokens to receive
   * @param {number} deadline - Transaction deadline
   * @returns {string} - Encoded function data
   * @private
   */
  _encodeMintPTCall(receiver, market, netTokenIn, minPTOut, _deadline) {
    // Simplified Pendle Router interface for PT minting
    const routerInterface = new ethers.Interface([
      'function mintPyFromToken(address receiver, address market, uint256 minPyOut, (address tokenIn, uint256 netTokenIn, address tokenMintSy, address pendleSwap, (uint8 swapType, address extRouter, bytes extCalldata, bool needScale) swapData)) returns (uint256 netPyOut, uint256 netSyFee)',
    ]);

    // Simplified parameters - in practice this would need more complex swap data
    const tokenInput = {
      tokenIn: this.underlyingTokenAddress,
      netTokenIn: netTokenIn,
      tokenMintSy: this.underlyingTokenAddress,
      pendleSwap: ethers.ZeroAddress,
      swapData: {
        swapType: 0,
        extRouter: ethers.ZeroAddress,
        extCalldata: '0x',
        needScale: false,
      },
    };

    return routerInterface.encodeFunctionData('mintPyFromToken', [
      receiver,
      market,
      minPTOut,
      tokenInput,
    ]);
  }

  /**
   * Get chain-specific Pendle router addresses
   * @returns {Object} - Router addresses
   * @private
   */
  _getPendleRouterAddresses() {
    const addresses = {
      1: {
        // Ethereum
        router: '0x888888888889758F76e7103c6CbF23ABbF58F946',
      },
      42161: {
        // Arbitrum
        router: '0x888888888889758F76e7103c6CbF23ABbF58F946',
      },
      8453: {
        // Base
        router: '0x888888888889758F76e7103c6CbF23ABbF58F946',
      },
    };

    if (!addresses[this.chainId]) {
      throw new Error(`Pendle not supported on chain ${this.chainId}`);
    }

    return addresses[this.chainId];
  }

  /**
   * Get Pendle protocol info with market details
   * @returns {Object} - Extended protocol info
   */
  getProtocolInfo() {
    const baseInfo = super.getProtocolInfo();

    return {
      ...baseInfo,
      protocol: 'Pendle',
      version: 'V2',
      type: 'Principal Token',
      maturity: null, // Could extract from market
      currentAPY: null, // Could fetch from Pendle API
      impliedAPY: null, // Could calculate from market prices
      addresses: {
        market: this.marketAddress,
        pt: this.ptTokenAddress,
        yt: this.ytTokenAddress,
        underlying: this.underlyingTokenAddress,
        router: this.routerAddresses.router,
      },
    };
  }

  /**
   * Get redemption transaction (for matured PT)
   * @param {string} userAddress - User wallet address
   * @param {BigInt|string} amount - PT amount to redeem
   * @returns {Promise<Object>} - Redemption transaction
   */
  getRedemptionTransaction(userAddress, amount) {
    this._validateAddress(userAddress);

    const redeemAmount =
      typeof amount === 'bigint' ? amount : BigInt(amount.toString());

    const redeemData = this._encodeRedeemPTCall(
      userAddress,
      this.marketAddress,
      redeemAmount
    );

    return {
      to: this.routerAddresses.router,
      data: redeemData,
      value: '0',
      gasLimit: null,
      description: `Redeem ${this._formatAmount(redeemAmount, this.tokenDecimals)} PT tokens`,
    };
  }

  /**
   * Encode PT redemption call
   * @param {string} receiver - Address to receive underlying tokens
   * @param {string} market - Market address
   * @param {BigInt} netPyIn - Amount of PT to redeem
   * @returns {string} - Encoded function data
   * @private
   */
  _encodeRedeemPTCall(receiver, market, netPyIn) {
    const routerInterface = new ethers.Interface([
      'function redeemPyToToken(address receiver, address market, uint256 netPyIn, (address tokenOut, uint256 minTokenOut, address tokenRedeemSy, address pendleSwap, (uint8 swapType, address extRouter, bytes extCalldata, bool needScale) swapData)) returns (uint256 netTokenOut, uint256 netSyFee)',
    ]);

    const tokenOutput = {
      tokenOut: this.underlyingTokenAddress,
      minTokenOut: 0n, // Would calculate based on slippage
      tokenRedeemSy: this.underlyingTokenAddress,
      pendleSwap: ethers.ZeroAddress,
      swapData: {
        swapType: 0,
        extRouter: ethers.ZeroAddress,
        extCalldata: '0x',
        needScale: false,
      },
    };

    return routerInterface.encodeFunctionData('redeemPyToToken', [
      receiver,
      market,
      netPyIn,
      tokenOutput,
    ]);
  }
}

module.exports = PendlePTProtocol;
