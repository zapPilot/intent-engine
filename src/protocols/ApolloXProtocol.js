/**
 * ApolloXProtocol - ApolloX ALP (Arbitrum Liquidity Pool) protocol implementation
 * Handles ALP minting and burning on Arbitrum
 * Note: ALP is staked on PancakeSwap for additional yield
 */

const BaseProtocolV2 = require('./BaseProtocolV2');
const { ethers } = require('ethers');
const axios = require('axios');

// ApolloX constants
const APOLLOX_ALP_PRICE_API = 'https://www.apollox.finance/bapi/futures/v1/public/future/symbol/history-price';
const DEFAULT_MINT_GAS = 400000n; // ~400k gas for minting ALP
const DEFAULT_BURN_GAS = 350000n; // ~350k gas for burning ALP
const HARDCODED_PROTOCOL_FEE = 0.003; // 0.3% protocol fee

class ApolloXProtocol extends BaseProtocolV2 {
    constructor(config, chain, chainId) {
        super(config, chain, chainId);

        // Validate ApolloX-specific configuration
        this._validateApolloXConfig();

        // Initialize ApolloX-specific properties
        this.alpTokenAddress = config.assetAddress; // ALP token
        this.vaultAddress = config.protocolAddress; // ApolloX vault
        this.assetDecimals = config.assetDecimals || 18;

        // Default zap token (USDC bridged on Arbitrum)
        this.defaultZapToken = config.zapInOutTokenAddress || '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8'; // USDC.e
        this.defaultZapTokenDecimals = config.assetDecimals || 6;

        // Optional: PancakeSwap staking (currently not active based on frontend code)
        this.stakeFarmAddress = config.stakeFarmAddress || null;
        this.stakingEnabled = config.stakingEnabled || false;
    }

    /**
     * Generate deposit transaction for ALP minting
     * @param {string} userAddress - User wallet address
     * @param {string} inputToken - Input token address (should be stablecoin)
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

        // Get current ALP price
        const alpPrice = await this._fetchAlpPrice();

        // Get slippage from params or use default (0.5%)
        const slippage = additionalParams.slippage || 0.5;

        // Get token prices for USD calculation
        const tokenPrices = additionalParams.tokenPrices || {};
        const inputTokenSymbol = additionalParams.inputTokenSymbol || 'usdc';
        const inputTokenPrice = tokenPrices[inputTokenSymbol] || 1.0; // Default to 1.0 for stablecoins

        // Calculate USD value of input
        const inputTokenDecimals = this._getTokenDecimals(inputToken);
        const inputUsdValue = this._calculateUsdValue(
            depositAmount,
            inputTokenPrice,
            inputTokenDecimals
        );

        // Calculate expected ALP amount using BigInt arithmetic to avoid overflow
        // Convert prices to scaled integers for BigInt calculation
        const alpPriceScaled = BigInt(Math.floor(alpPrice * 1e18)); // Scale price by 1e18
        const inputUsdValueScaled = BigInt(Math.floor(inputUsdValue * 1e18)); // Scale USD value by 1e18

        // estimatedAlpAmount = inputUsdValue / alpPrice (in ALP decimals)
        // Using BigInt: (inputUsdValueScaled * 10^assetDecimals) / alpPriceScaled / 10^18
        const estimatedAlpAmountBigInt = (inputUsdValueScaled * BigInt(Math.pow(10, this.assetDecimals))) / alpPriceScaled;

        // Apply slippage: minAlpAmount = estimatedAlpAmount * (100 - slippage) / 100
        const slippageFactor = BigInt(Math.floor((100 - slippage) * 100)); // Scale by 100 for precision
        const minAlpAmountBigInt = (estimatedAlpAmountBigInt * slippageFactor) / 10000n;

        // For logging/meta - convert to number
        const estimatedAlpAmount = Number(estimatedAlpAmountBigInt) / Math.pow(10, this.assetDecimals);
        const minAlpAmount = Number(minAlpAmountBigInt) / Math.pow(10, this.assetDecimals);

        // Encode mintAlp function call with BigInt value
        const mintData = this._encodeMintAlp(
            inputToken,
            depositAmount,
            minAlpAmountBigInt,
            false // auto compound flag
        );

        // Calculate protocol fee impact
        const tradingLoss = -inputUsdValue * HARDCODED_PROTOCOL_FEE;

        return {
            to: this.vaultAddress,
            data: mintData,
            value: '0',
            gasLimit: DEFAULT_MINT_GAS,
            description: `Mint ALP with ${this._formatAmount(depositAmount, inputTokenDecimals)} ${inputTokenSymbol.toUpperCase()}`,
            meta: {
                protocol: 'ApolloX',
                operation: 'mintAlp',
                inputToken,
                inputAmount: depositAmount.toString(),
                inputUsdValue,
                estimatedAlpAmount,
                minAlpAmount: minAlpAmountBigInt.toString(),
                alpPrice,
                slippage,
                protocolFee: HARDCODED_PROTOCOL_FEE,
                tradingLoss,
            },
        };
    }

    /**
     * Generate withdrawal transaction for ALP burning
     * @param {string} userAddress - User wallet address
     * @param {BigInt|string} amount - ALP amount to burn
     * @param {Object} additionalParams - Slippage, output token, etc.
     * @returns {Promise<Object>} - Withdrawal transaction object
     */
    async getWithdrawalTransaction(userAddress, amount, additionalParams = {}) {
        this._validateAddress(userAddress);

        const burnAmount =
            typeof amount === 'bigint' ? amount : BigInt(amount.toString());

        if (burnAmount === 0n) {
            throw new Error('Burn amount cannot be zero');
        }

        // Get current ALP price
        const alpPrice = await this._fetchAlpPrice();

        // Get slippage from params or use default (0.5%)
        const slippage = additionalParams.slippage || 0.5;

        // Output token (default to USDC.e)
        const outputToken = additionalParams.outputToken || this.defaultZapToken;
        const outputTokenDecimals = this._getTokenDecimals(outputToken);

        // Calculate USD value of ALP using BigInt arithmetic to avoid overflow
        // alpUsdValue = burnAmount * alpPrice / 10^assetDecimals
        const alpPriceScaled = BigInt(Math.floor(alpPrice * 1e18)); // Scale price by 1e18
        const alpUsdValueScaled = (burnAmount * alpPriceScaled) / BigInt(Math.pow(10, this.assetDecimals));

        // Apply slippage and convert to output token amount
        // minOutAmount = alpUsdValue * (100 - slippage) / 100 * 10^outputTokenDecimals
        const slippageFactor = BigInt(Math.floor((100 - slippage) * 100)); // Scale by 100 for precision
        const minOutAmountBigInt = (alpUsdValueScaled * slippageFactor * BigInt(Math.pow(10, outputTokenDecimals))) / (BigInt(1e18) * 10000n);

        // For logging/meta - convert to number
        const alpUsdValue = Number(alpUsdValueScaled) / 1e18;
        const estimatedOutputUsdValue = alpUsdValue * (100 - slippage) / 100;

        // Encode burnAlp function call with BigInt value
        const burnData = this._encodeBurnAlp(
            outputToken,
            burnAmount,
            minOutAmountBigInt,
            userAddress
        );

        // Calculate protocol fee impact
        const tradingLoss = -estimatedOutputUsdValue * HARDCODED_PROTOCOL_FEE;

        return {
            to: this.vaultAddress,
            data: burnData,
            value: '0',
            gasLimit: DEFAULT_BURN_GAS,
            description: `Burn ${this._formatAmount(burnAmount, this.assetDecimals)} ALP`,
            meta: {
                protocol: 'ApolloX',
                operation: 'burnAlp',
                alpAmount: burnAmount.toString(),
                outputToken,
                minOutAmount: minOutAmountBigInt.toString(),
                alpPrice,
                alpUsdValue,
                estimatedOutputUsdValue,
                slippage,
                protocolFee: HARDCODED_PROTOCOL_FEE,
                tradingLoss,
            },
        };
    }

