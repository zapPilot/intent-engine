const BaseIntentHandler = require('./BaseIntentHandler');
const TransactionBuilder = require('../transactions/TransactionBuilder');
const feeConfig = require('../config/feeConfig');
const DUST_ZAP_CONFIG = require('../config/dustZapConfig');
const {
  filterDustTokens,
  groupIntoBatches,
  calculateTotalValue,
} = require('../utils/dustFilters');

/**
 * DustZap Intent Handler - Converts dust tokens to ETH
 */
class DustZapIntentHandler extends BaseIntentHandler {
  constructor(swapService, priceService, rebalanceClient) {
    super(swapService, priceService, rebalanceClient);
  }

  /**
   * Validate dustZap-specific parameters
   * @param {Object} request - Intent request
   */
  validate(request) {
    this.validateCommon(request);

    const { params } = request;
    if (!params) {
      throw new Error(DUST_ZAP_CONFIG.ERRORS.MISSING_PARAMS);
    }

    const { dustThreshold, targetToken, referralAddress } = params;

    if (dustThreshold !== undefined) {
      if (typeof dustThreshold !== 'number' || dustThreshold < 0) {
        throw new Error(DUST_ZAP_CONFIG.ERRORS.INVALID_DUST_THRESHOLD);
      }
    }

    if (
      targetToken &&
      !DUST_ZAP_CONFIG.SUPPORTED_TARGET_TOKENS.includes(targetToken)
    ) {
      throw new Error(DUST_ZAP_CONFIG.ERRORS.UNSUPPORTED_TARGET_TOKEN);
    }

    if (
      referralAddress &&
      !DUST_ZAP_CONFIG.VALIDATION.ETH_ADDRESS_PATTERN.test(referralAddress)
    ) {
      throw new Error(DUST_ZAP_CONFIG.ERRORS.INVALID_REFERRAL_ADDRESS);
    }
  }

  /**
   * Execute dustZap intent
   * @param {Object} request - Intent request
   * @returns {Promise<Object>} - Intent response with transactions
   */
  async execute(request) {
    this.validate(request);

    try {
      // 1. Prepare execution context with all required data
      const executionContext = await this.prepareExecutionContext(request);

      // 2. Process all batches and generate transactions
      const processedData = await this.processAllBatches(executionContext);

      // 3. Build and return response with metadata
      return this.buildResponse(executionContext, processedData);
    } catch (error) {
      console.error('DustZap execution error:', error);
      throw error;
    }
  }

  /**
   * Prepare execution context with all required data
   * @param {Object} request - Intent request
   * @returns {Promise<Object>} - Execution context object
   */
  async prepareExecutionContext(request) {
    const { userAddress, chainId, params } = request;
    const {
      dustThreshold = DUST_ZAP_CONFIG.DEFAULT_DUST_THRESHOLD,
      referralAddress,
      toTokenAddress,
      toTokenDecimals,
      slippage,
    } = params;

    // 1. Get user token balances
    const userTokens = await this.rebalanceClient.getUserTokenBalances(
      userAddress,
      chainId
    );

    // 2. Filter dust tokens
    const dustTokens = filterDustTokens(userTokens, dustThreshold);
    if (dustTokens.length === 0) {
      throw new Error(DUST_ZAP_CONFIG.ERRORS.NO_DUST_TOKENS);
    }

    // 3. Get ETH price for fee calculations
    const ethPrice = await this.getETHPrice();

    // 4. Group tokens into batches
    const batches = groupIntoBatches(
      dustTokens,
      DUST_ZAP_CONFIG.DEFAULT_BATCH_SIZE
    );

    return {
      userAddress,
      chainId,
      params: {
        dustThreshold,
        referralAddress,
        toTokenAddress,
        toTokenDecimals,
        slippage,
      },
      dustTokens,
      ethPrice,
      batches,
    };
  }

