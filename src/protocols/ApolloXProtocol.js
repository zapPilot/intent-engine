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
        this.defaultZapTokenDecimals = 6;

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

        // Get current ALP price (decimal, e.g., 1.95107195)
        const alpPrice = await this._fetchAlpPrice();

        // Get slippage from params or use default (0.5%)
        const slippage = additionalParams.slippage || 0.5;

        // Get token prices for USD calculation (defaults to 1.0 for stablecoins)
        const tokenPrices = additionalParams.tokenPrices || {};
        const inputTokenSymbol = additionalParams.inputTokenSymbol || 'usdc';
        const inputTokenDecimals = this._getTokenDecimals(inputToken);
        const tokenPriceDecimal = tokenPrices[inputTokenSymbol] ?? 1.0;

        // Scale prices into 1e18 BigInt to avoid precision loss
        const tokenPriceWei = this._decimalToWei(tokenPriceDecimal, 18);
        const alpPriceWei = this._decimalToWei(alpPrice, 18);

        // USD value in 1e18 precision: usdWei = amount * price / 10^tokenDecimals
        const usdWei = (depositAmount * tokenPriceWei) / (10n ** BigInt(inputTokenDecimals));

        // Estimated ALP amount in 18 decimals: estAlpWei = usdWei * 10^assetDecimals / alpPriceWei
        const estAlpWei = (usdWei * (10n ** BigInt(this.assetDecimals))) / alpPriceWei;

        // Apply safety margins in basis points (bps)
        const slippageBps = BigInt(Math.round((slippage ?? 0.5) * 100)); // e.g., 0.5% => 50 bps
        const feeBps = 30n;   // 0.30%
        const bufferBps = 5n; // 0.05% buffer for rounding
        const minFactorBps = 10000n - slippageBps - feeBps - bufferBps;
        const minAlpWei = (estAlpWei * minFactorBps) / 10000n;

        // Encode mintAlp function call with computed minAlp (BigInt)
        const mintData = this._encodeMintAlp(
            inputToken,
            depositAmount,
            minAlpWei,
            false // auto compound flag
        );

        // For meta/logging
        const inputUsdValue = Number(usdWei) / 1e18;
        const estimatedAlpAmount = Number(estAlpWei) / Math.pow(10, this.assetDecimals);
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
                minAlpAmount: minAlpWei.toString(),
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

        // Get current ALP price (decimal)
        const alpPrice = await this._fetchAlpPrice();

        // Get slippage from params or use default (0.5%)
        const slippage = additionalParams.slippage || 0.5;

        // Output token (default to USDC.e)
        const outputToken = additionalParams.outputToken || this.defaultZapToken;
        const outputTokenDecimals = this._getTokenDecimals(outputToken);

        // Calculate USD value of ALP using BigInt arithmetic to avoid overflow
        // alpUsdValue in 1e18 = burnAmount * alpPriceWei / 10^assetDecimals
        const alpPriceScaled = this._decimalToWei(alpPrice, 18);
        const alpUsdValueScaled = (burnAmount * alpPriceScaled) / (10n ** BigInt(this.assetDecimals));

        // Apply slippage and convert to output token amount
        // minOutAmount = alpUsdValue * (100 - slippage) / 100 * 10^outputTokenDecimals
        const slippageFactor = BigInt(Math.floor((100 - slippage) * 100)); // Scale by 100 for precision
        const minOutAmountBigInt = (alpUsdValueScaled * slippageFactor * (10n ** BigInt(outputTokenDecimals))) / (10n ** 18n) / 10000n;

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

            const latestPrice = Number(response.data.data[0].price);
            return latestPrice; // return as decimal (e.g., 1.95107195)
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
            typeof minAlp === 'bigint' ? minAlp.toString() : minAlp,
            autoCompound,
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

    // Convert decimal number/string to 1e{decimals} BigInt without floating point errors
    _decimalToWei(decimal, decimals = 18) {
        const s = typeof decimal === 'number' ? String(decimal) : String(decimal);
        const parts = s.split('.');
        const i = parts[0];
        const fRaw = parts[1] || '';
        const f = (fRaw + '0'.repeat(decimals)).slice(0, decimals);
        const base = 10n ** BigInt(decimals);
        return (BigInt(i) * base) + (f ? BigInt(f) : 0n);
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