    /**
     * Estimate gas for ApolloX operations
     * @param {string} userAddress - User wallet address
     * @param {string} inputToken - Input token address
     * @param {BigInt|string} amount - Amount to process
     * @returns {Promise<Object>} - Gas estimates
     */
    estimateGas(_userAddress, _inputToken, _amount) {
        try {
            const approvalGas = BigInt(50000); // ~50k gas for approval
            const mintGas = DEFAULT_MINT_GAS;

            return {
                approval: {
                    gasLimit: approvalGas,
                    description: 'Approve stablecoin for ALP minting',
                },
                deposit: {
                    gasLimit: mintGas,
                    description: 'Mint ALP tokens',
                },
                total: {
                    gasLimit: approvalGas + mintGas,
                    description: 'Total estimated gas for ApolloX',
                },
            };
        } catch (error) {
            throw new Error(`Failed to estimate gas for ApolloX: ${error.message}`);
        }
    }

    /**
     * Get ApolloX-specific token requirements
     * @param {string} inputToken - Input token address
     * @returns {Promise<Object>} - Token requirements
     */
    getTokenRequirements(inputToken) {
        const baseRequirements = super.getTokenRequirements(inputToken);

        return {
            ...baseRequirements,
            protocolSpecific: {
                protocolAddress: this.vaultAddress, // Used by executor for token approvals
                vaultAddress: this.vaultAddress,
                alpTokenAddress: this.alpTokenAddress,
                defaultZapToken: this.defaultZapToken,
                supportedTokens: [
                    '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // USDC.e
                    '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC native
                    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // USDT
                ],
                requiresStablecoins: true,
                stakingEnabled: this.stakingEnabled,
            },
        };
    }

    /**
     * Fetch current ALP price from ApolloX API
     * @returns {Promise<number>} - ALP price in USD
     * @private
     */
    async _fetchAlpPrice() {
        try {
            const response = await axios({
                method: 'post',
                url: APOLLOX_ALP_PRICE_API,
                headers: {
                    'Content-Type': 'application/json',
                },
                data: {
                    channel: 'ARB',
                    currency: 'alb',
                    dataSize: 1,
                },
                timeout: 10000, // 10 second timeout
            });

            if (!response.data?.data?.[0]?.price) {
                throw new Error('Invalid response from ApolloX price API');
            }

            const latestPrice = response.data.data[0].price;
            return latestPrice / Math.pow(10, this.assetDecimals);
        } catch (error) {
            throw new Error(
                `Failed to fetch ALP price: ${error.message || 'Unknown error'}`
            );
        }
    }

