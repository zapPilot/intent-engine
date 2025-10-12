/**
 * VelodromeProtocol - Velodrome/Aerodrome LP protocol implementation
 * Handles liquidity provision and gauge staking on Velodrome/Aerodrome DEX
 */

const BaseProtocolV2 = require('./BaseProtocolV2');
const { ethers } = require('ethers');

const STABLE_TOKEN_SYMBOLS = new Set([
  'usdc',
  'usdt',
  'dai',
  'susd',
  'msusd',
  'eurc',
  'usdx',
  'susdx',
  'gusdc',
  'usdbc',
  'usdce',
  'usdp',
  'usd+',
  'bold',
]);

class VelodromeProtocol extends BaseProtocolV2 {
  constructor(config, chain, chainId) {
    super(config, chain, chainId);

    // Validate Velodrome-specific configuration
    this._validateVelodromeConfig();

    // Initialize Velodrome-specific properties
    this.routerAddress = config.routerAddress;
    this.gaugeAddress = config.guageAddress; // Note: using config spelling
    this.lpTokenAddress = config.assetAddress;
    this.lpTokens = config.lpTokens; // [[symbol, address, decimals], ...]
    this.rewards = config.rewards || [];
    this.protocolName = config.protocolName || 'velodrome';
    this.protocolVersion = config.protocolVersion || 'v2';

    // Extract token information
    this.token0 = {
      symbol: this.lpTokens[0][0],
      address: this.lpTokens[0][1],
      decimals: this.lpTokens[0][2],
    };
    this.token1 = {
      symbol: this.lpTokens[1][0],
      address: this.lpTokens[1][1],
      decimals: this.lpTokens[1][2],
    };

    this.isStablePool =
      typeof config.isStablePool === 'boolean'
        ? config.isStablePool
        : this._inferStablePoolFromSymbols();
  }

  /**
   * Generate deposit transaction for Velodrome LP provision
   * @param {string} userAddress - User wallet address
   * @param {string} inputToken - Input token address
   * @param {BigInt|string} amount - Amount to deposit
   * @param {Object} additionalParams - Token amounts and slippage
   * @returns {Promise<Object>} - Deposit transaction object
   */
  getDepositTransaction(
    userAddress,
    inputToken,
    amount,
    additionalParams = {}
  ) {
    this._validateAddress(userAddress);

    const { token0Amount, token1Amount, slippage } = additionalParams;

    if (!token0Amount || !token1Amount) {
      throw new Error(
        'LP provision requires both token0Amount and token1Amount'
      );
    }

    const amount0 =
      typeof token0Amount === 'bigint'
        ? token0Amount
        : BigInt(token0Amount.toString());

    const amount1 =
      typeof token1Amount === 'bigint'
        ? token1Amount
        : BigInt(token1Amount.toString());

    if (amount0 === 0n || amount1 === 0n) {
      throw new Error('Both token amounts must be greater than zero');
    }

    const effectiveSlippage = this._resolveDepositSlippage(slippage);

    // Calculate minimum amounts with slippage buffer
    const minAmount0 = this._applySlippage(amount0, effectiveSlippage);
    const minAmount1 = this._applySlippage(amount1, effectiveSlippage);
    const deadline = this._getDeadline();

    // Check if tokens are sorted correctly for Velodrome
    const [
      sortedToken0,
      sortedToken1,
      sortedAmount0,
      sortedAmount1,
      sortedMin0,
      sortedMin1,
    ] = this._sortTokens(
      this.token0.address,
      this.token1.address,
      amount0,
      amount1,
      minAmount0,
      minAmount1
    );

    const isStablePool = this._isStablePool();

    const addLiquidityData = this._encodeAddLiquidityCall(
      sortedToken0,
      sortedToken1,
      isStablePool,
      sortedAmount0,
      sortedAmount1,
      sortedMin0,
      sortedMin1,
      userAddress,
      deadline
    );

    return {
      to: this.routerAddress,
      data: addLiquidityData,
      value: '0',
      gasLimit: null,
      description: `Add liquidity to ${this.token0.symbol}/${this.token1.symbol} pool`,
    };
  }

  /**
   * Generate staking transaction for LP tokens in gauge
   * @param {string} userAddress - User wallet address
   * @param {BigInt|string} lpAmount - LP token amount to stake
   * @returns {Promise<Object>} - Staking transaction
   */
  getStakingTransaction(userAddress, lpAmount) {
    this._validateAddress(userAddress);

    const stakeAmount =
      typeof lpAmount === 'bigint' ? lpAmount : BigInt(lpAmount.toString());

    if (stakeAmount === 0n) {
      throw new Error('Stake amount cannot be zero');
    }

    const stakeData = this._encodeStakeCall(stakeAmount);

    return {
      to: this.gaugeAddress,
      data: stakeData,
      value: '0',
      gasLimit: null,
      description: `Stake ${this._formatAmount(stakeAmount, 18)} LP tokens in gauge`,
    };
  }

