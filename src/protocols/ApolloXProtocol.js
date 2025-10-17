/**
 * ApolloXProtocol - ApolloX ALP (Arbitrum Liquidity Pool) protocol implementation
 * Handles ALP minting and burning on Arbitrum
 * Note: ALP is staked on PancakeSwap for additional yield
 */

const BaseProtocolV2 = require('./BaseProtocolV2');
const { ethers } = require('ethers');
const axios = require('axios');

// ============================================================================
// Constants
// ============================================================================

const APOLLOX_ALP_PRICE_API = 'https://www.apollox.finance/bapi/futures/v1/public/future/symbol/history-price';
const DEFAULT_MINT_GAS = 400000n; // ~400k gas for minting ALP
const DEFAULT_BURN_GAS = 350000n; // ~350k gas for burning ALP
const APPROVAL_GAS = 50000n; // ~50k gas for token approval
const PROTOCOL_FEE = 0.003; // 0.3% protocol fee
const PROTOCOL_FEE_BPS = 30n; // 0.3% in basis points
const ROUNDING_BUFFER_BPS = 5n; // 0.05% buffer for rounding errors
const DEFAULT_SLIPPAGE = 0.5; // 0.5% default slippage
const WEI_DECIMALS = 18; // Standard 1e18 precision for intermediate calculations
const ARBITRUM_CHAIN_ID = 42161;

// Supported stablecoins on Arbitrum
const SUPPORTED_TOKENS = {
    USDC_BRIDGED: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // USDC.e
    USDT: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // USDT
    DAI: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
};

// Token decimals lookup
const TOKEN_DECIMALS = {
    [SUPPORTED_TOKENS.USDC_BRIDGED]: 6,
    [SUPPORTED_TOKENS.USDT]: 6,
    [SUPPORTED_TOKENS.DAI]: 18,
};

