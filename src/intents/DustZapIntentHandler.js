const BaseIntentHandler = require('./BaseIntentHandler');
const TransactionBuilder = require('../transactions/TransactionBuilder');
const feeConfig = require('../config/feeConfig');
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
      throw new Error('Missing params object');
    }

    const { dustThreshold, targetToken, referralAddress } = params;

    if (dustThreshold !== undefined) {
      if (typeof dustThreshold !== 'number' || dustThreshold < 0) {
        throw new Error('dustThreshold must be a non-negative number');
      }
    }

    if (targetToken && targetToken !== 'ETH') {
      throw new Error('Only ETH target token is currently supported');
    }

    if (referralAddress && !/^0x[a-fA-F0-9]{40}$/.test(referralAddress)) {
      throw new Error(
        'Invalid referralAddress: must be a valid Ethereum address'
      );
    }
  }

  /**
   * Execute dustZap intent
   * @param {Object} request - Intent request
   * @returns {Promise<Object>} - Intent response with transactions
   */
  async execute(request) {
    this.validate(request);

    const { userAddress, chainId, params } = request;
    const {
      dustThreshold = 0.005,
      referralAddress,
      toTokenAddress,
      toTokenDecimals,
      slippage,
    } = params;

    try {
      // 1. Get user token balances
      const userTokens = await this.rebalanceClient.getUserTokenBalances(
        userAddress,
        chainId
      );
      // 2. Filter dust tokens
      const dustTokens = filterDustTokens(userTokens, dustThreshold);

      if (dustTokens.length === 0) {
        throw new Error('No dust tokens found above threshold');
      }

      // 3. Get ETH price for fee calculations
      const ethPrice = await this.getETHPrice();

      // 4. Group tokens into batches
      const batches = groupIntoBatches(dustTokens, 10);

      // 5. Generate transactions for all batches
      const txBuilder = new TransactionBuilder();
      let totalValueUSD = 0;

      for (const batch of batches) {
        await this.processBatch(
          batch,
          txBuilder,
          chainId,
          ethPrice,
          userAddress,
          toTokenAddress,
          toTokenDecimals,
          slippage
        );
        totalValueUSD += calculateTotalValue(batch);
      }

      // 6. Add platform fee transactions
      await this.addFeeTransactions(
        txBuilder,
        totalValueUSD,
        ethPrice,
        referralAddress
      );

      // 7. Build response with metadata
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
            ethPrice,
            referralAddress
          ),
          estimatedTotalGas: txBuilder.getTotalGas(),
          dustThreshold,
        },
      };
    } catch (error) {
      console.error('DustZap execution error:', error);
      throw error;
    }
  }

  /**
   * Process a batch of dust tokens
   * @param {Array} batch - Batch of dust tokens
   * @param {TransactionBuilder} txBuilder - Transaction builder instance
   * @param {number} chainId - Chain ID
   * @param {number} ethPrice - ETH price in USD
   */
  async processBatch(
    batch,
    txBuilder,
    chainId,
    ethPrice,
    userAddress,
    toTokenAddress,
    toTokenDecimals,
    slippage
  ) {
    for (const token of batch) {
      try {
        // Get best swap quote
        // const requestParam = {
        //   chainId: chainId,
        //   fromTokenAddress: token.id,
        //   fromTokenDecimals: token.decimals,
        //   toTokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
        //   amount: token.raw_amount,
        //   fromAddress: userAddress,
        //   slippage: 1, // 1% slippage
        //   eth_price: ethPrice,
        //   toTokenPrice: token.price,
        // };
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
          toTokenPrice: 2600,
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
    const totalFeeWei = Math.floor(totalFeeETH * 1e18).toString();

    if (referralAddress) {
      // Split fee: referrer share to referrer, remainder to treasury
      const referrerFeeWei = (
        (BigInt(totalFeeWei) *
          BigInt(Math.floor(feeConfig.referrerFeeShare * 100))) /
        BigInt(100)
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
    try {
      const prices = await this.priceService.getTokenPrices(['ethereum']);
      return prices.ethereum?.usd || 3000; // Fallback to $3000
    } catch (error) {
      console.warn('Failed to get ETH price, using fallback:', error.message);
      return 3000; // Fallback price
    }
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
      const transactionCount = batch.length * 2; // approve + swap per token
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
  buildFeeInfo(transactions, totalValueUSD, ethPrice, referralAddress) {
    const feeInfo = feeConfig.calculateFees(totalValueUSD);
    const feeTransactionCount = referralAddress ? 2 : 1;

    return {
      startIndex: transactions.length - feeTransactionCount,
      endIndex: transactions.length - 1,
      totalFeeUsd: feeInfo.totalFeeUSD,
      referrerFeeEth: referralAddress
        ? ((feeInfo.referrerFeeUSD / ethPrice) * 1e18).toString()
        : '0',
      treasuryFeeEth: referralAddress
        ? ((feeInfo.treasuryFeeUSD / ethPrice) * 1e18).toString()
        : ((feeInfo.totalFeeUSD / ethPrice) * 1e18).toString(),
    };
  }
}

module.exports = DustZapIntentHandler;