  /**
   * Estimate gas for Velodrome operations
   * @param {string} userAddress - User wallet address
   * @param {string} inputToken - Input token address
   * @param {BigInt|string} amount - Amount to process
   * @returns {Promise<Object>} - Gas estimates
   */
  estimateGas(_userAddress, _inputToken, _amount) {
    try {
      // LP operations require multiple approvals and higher gas
      const token0ApprovalGas = BigInt(50000);
      const token1ApprovalGas = BigInt(50000);
      const addLiquidityGas = BigInt(300000);
      const stakeGas = BigInt(150000);

      return {
        approvals: {
          gasLimit: token0ApprovalGas + token1ApprovalGas,
          description: 'Approve both LP tokens',
        },
        addLiquidity: {
          gasLimit: addLiquidityGas,
          description: 'Add liquidity to pool',
        },
        stake: {
          gasLimit: stakeGas,
          description: 'Stake LP tokens in gauge',
        },
        total: {
          gasLimit:
            token0ApprovalGas + token1ApprovalGas + addLiquidityGas + stakeGas,
          description: 'Total estimated gas for LP + staking',
        },
      };
    } catch (error) {
      throw new Error(`Failed to estimate gas for Velodrome: ${error.message}`);
    }
  }

  /**
   * Get Velodrome-specific token requirements
   * @param {string} inputToken - Input token address
   * @returns {Promise<Object>} - Token requirements
   */
  getTokenRequirements(inputToken) {
    const baseRequirements = super.getTokenRequirements(inputToken);

    return {
      ...baseRequirements,
      protocolSpecific: {
        routerAddress: this.routerAddress,
        gaugeAddress: this.gaugeAddress,
        lpTokenAddress: this.lpTokenAddress,
        token0: this.token0,
        token1: this.token1,
        isStablePool: this._isStablePool(),
        requiresBothTokens: true,
        rewards: this.rewards,
      },
    };
  }