    /**
     * Get ALP asset price (public method)
     * @returns {Promise<number>} - ALP price in USD
     */
    async getAssetPrice() {
        return await this._fetchAlpPrice();
    }

    /**
     * Validate ApolloX-specific configuration
     * @private
     */
    _validateApolloXConfig() {
        const required = [
            'assetAddress', // ALP token
            'protocolAddress', // Vault address
            'assetDecimals',
        ];

        const missing = required.filter(key => !this.config[key]);
        if (missing.length > 0) {
            throw new Error(`Missing required ApolloX config: ${missing.join(', ')}`);
        }

        // Validate addresses
        const addresses = ['assetAddress', 'protocolAddress'];
        if (this.config.zapInOutTokenAddress) {
            addresses.push('zapInOutTokenAddress');
        }

        addresses.forEach(key => {
            if (!ethers.isAddress(this.config[key])) {
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

        // Only Arbitrum is supported
        if (this.chainId !== 42161) {
            throw new Error(
                `ApolloX is only supported on Arbitrum (chainId: 42161), got ${this.chainId}`
            );
        }
    }

    /**
     * Encode mintAlp function call
     * @param {string} tokenIn - Input token address
     * @param {BigInt} amount - Amount to mint
     * @param {number} minAlp - Minimum ALP to receive
     * @param {boolean} autoCompound - Auto compound flag
     * @returns {string} - Encoded function data
     * @private
     */
    _encodeMintAlp(tokenIn, amount, minAlp, autoCompound) {
        const vaultInterface = new ethers.Interface([
            'function mintAlp(address tokenIn, uint256 amount, uint256 minAlp, bool autoCompound)',
        ]);

        return vaultInterface.encodeFunctionData('mintAlp', [
            tokenIn,
            amount,
            // minAlp,
            0,
            // autoCompound,
            false,
        ]);
    }

    /**
     * Encode burnAlp function call
     * @param {string} tokenOut - Output token address
     * @param {BigInt} alpAmount - ALP amount to burn
     * @param {BigInt} minOut - Minimum output amount
     * @param {string} receiver - Receiver address
     * @returns {string} - Encoded function data
     * @private
     */
    _encodeBurnAlp(tokenOut, alpAmount, minOut, receiver) {
        const vaultInterface = new ethers.Interface([
            'function burnAlp(address tokenOut, uint256 alpAmount, uint256 minOut, address receiver)',
        ]);

        return vaultInterface.encodeFunctionData('burnAlp', [
            tokenOut,
            alpAmount,
            minOut,
            receiver,
        ]);
    }

    /**
     * Calculate USD value of token amount
     * @param {BigInt} amount - Token amount
     * @param {number} price - Token price in USD
     * @param {number} decimals - Token decimals
     * @returns {number} - USD value
     * @private
     */
    _calculateUsdValue(amount, price, decimals) {
        return (Number(amount) * price) / Math.pow(10, decimals);
    }

    /**
     * Get token decimals (helper method)
     * @param {string} tokenAddress - Token address
     * @returns {number} - Token decimals
     * @private
     */
    _getTokenDecimals(tokenAddress) {
        const lowerAddress = tokenAddress.toLowerCase();

        // Common token decimals on Arbitrum
        const knownDecimals = {
            '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': 6, // USDC.e
            '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 6, // USDC native
            '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 6, // USDT
            '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': 18, // DAI
        };

        return knownDecimals[lowerAddress] || this.defaultZapTokenDecimals;
    }

    /**
     * Get ApolloX protocol info with additional details
     * @returns {Object} - Extended protocol info
     */
    getProtocolInfo() {
        const baseInfo = super.getProtocolInfo();

        return {
            ...baseInfo,
            protocol: 'ApolloX',
            version: 'V1',
            type: 'Liquidity Pool',
            description: 'Multi-asset liquidity pool with leveraged trading support',
            apy: null, // Could be fetched from ApolloX API
            tvl: null, // Could be fetched from ApolloX API
            protocolFee: HARDCODED_PROTOCOL_FEE,
            addresses: {
                vault: this.vaultAddress,
                alp: this.alpTokenAddress,
                stakeFarm: this.stakeFarmAddress,
            },
            features: {
                staking: this.stakingEnabled,
                autoCompound: true,
                multiAsset: true,
            },
        };
    }

    /**
     * Check if there's a lock-up period for withdrawal
     * Note: This would require on-chain contract call in production
     * @param {string} userAddress - User address
     * @returns {Promise<number>} - Lock-up seconds remaining
     */
    async getLockUpPeriod(userAddress) {
        // Placeholder - in production, would query contract
        // lastMintedTimestamp + coolingDuration - currentTimestamp
        return 0;
    }
}

module.exports = ApolloXProtocol;