  /**
   * Process all batches and generate transactions
   * @param {Object} executionContext - Execution context
   * @returns {Promise<Object>} - Processed data with transactions and totals
   */
  async processAllBatches(executionContext) {
    const { batches, ethPrice, params } = executionContext;
    const { referralAddress } = params;

    const txBuilder = new TransactionBuilder();
    let totalValueUSD = 0;

    // Process each batch of dust tokens
    for (const batch of batches) {
      const batchContext = this.createBatchProcessingContext(
        batch,
        txBuilder,
        executionContext
      );

      await this.processBatch(batchContext);
      totalValueUSD += calculateTotalValue(batch);
    }

    // Add platform fee transactions
    await this.addFeeTransactions(
      txBuilder,
      totalValueUSD,
      ethPrice,
      referralAddress
    );

    return {
      txBuilder,
      totalValueUSD,
    };
  }

  /**
   * Build response with metadata
   * @param {Object} executionContext - Execution context
   * @param {Object} processedData - Processed transaction data
   * @returns {Object} - Complete intent response
   */
  buildResponse(executionContext, processedData) {
    const { dustTokens, batches, params } = executionContext;
    const { txBuilder, totalValueUSD } = processedData;
    const { dustThreshold, referralAddress } = params;

    const transactions = txBuilder.getTransactions();
    const batchInfo = this.buildBatchInfo(batches);

    return {
      success: true,
      intentType: 'dustZap',
      transactions,
      metadata: {
        totalTokens: dustTokens.length,
        batchInfo,
        feeInfo: this.buildFeeInfo(
          transactions,
          totalValueUSD,
          referralAddress
        ),
        estimatedTotalGas: txBuilder.getTotalGas(),
        dustThreshold,
      },
    };
  }

  /**
   * Create batch processing context
   * @param {Array} batch - Batch of dust tokens
   * @param {TransactionBuilder} txBuilder - Transaction builder instance
   * @param {Object} executionContext - Execution context
   * @returns {Object} - Batch processing context
   */
  createBatchProcessingContext(batch, txBuilder, executionContext) {
    const { chainId, ethPrice, userAddress, params } = executionContext;
    const { toTokenAddress, toTokenDecimals, slippage } = params;

    return {
      batch,
      txBuilder,
      chainId,
      ethPrice,
      toTokenPrice: ethPrice, // Fix: was duplicated ethPrice parameter
      userAddress,
      toTokenAddress,
      toTokenDecimals,
      slippage,
    };
  }

  /**
   * Process a batch of dust tokens
   * @param {Object} context - Batch processing context
   * @param {Array} context.batch - Batch of dust tokens
   * @param {TransactionBuilder} context.txBuilder - Transaction builder instance
   * @param {number} context.chainId - Chain ID
   * @param {number} context.ethPrice - ETH price in USD
   * @param {number} context.toTokenPrice - Target token price in USD
   * @param {string} context.userAddress - User address
   * @param {string} context.toTokenAddress - Target token address
   * @param {number} context.toTokenDecimals - Target token decimals
   * @param {number} context.slippage - Slippage tolerance
   */
  async processBatch(context) {
    const {
      batch,
      txBuilder,
      chainId,
      ethPrice,
      toTokenPrice,
      userAddress,
      toTokenAddress,
      toTokenDecimals,
      slippage,
    } = context;
    for (const token of batch) {
      try {
        // Get best swap quote
        const requestParam = {
          chainId: chainId,
          fromTokenAddress: token.id,
          fromTokenDecimals: token.decimals,
          toTokenAddress: toTokenAddress,
          toTokenDecimals: toTokenDecimals,
          amount: token.raw_amount,
          fromAddress: userAddress,
          slippage: slippage, // unit is percentage
          eth_price: ethPrice,
          toTokenPrice: toTokenPrice,
        };
        const swapQuote = await this.swapService.getBestSwapQuote(requestParam);
        // Add approve transaction
        txBuilder.addApprove(
          token.id,
          swapQuote.to, // Router address
          token.raw_amount
        );

        // Add swap transaction
        txBuilder.addSwap(swapQuote, `Swap ${token.symbol} to ETH`);
      } catch (error) {
        console.warn(`Failed to process token ${token.symbol}:`, error.message);
        // Continue with other tokens (graceful degradation)
      }
    }
  }