  /**
   * Validate Velodrome-specific configuration
   * @private
   */
  _validateVelodromeConfig() {
    const required = [
      'routerAddress',
      'guageAddress', // Note: using config spelling
      'assetAddress',
      'lpTokens',
    ];

    const missing = required.filter(key => !this.config[key]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required Velodrome config: ${missing.join(', ')}`
      );
    }

    // Validate LP tokens array
    if (
      !Array.isArray(this.config.lpTokens) ||
      this.config.lpTokens.length !== 2
    ) {
      throw new Error('lpTokens must be an array of exactly 2 tokens');
    }

    // Validate each LP token format
    this.config.lpTokens.forEach((token, index) => {
      if (!Array.isArray(token) || token.length !== 3) {
        throw new Error(
          `lpTokens[${index}] must be [symbol, address, decimals]`
        );
      }

      const [symbol, address, decimals] = token;
      if (!symbol || typeof symbol !== 'string') {
        throw new Error(`Invalid symbol for lpTokens[${index}]: ${symbol}`);
      }

      if (!ethers.isAddress(address)) {
        throw new Error(`Invalid address for lpTokens[${index}]: ${address}`);
      }

      if (!Number.isInteger(decimals) || decimals < 0) {
        throw new Error(`Invalid decimals for lpTokens[${index}]: ${decimals}`);
      }
    });

    // Validate addresses
    const addresses = ['routerAddress', 'guageAddress', 'assetAddress'];
    addresses.forEach(key => {
      if (!ethers.isAddress(this.config[key])) {
        throw new Error(`Invalid ${key}: ${this.config[key]}`);
      }
    });
  }

  /**
   * Determine effective slippage buffer for LP deposits.
   * Applies a more conservative floor for stable pools to mirror v1 behavior.
   * @param {number} slippage - Requested slippage percentage (e.g. 0.5 for 0.5%)
   * @returns {number} - Slippage percentage to apply
   * @private
   */
  _resolveDepositSlippage(slippage) {
    const numericSlippage =
      slippage === undefined || slippage === null
        ? undefined
        : Number(slippage);

    const baseSlippage = Number.isFinite(numericSlippage)
      ? numericSlippage
      : 0.5;

    const sanitizedSlippage = Math.max(baseSlippage, 0);

    if (this._isStablePool()) {
      const configuredMinimum =
        typeof this.config.minStableDepositSlippage === 'number'
          ? this.config.minStableDepositSlippage
          : 20;

      return Math.max(sanitizedSlippage, configuredMinimum);
    }

    return sanitizedSlippage;
  }

  /**
   * Determine if this configuration targets a stable pool.
   * @returns {boolean}
   * @private
   */
  _isStablePool() {
    return !!this.isStablePool;
  }

  /**
   * Infer whether the pool should be treated as stable using token symbols.
   * @returns {boolean}
   * @private
   */
  _inferStablePoolFromSymbols() {
    const token0Symbol = (this.token0.symbol || '').toLowerCase();
    const token1Symbol = (this.token1.symbol || '').toLowerCase();

    if (!token0Symbol || !token1Symbol) {
      return false;
    }

    return (
      STABLE_TOKEN_SYMBOLS.has(token0Symbol) &&
      STABLE_TOKEN_SYMBOLS.has(token1Symbol)
    );
  }

  /**
   * Sort tokens according to Velodrome requirements
   * @param {string} tokenA - Token A address
   * @param {string} tokenB - Token B address
   * @param {BigInt} amountA - Amount A
   * @param {BigInt} amountB - Amount B
   * @param {BigInt} minA - Min amount A
   * @param {BigInt} minB - Min amount B
   * @returns {Array} - Sorted tokens and amounts
   * @private
   */
  _sortTokens(tokenA, tokenB, amountA, amountB, minA, minB) {
    const token0IsA = tokenA.toLowerCase() < tokenB.toLowerCase();

    if (token0IsA) {
      return [tokenA, tokenB, amountA, amountB, minA, minB];
    } else {
      return [tokenB, tokenA, amountB, amountA, minB, minA];
    }
  }

  /**
   * Encode add liquidity call for Velodrome router
   * @param {string} tokenA - Token A address
   * @param {string} tokenB - Token B address
   * @param {boolean} stable - Whether pool is stable
   * @param {BigInt} amountADesired - Desired amount A
   * @param {BigInt} amountBDesired - Desired amount B
   * @param {BigInt} amountAMin - Minimum amount A
   * @param {BigInt} amountBMin - Minimum amount B
   * @param {string} to - Recipient address
   * @param {number} deadline - Transaction deadline
   * @returns {string} - Encoded function data
   * @private
   */
  _encodeAddLiquidityCall(
    tokenA,
    tokenB,
    stable,
    amountADesired,
    amountBDesired,
    amountAMin,
    amountBMin,
    to,
    deadline
  ) {
    const routerInterface = new ethers.Interface([
      'function addLiquidity(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)',
    ]);

    return routerInterface.encodeFunctionData('addLiquidity', [
      tokenA,
      tokenB,
      stable,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      to,
      deadline,
    ]);
  }

  /**
   * Encode stake call for gauge contract
   * @param {BigInt} amount - Amount to stake
   * @returns {string} - Encoded function data
   * @private
   */
  _encodeStakeCall(amount) {
    const gaugeInterface = new ethers.Interface([
      'function deposit(uint256 amount)',
    ]);

    return gaugeInterface.encodeFunctionData('deposit', [amount]);
  }

  /**
   * Get Velodrome protocol info
   * @returns {Object} - Extended protocol info
   */
  getProtocolInfo() {
    const baseInfo = super.getProtocolInfo();

    return {
      ...baseInfo,
      protocol: this.protocolName === 'aerodrome' ? 'Aerodrome' : 'Velodrome',
      version: this.protocolVersion,
      type: 'Liquidity Pool',
      poolType: this._isStablePool() ? 'Stable' : 'Volatile',
      tokens: [this.token0, this.token1],
      rewards: this.rewards,
      addresses: {
        router: this.routerAddress,
        gauge: this.gaugeAddress,
        lpToken: this.lpTokenAddress,
      },
    };
  }

  /**
   * Get required approvals for LP provision
   * @param {string} userAddress - User address
   * @param {BigInt} amount0 - Token 0 amount
   * @param {BigInt} amount1 - Token 1 amount
   * @returns {Array} - Array of approval transactions
   */
  async getRequiredApprovals(userAddress, amount0, amount1) {
    const approvals = [];

    // Approve token0
    if (amount0 !== 0n) {
      approvals.push(
        await this.getApprovalTransaction(
          userAddress,
          this.token0.address,
          this.routerAddress,
          amount0
        )
      );
    }

    // Approve token1
    if (amount1 !== 0n) {
      approvals.push(
        await this.getApprovalTransaction(
          userAddress,
          this.token1.address,
          this.routerAddress,
          amount1
        )
      );
    }

    return approvals;
  }

  /**
   * Calculate token amounts for balanced LP provision
   * @param {BigInt} totalValue - Total USD value to invest
   * @param {Object} tokenPrices - Token price mapping
   * @returns {Object} - Calculated token amounts
   */
  calculateTokenAmounts(totalValue, tokenPrices) {
    const token0Price = tokenPrices[this.token0.symbol.toLowerCase()];
    const token1Price = tokenPrices[this.token1.symbol.toLowerCase()];

    if (!token0Price || !token1Price) {
      throw new Error(
        `Missing price data for ${this.token0.symbol} or ${this.token1.symbol}`
      );
    }

    // Simple 50/50 split for LP provision
    const halfValue = totalValue / 2n;

    const token0Amount =
      (halfValue * ethers.parseUnits('1', this.token0.decimals)) /
      ethers.parseUnits(token0Price.toString(), 18);

    const token1Amount =
      (halfValue * ethers.parseUnits('1', this.token1.decimals)) /
      ethers.parseUnits(token1Price.toString(), 18);

    return {
      token0Amount,
      token1Amount,
      token0Value: halfValue,
      token1Value: halfValue,
    };
  }
}

module.exports = VelodromeProtocol;