// ============================================================================
// Main Protocol Class
// ============================================================================

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
        this.defaultZapToken = config.zapInOutTokenAddress || SUPPORTED_TOKENS.USDC_BRIDGED;
        this.defaultZapTokenDecimals = 6;

        // Optional: PancakeSwap staking (currently not active based on frontend code)
        this.stakeFarmAddress = config.stakeFarmAddress || null;
        this.stakingEnabled = config.stakingEnabled || false;
    }

    // ========================================================================
    // Public Transaction Methods
    // ========================================================================

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

        // Get current ALP price and extract parameters
        const alpPrice = await this._fetchAlpPrice();
        const slippage = additionalParams.slippage || DEFAULT_SLIPPAGE;
        const inputTokenSymbol = additionalParams.inputTokenSymbol || 'usdc';
        const inputTokenDecimals = this._getTokenDecimals(inputToken);

        // Get token price (defaults to 1.0 for stablecoins)
        const tokenPrices = additionalParams.tokenPrices || {};
        const tokenPriceDecimal = tokenPrices[inputTokenSymbol] ?? 1.0;

        // Calculate minimum ALP amount with safety margins
        const { minAlpWei, estAlpWei, usdWei } = this._calculateMinAlpAmount(
            depositAmount,
            tokenPriceDecimal,
            alpPrice,
            inputTokenDecimals,
            slippage
        );

        // Encode mintAlp function call with computed minAlp (BigInt)
        const mintData = this._encodeMintAlp(
            inputToken,
            depositAmount,
            minAlpWei,
            false // auto compound flag
        );

        // Build transaction with metadata
        return this._buildDepositTransaction(
            mintData,
            depositAmount,
            minAlpWei,
            estAlpWei,
            usdWei,
            alpPrice,
            slippage,
            inputTokenSymbol,
            inputToken,
            inputTokenDecimals
        );
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

        // Get current ALP price and parameters
        const alpPrice = await this._fetchAlpPrice();
        const slippage = additionalParams.slippage || DEFAULT_SLIPPAGE;
        const outputToken = additionalParams.outputToken || this.defaultZapToken;
        const outputTokenDecimals = this._getTokenDecimals(outputToken);

        // Calculate minimum output amount with safety margins
        const { minOutAmount, alpUsdValueScaled } = this._calculateMinOutputAmount(
            burnAmount,
            alpPrice,
            outputTokenDecimals,
            slippage
        );

        // Encode burnAlp function call
        const burnData = this._encodeBurnAlp(
            outputToken,
            burnAmount,
            minOutAmount,
            userAddress
        );

        // Build transaction with metadata
        return this._buildWithdrawalTransaction(
            burnData,
            burnAmount,
            minOutAmount,
            alpUsdValueScaled,
            alpPrice,
            slippage,
            outputToken
        );
    }

    // ========================================================================
    // Public Utility Methods
    // ========================================================================

    /**
     * Estimate gas for ApolloX operations
     * @param {string} userAddress - User wallet address
     * @param {string} inputToken - Input token address
     * @param {BigInt|string} amount - Amount to process
     * @returns {Promise<Object>} - Gas estimates
     */
    estimateGas(_userAddress, _inputToken, _amount) {
        return {
            approval: {
                gasLimit: APPROVAL_GAS,
                description: 'Approve stablecoin for ALP minting',
            },
            deposit: {
                gasLimit: DEFAULT_MINT_GAS,
                description: 'Mint ALP tokens',
            },
            total: {
                gasLimit: APPROVAL_GAS + DEFAULT_MINT_GAS,
                description: 'Total estimated gas for ApolloX',
            },
        };
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
                supportedTokens: Object.values(SUPPORTED_TOKENS),
                requiresStablecoins: true,
                stakingEnabled: this.stakingEnabled,
            },
        };
    }

    /**
     * Get ALP asset price (public method)
     * @returns {Promise<number>} - ALP price in USD
     */
    async getAssetPrice() {
        return await this._fetchAlpPrice();
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
            protocolFee: PROTOCOL_FEE,
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

    // ========================================================================
    // Private Helper Methods - Price & API
    // ========================================================================

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

    // ========================================================================
    // Private Helper Methods - Validation
    // ========================================================================

    /**
     * Validate ApolloX-specific configuration
     * @private
     */
    _validateApolloXConfig() {
        const required = ['assetAddress', 'protocolAddress', 'assetDecimals'];

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
        if (this.chainId !== ARBITRUM_CHAIN_ID) {
            throw new Error(
                `ApolloX is only supported on Arbitrum (chainId: ${ARBITRUM_CHAIN_ID}), got ${this.chainId}`
            );
        }
    }

    // ========================================================================
    // Private Helper Methods - Calculations
    // ========================================================================

    /**
     * Calculate minimum ALP amount for deposit with safety margins
     * @param {BigInt} depositAmount - Amount to deposit
     * @param {number} tokenPrice - Token price in USD
     * @param {number} alpPrice - ALP price in USD
     * @param {number} tokenDecimals - Token decimals
     * @param {number} slippage - Slippage percentage
     * @returns {Object} - { minAlpWei, estAlpWei, usdWei }
     * @private
     */
    _calculateMinAlpAmount(depositAmount, tokenPrice, alpPrice, tokenDecimals, slippage) {
        // Scale prices into 1e18 BigInt to avoid precision loss
        const tokenPriceWei = this._decimalToWei(tokenPrice, WEI_DECIMALS);
        const alpPriceWei = this._decimalToWei(alpPrice, WEI_DECIMALS);

        // USD value in 1e18 precision: usdWei = amount * price / 10^tokenDecimals
        const usdWei = (depositAmount * tokenPriceWei) / (10n ** BigInt(tokenDecimals));

        // Estimated ALP amount in 18 decimals: estAlpWei = usdWei * 10^assetDecimals / alpPriceWei
        const estAlpWei = (usdWei * (10n ** BigInt(this.assetDecimals))) / alpPriceWei;

        // Apply safety margins in basis points (bps)
        const slippageBps = BigInt(Math.round(slippage * 100));
        const minFactorBps = 10000n - slippageBps - PROTOCOL_FEE_BPS - ROUNDING_BUFFER_BPS;
        const minAlpWei = (estAlpWei * minFactorBps) / 10000n;

        return { minAlpWei, estAlpWei, usdWei };
    }

    /**
     * Calculate minimum output amount for withdrawal
     * @param {BigInt} burnAmount - ALP amount to burn
     * @param {number} alpPrice - ALP price in USD
     * @param {number} outputTokenDecimals - Output token decimals
     * @param {number} slippage - Slippage percentage
     * @returns {Object} - { minOutAmount, alpUsdValueScaled }
     * @private
     */
    _calculateMinOutputAmount(burnAmount, alpPrice, outputTokenDecimals, slippage) {
        // Calculate USD value of ALP using BigInt arithmetic
        // alpUsdValue in 1e18 = burnAmount * alpPriceWei / 10^assetDecimals
        const alpPriceScaled = this._decimalToWei(alpPrice, WEI_DECIMALS);
        const alpUsdValueScaled = (burnAmount * alpPriceScaled) / (10n ** BigInt(this.assetDecimals));

        // Apply slippage and convert to output token amount
        // minOutAmount = alpUsdValue * (100 - slippage) / 100 * 10^outputTokenDecimals
        const slippageFactor = BigInt(Math.floor((100 - slippage) * 100));
        const minOutAmount = (alpUsdValueScaled * slippageFactor * (10n ** BigInt(outputTokenDecimals))) / (10n ** BigInt(WEI_DECIMALS)) / 10000n;

        return { minOutAmount, alpUsdValueScaled };
    }

    /**
     * Build deposit transaction with metadata
     * @private
     */
    _buildDepositTransaction(
        mintData,
        depositAmount,
        minAlpWei,
        estAlpWei,
        usdWei,
        alpPrice,
        slippage,
        inputTokenSymbol,
        inputToken,
        inputTokenDecimals
    ) {
        const inputUsdValue = Number(usdWei) / 1e18;
        const estimatedAlpAmount = Number(estAlpWei) / Math.pow(10, this.assetDecimals);
        const tradingLoss = -inputUsdValue * PROTOCOL_FEE;

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
                protocolFee: PROTOCOL_FEE,
                tradingLoss,
            },
        };
    }

    /**
     * Build withdrawal transaction with metadata
     * @private
     */
    _buildWithdrawalTransaction(
        burnData,
        burnAmount,
        minOutAmount,
        alpUsdValueScaled,
        alpPrice,
        slippage,
        outputToken
    ) {
        const alpUsdValue = Number(alpUsdValueScaled) / 1e18;
        const estimatedOutputUsdValue = alpUsdValue * (100 - slippage) / 100;
        const tradingLoss = -estimatedOutputUsdValue * PROTOCOL_FEE;

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
                minOutAmount: minOutAmount.toString(),
                alpPrice,
                alpUsdValue,
                estimatedOutputUsdValue,
                slippage,
                protocolFee: PROTOCOL_FEE,
                tradingLoss,
            },
        };
    }

    // ========================================================================
    // Private Helper Methods - Encoding
    // ========================================================================

    /**
     * Encode mintAlp function call
     * @param {string} tokenIn - Input token address
     * @param {BigInt} amount - Amount to mint
     * @param {BigInt} minAlp - Minimum ALP to receive
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

    // ========================================================================
    // Private Helper Methods - Conversions
    // ========================================================================

    /**
     * Convert decimal number/string to BigInt with specified precision
     * Avoids floating point precision errors by using string manipulation
     * @param {number|string} decimal - Decimal value to convert
     * @param {number} decimals - Target precision (default 18)
     * @returns {BigInt} - Scaled BigInt value
     * @private
     */
    _decimalToWei(decimal, decimals = 18) {
        const s = typeof decimal === 'number' ? String(decimal) : String(decimal);
        const parts = s.split('.');
        const integerPart = parts[0];
        const fractionalPart = parts[1] || '';

        // Pad or truncate fractional part to desired decimals
        const paddedFractional = (fractionalPart + '0'.repeat(decimals)).slice(0, decimals);

        const base = 10n ** BigInt(decimals);
        return (BigInt(integerPart) * base) + (paddedFractional ? BigInt(paddedFractional) : 0n);
    }

    /**
     * Get token decimals from address lookup
     * @param {string} tokenAddress - Token address
     * @returns {number} - Token decimals
     * @private
     */
    _getTokenDecimals(tokenAddress) {
        const lowerAddress = tokenAddress.toLowerCase();
        return TOKEN_DECIMALS[lowerAddress] || this.defaultZapTokenDecimals;
    }
}

module.exports = ApolloXProtocol;

