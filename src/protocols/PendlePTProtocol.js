/**
 * PendlePTProtocol - Pendle Principal Token protocol implementation
 * Handles PT token minting and YT interaction on Pendle markets
 */

const BaseProtocolV2 = require('./BaseProtocolV2');
const { ethers } = require('ethers');
const axios = require('axios');
const UNIFIED_ZAP_CONFIG = require('../config/unifiedZapConfig');

const PENDLE_CORE_API_BASE = 'https://api-v2.pendle.finance/core/v1';
const PENDLE_SDK_API_BASE = `${PENDLE_CORE_API_BASE}/sdk`;
const DEFAULT_SWAP_EXTRA_GAS = 600000n;
const DEFAULT_REDEEM_EXTRA_GAS = 750000n;
const PENDLE_MARKET_ABI = ['function isExpired() view returns (bool)'];

const PROVIDER_CACHE = new Map();

function resolveRpcUrl(chain, chainId) {
  if (chain && UNIFIED_ZAP_CONFIG.SUPPORTED_CHAINS?.[chain]?.rpcUrl) {
    return UNIFIED_ZAP_CONFIG.SUPPORTED_CHAINS[chain].rpcUrl;
  }

  if (chainId) {
    const match = Object.values(UNIFIED_ZAP_CONFIG.SUPPORTED_CHAINS || {}).find(
      config => config.chainId === chainId
    );
    if (match?.rpcUrl) {
      return match.rpcUrl;
    }
  }

  return null;
}