  /**
   * Add platform fee transactions
   * @param {TransactionBuilder} txBuilder - Transaction builder instance
   * @param {number} totalValueUSD - Total swap value in USD
   * @param {number} ethPrice - ETH price in USD
   * @param {string} referralAddress - Optional referral address
   */
  addFeeTransactions(txBuilder, totalValueUSD, ethPrice, referralAddress) {
    const feeInfo = feeConfig.calculateFees(totalValueUSD);
    const totalFeeETH = feeInfo.totalFeeUSD / ethPrice;
    const totalFeeWei = Math.floor(
      totalFeeETH * DUST_ZAP_CONFIG.WEI_FACTOR
    ).toString();

    if (referralAddress) {
      // Split fee: referrer share to referrer, remainder to treasury
      const referrerFeeWei = (
        (BigInt(totalFeeWei) *
          BigInt(
            Math.floor(
              feeConfig.referrerFeeShare *
                DUST_ZAP_CONFIG.FEE_PERCENTAGE_PRECISION
            )
          )) /
        BigInt(DUST_ZAP_CONFIG.FEE_PERCENTAGE_PRECISION)
      ).toString();
      const treasuryFeeWei = (
        BigInt(totalFeeWei) - BigInt(referrerFeeWei)
      ).toString();

      txBuilder.addETHTransfer(
        referralAddress,
        referrerFeeWei,
        `Referrer fee (${feeInfo.referrerFeePercentage}%)`
      );
      txBuilder.addETHTransfer(
        feeConfig.treasuryAddress,
        treasuryFeeWei,
        `Treasury fee (${feeInfo.treasuryFeePercentage}%)`
      );
    } else {
      // All fee to treasury
      txBuilder.addETHTransfer(
        feeConfig.treasuryAddress,
        totalFeeWei,
        'Platform fee (100%)'
      );
    }
  }

  /**
   * Get current ETH price
   * @returns {Promise<number>} - ETH price in USD
   */
  async getETHPrice() {
    const priceObj = await this.priceService.getPrice('eth');
    return priceObj.price;
  }

  /**
   * Build batch info metadata
   * @param {Array} batches - Array of token batches
   * @returns {Array} - Batch info array
   */
  buildBatchInfo(batches) {
    let currentIndex = 0;
    const batchInfo = [];

    for (const batch of batches) {
      const transactionCount =
        batch.length * DUST_ZAP_CONFIG.TRANSACTIONS_PER_TOKEN; // approve + swap per token
      batchInfo.push({
        startIndex: currentIndex,
        endIndex: currentIndex + transactionCount - 1,
        tokenCount: batch.length,
      });
      currentIndex += transactionCount;
    }

    return batchInfo;
  }

  /**
   * Build fee info metadata
   * @param {Array} transactions - Transaction array
   * @param {number} totalValueUSD - Total value in USD
   * @param {number} ethPrice - ETH price
   * @param {string} referralAddress - Referral address
   * @returns {Object} - Fee info object
   */
  buildFeeInfo(transactions, totalValueUSD, referralAddress) {
    const feeInfo = feeConfig.calculateFees(totalValueUSD);
    const feeTransactionCount = referralAddress ? 2 : 1;
    return {
      startIndex: transactions.length - feeTransactionCount,
      endIndex: transactions.length - 1,
      totalFeeUsd: feeInfo.totalFeeUSD,
      referrerFeeUSD: feeInfo.referrerFeeUSD,
      treasuryFee: feeInfo.treasuryFeeUSD,
    };
  }
}

module.exports = DustZapIntentHandler;