function getRpcProvider(chain, chainId) {
  const cacheKey = chainId || chain;
  if (cacheKey && PROVIDER_CACHE.has(cacheKey)) {
    return PROVIDER_CACHE.get(cacheKey);
  }

  const rpcUrl = resolveRpcUrl(chain, chainId);

  if (!rpcUrl) {
    throw new Error(
      `No RPC URL configured for Pendle chain ${chain ?? 'unknown'} (${chainId ?? 'n/a'})`
    );
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  if (cacheKey) {
    PROVIDER_CACHE.set(cacheKey, provider);
  }
  return provider;
}

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
    this.assetDecimals = config.assetDecimals;
    this.bestTokenAddress = config.bestTokenAddressToZapOut;
    this.bestTokenSymbol = config.symbolOfBestTokenToZapOut;
    this.bestTokenDecimals = config.decimalOfBestTokenToZapOut;

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
  async getDepositTransaction(
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

    if (
      inputToken.toLowerCase() !== this.underlyingTokenAddress.toLowerCase()
    ) {
      throw new Error(
        `Input token ${inputToken} must match underlying token ${this.underlyingTokenAddress} for Pendle deposit`
      );
    }

    const isExpired = await this._isMarketExpired();
    if (isExpired) {
      throw new Error(
        `Pendle market ${this.marketAddress} is expired and cannot accept deposits`
      );
    }

    const normalizedSlippage = this._normalizePendleSlippage(
      additionalParams.slippage
    );

    const swapQuote = await this._fetchPendleSwapQuote({
      receiver: userAddress,
      tokenIn: this.underlyingTokenAddress,
      tokenOut: this.ptTokenAddress,
      amountIn: depositAmount,
      slippage: normalizedSlippage,
    });

    const latestPendleAssetPrice = await this._fetchPendleAssetPrice();

    const baseTx = this._buildTransactionFromPendleQuote(swapQuote, {
      defaultExtraGas: DEFAULT_SWAP_EXTRA_GAS,
    });

    return {
      ...baseTx,
      description: `Swap ${this._formatAmount(
        depositAmount,
        this.bestTokenDecimals
      )} ${this.bestTokenSymbol.toUpperCase()} into Pendle PT`,
      meta: {
        ...baseTx.meta,
        quoteType: 'swapDeposit',
        tokenIn: this.underlyingTokenAddress,
        tokenOut: this.ptTokenAddress,
        amountIn: depositAmount.toString(),
        estimatedAmountOut: swapQuote?.data?.amountOut ?? null,
        slippage: normalizedSlippage,
        latestPendleAssetPrice,
      },
    };
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
      'decimalOfBestTokenToZapOut',
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

    if (
      !Number.isInteger(this.config.assetDecimals) ||
      this.config.assetDecimals < 0
    ) {
      throw new Error(`Invalid assetDecimals: ${this.config.assetDecimals}`);
    }

    if (
      !Number.isInteger(this.config.decimalOfBestTokenToZapOut) ||
      this.config.decimalOfBestTokenToZapOut < 0
    ) {
      throw new Error(
        `Invalid decimalOfBestTokenToZapOut: ${this.config.decimalOfBestTokenToZapOut}`
      );
    }
  }

  _getRpcProviderInstance() {
    if (!this._rpcProvider) {
      this._rpcProvider = getRpcProvider(this.chain, this.chainId);
    }
    return this._rpcProvider;
  }

  _getMarketContract() {
    if (!this._marketContract) {
      this._marketContract = new ethers.Contract(
        this.marketAddress,
        PENDLE_MARKET_ABI,
        this._getRpcProviderInstance()
      );
    }
    return this._marketContract;
  }

  async _isMarketExpired() {
    try {
      const contract = this._getMarketContract();
      return await contract.isExpired();
    } catch (error) {
      throw new Error(
        `Failed to check Pendle market expiry: ${this._extractPendleError(error)}`
      );
    }
  }

  _normalizePendleSlippage(slippage) {
    const numeric =
      slippage === undefined || slippage === null ? 0.5 : Number(slippage);

    if (!Number.isFinite(numeric)) {
      throw new Error(`Invalid slippage value for Pendle: ${slippage}`);
    }

    const bounded = Math.min(Math.max(numeric, 0), 100);
    return bounded / 100;
  }

  async _fetchPendleSwapQuote({
    receiver,
    tokenIn,
    tokenOut,
    amountIn,
    slippage,
  }) {
    try {
      const response = await axios.get(
        `${PENDLE_SDK_API_BASE}/${this.chainId}/markets/${this.marketAddress}/swap`,
        {
          params: {
            receiver,
            slippage,
            enableAggregator: true,
            tokenIn,
            tokenOut,
            amountIn: this._toApiAmount(amountIn),
          },
        }
      );

      if (!response.data?.tx) {
        throw new Error('Missing transaction data in Pendle swap response');
      }

      return response.data;
    } catch (error) {
      throw new Error(
        `Pendle swap quote failed: ${this._extractPendleError(error)}`
      );
    }
  }

  async _fetchPendleRedeemQuote({ receiver, tokenOut, amountIn, slippage }) {
    try {
      const response = await axios.get(
        `${PENDLE_SDK_API_BASE}/${this.chainId}/redeem`,
        {
          params: {
            receiver,
            slippage,
            enableAggregator: true,
            yt: this.ytTokenAddress,
            tokenOut,
            amountIn: this._toApiAmount(amountIn),
          },
        }
      );

      if (!response.data?.tx) {
        throw new Error('Missing transaction data in Pendle redeem response');
      }

      return response.data;
    } catch (error) {
      throw new Error(
        `Pendle redeem quote failed: ${this._extractPendleError(error)}`
      );
    }
  }

  async _fetchPendleAssetPrice() {
    try {
      const response = await axios.get(
        `${PENDLE_CORE_API_BASE}/${this.chainId}/assets/prices`,
        {
          params: {
            addresses: this.ptTokenAddress,
            skip: 0,
          },
        }
      );

      const priceMap = response.data?.prices || {};
      const key = this.ptTokenAddress.toLowerCase();

      if (priceMap[key] === undefined) {
        throw new Error(
          `Price for ${this.ptTokenAddress} not found in Pendle response`
        );
      }

      const rawPrice = Number(priceMap[key]);
      if (!Number.isFinite(rawPrice)) {
        throw new Error(
          `Invalid price value returned for ${this.ptTokenAddress}: ${priceMap[key]}`
        );
      }

      return rawPrice / Math.pow(10, this.assetDecimals);
    } catch (error) {
      throw new Error(
        `Pendle asset price fetch failed: ${this._extractPendleError(error)}`
      );
    }
  }

  _buildTransactionFromPendleQuote(quote, { defaultExtraGas }) {
    const tx = quote?.tx;
    if (!tx?.to || !tx?.data) {
      throw new Error('Pendle quote missing target transaction data');
    }

    const gasLimit = this._computeGasLimit(
      tx.gas ?? tx.gasLimit,
      defaultExtraGas
    );

    return {
      to: tx.to,
      data: tx.data,
      value: this._normalizeTxValue(tx.value),
      gasLimit,
      meta: {
        raw: quote,
      },
    };
  }

  _computeGasLimit(baseGas, extraGas = 0n) {
    let gas = null;

    if (baseGas !== undefined && baseGas !== null) {
      try {
        gas = this._toBigInt(baseGas);
      } catch (error) {
        console.warn('Unable to parse Pendle gas estimate:', error);
      }
    }

    if (extraGas && extraGas > 0n) {
      gas = (gas ?? 0n) + extraGas;
    }

    return gas;
  }

  _toApiAmount(amount) {
    if (typeof amount === 'bigint') {
      return amount.toString();
    }
    if (typeof amount === 'number') {
      return BigInt(Math.floor(amount)).toString();
    }
    if (typeof amount === 'string') {
      return amount;
    }
    if (amount && typeof amount.toString === 'function') {
      return amount.toString();
    }
    throw new Error(`Unsupported amount type for Pendle API: ${amount}`);
  }

  _toBigInt(value) {
    if (typeof value === 'bigint') {
      return value;
    }
    if (typeof value === 'number') {
      return BigInt(Math.floor(value));
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
        return BigInt(trimmed);
      }
      return BigInt(trimmed);
    }
    throw new Error(`Cannot convert value to BigInt: ${value}`);
  }

  _normalizeTxValue(value) {
    if (value === undefined || value === null) {
      return '0';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'number') {
      return Math.max(value, 0).toString();
    }
    return value.toString();
  }

  _extractPendleError(error) {
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    if (error.response?.data?.error) {
      return error.response.data.error;
    }
    if (error.response?.status) {
      return `status ${error.response.status}`;
    }
    return error.message || 'unknown error';
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

  getAssetPrice() {
    return this._fetchPendleAssetPrice();
  }

  /**
   * Get redemption transaction (swap or redeem depending on market state)
   * @param {string} userAddress - User wallet address
   * @param {BigInt|string} amount - PT amount to process
   * @param {Object} additionalParams - Options (slippage, isExpired override)
   * @returns {Promise<Object>} - Redemption transaction
   */
  async getRedemptionTransaction(userAddress, amount, additionalParams = {}) {
    this._validateAddress(userAddress);

    const redeemAmount =
      typeof amount === 'bigint' ? amount : BigInt(amount.toString());

    if (redeemAmount === 0n) {
      throw new Error('Redeem amount cannot be zero');
    }

    const normalizedSlippage = this._normalizePendleSlippage(
      additionalParams.slippage
    );
    const receiver = additionalParams.receiver || userAddress;
    const isExpired =
      typeof additionalParams.isExpired === 'boolean'
        ? additionalParams.isExpired
        : await this._isMarketExpired();

    if (isExpired) {
      const redeemQuote = await this._fetchPendleRedeemQuote({
        receiver,
        tokenOut: this.bestTokenAddress,
        amountIn: redeemAmount,
        slippage: normalizedSlippage,
      });

      const baseTx = this._buildTransactionFromPendleQuote(redeemQuote, {
        defaultExtraGas: DEFAULT_REDEEM_EXTRA_GAS,
      });

      return {
        ...baseTx,
        description: `Redeem ${this._formatAmount(
          redeemAmount,
          this.tokenDecimals
        )} PT into ${this.bestTokenSymbol.toUpperCase()}`,
        meta: {
          ...baseTx.meta,
          quoteType: 'redeem',
          tokenIn: this.ptTokenAddress,
          tokenOut: this.bestTokenAddress,
          amountIn: redeemAmount.toString(),
          slippage: normalizedSlippage,
          isExpired: true,
        },
      };
    }

    const swapQuote = await this._fetchPendleSwapQuote({
      receiver,
      tokenIn: this.ptTokenAddress,
      tokenOut: this.bestTokenAddress,
      amountIn: redeemAmount,
      slippage: normalizedSlippage,
    });

    const latestPendleAssetPrice = await this._fetchPendleAssetPrice();

    const baseTx = this._buildTransactionFromPendleQuote(swapQuote, {
      defaultExtraGas: DEFAULT_REDEEM_EXTRA_GAS,
    });

    return {
      ...baseTx,
      description: `Swap ${this._formatAmount(
        redeemAmount,
        this.tokenDecimals
      )} PT into ${this.bestTokenSymbol.toUpperCase()}`,
      meta: {
        ...baseTx.meta,
        quoteType: 'swapRedeem',
        tokenIn: this.ptTokenAddress,
        tokenOut: this.bestTokenAddress,
        amountIn: redeemAmount.toString(),
        estimatedAmountOut: swapQuote?.data?.amountOut ?? null,
        slippage: normalizedSlippage,
        latestPendleAssetPrice,
        isExpired: false,
      },
    };
  }
}

module.exports = PendlePTProtocol;
