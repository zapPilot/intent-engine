/**
 * Fee Calculation Service
 * Dedicated service for handling complex fee calculations and transaction generation
 */

const feeConfig = require('../config/feeConfig');
const DUST_ZAP_CONFIG = require('../config/dustZapConfig');
const TransactionBuilder = require('../transactions/TransactionBuilder');
const { TokenConfigService } = require('../config/tokenConfig');

/**
 * Service responsible for all fee-related calculations and transaction generation
 */
class FeeCalculationService {
  /**
   * Calculate fee amounts in both USD and Wei
   * @param {number} totalValueUSD - Total transaction value in USD
   * @param {number} ethPrice - ETH price in USD
   * @param {string} referralAddress - Optional referral address
   * @returns {Object} - Complete fee calculation breakdown
   */
  calculateFeeAmounts(totalValueUSD, ethPrice, referralAddress = null) {
    const baseFeeInfo = feeConfig.calculateFees(totalValueUSD);

    // Convert USD amounts to ETH and Wei
    const totalFeeETH = baseFeeInfo.totalFeeUSD / ethPrice;
    const totalFeeWei = Math.floor(totalFeeETH * DUST_ZAP_CONFIG.WEI_FACTOR);

    let referrerFeeWei = 0n;
    let treasuryFeeWei = BigInt(totalFeeWei);

    if (referralAddress) {
      // Calculate referrer share using precise BigInt arithmetic
      const referrerFeeWeiCalculated =
        (BigInt(totalFeeWei) *
          BigInt(
            Math.floor(
              feeConfig.referrerFeeShare *
                DUST_ZAP_CONFIG.FEE_PERCENTAGE_PRECISION
            )
          )) /
        BigInt(DUST_ZAP_CONFIG.FEE_PERCENTAGE_PRECISION);

      referrerFeeWei = referrerFeeWeiCalculated;
      treasuryFeeWei = BigInt(totalFeeWei) - referrerFeeWei;
    }

    return {
      // USD amounts
      totalFeeUSD: baseFeeInfo.totalFeeUSD,
      referrerFeeUSD: baseFeeInfo.referrerFeeUSD,
      treasuryFeeUSD: baseFeeInfo.treasuryFeeUSD,

      // ETH amounts
      totalFeeETH,
      referrerFeeETH: referralAddress
        ? baseFeeInfo.referrerFeeUSD / ethPrice
        : 0,
      treasuryFeeETH: referralAddress
        ? baseFeeInfo.treasuryFeeUSD / ethPrice
        : totalFeeETH,

      // Wei amounts (as strings for precision)
      totalFeeWei: totalFeeWei.toString(),
      referrerFeeWei: referrerFeeWei.toString(),
      treasuryFeeWei: treasuryFeeWei.toString(),

      // Percentages
      referrerFeePercentage: baseFeeInfo.referrerFeePercentage,
      treasuryFeePercentage: baseFeeInfo.treasuryFeePercentage,

      // Metadata
      hasReferral: Boolean(referralAddress),
      feeTransactionCount: referralAddress ? 2 : 1,
    };
  }

  /**
   * Create fee transactions using TransactionBuilder with WETH wrapping pattern
   * @param {number} totalValueUSD - Total swap value in USD
   * @param {number} ethPrice - ETH price in USD
   * @param {number} chainId - Chain ID to determine WETH address
   * @param {string} referralAddress - Optional referral address
   * @param {TransactionBuilder} txBuilder - Transaction builder instance
   * @returns {Object} - Fee amounts and transaction builder with fee transactions
   */
  createFeeTransactions(
    totalValueUSD,
    ethPrice,
    chainId,
    referralAddress = null,
    txBuilder = null
  ) {
    const feeAmounts = this.calculateFeeAmounts(
      totalValueUSD,
      ethPrice,
      referralAddress
    );

    // Use provided txBuilder or create new one
    const builder = txBuilder || new TransactionBuilder();

    // Get WETH address for the chain
    const wethAddress = TokenConfigService.getWETHAddress(chainId);
    if (!wethAddress) {
      throw new Error(`WETH not supported on chain ${chainId}`);
    }

    // Step 1: Wrap ETH to WETH (deposit total fee amount)
    console.log('feeAmounts.totalFeeWei at deposit', feeAmounts.totalFeeWei);
    builder.addWETHDeposit(
      chainId,
      feeAmounts.totalFeeWei,
      'Wrap ETH to WETH for platform fees'
    );

    if (referralAddress) {
      // Step 2: Transfer WETH to referrer
      builder.addERC20Transfer(
        wethAddress,
        referralAddress,
        feeAmounts.referrerFeeWei,
        `Referrer fee (${feeAmounts.referrerFeePercentage}%)`
      );

      // Step 3: Transfer remaining WETH to treasury
      builder.addERC20Transfer(
        wethAddress,
        feeConfig.treasuryAddress,
        feeAmounts.treasuryFeeWei,
        `Treasury fee (${feeAmounts.treasuryFeePercentage}%)`
      );
    } else {
      // Step 2: Transfer all WETH to treasury
      console.log('feeAmounts.totalFeeWei at transfer', feeAmounts.totalFeeWei);
      builder.addERC20Transfer(
        wethAddress,
        feeConfig.treasuryAddress,
        feeAmounts.totalFeeWei,
        'Platform fee (100%)'
      );
    }

    return {
      feeAmounts,
      txBuilder: builder,
    };
  }

  /**
   * Create fee transactions using legacy ETH transfer pattern (for backward compatibility)
   * @param {number} totalValueUSD - Total swap value in USD
   * @param {number} ethPrice - ETH price in USD
   * @param {string} referralAddress - Optional referral address
   * @param {TransactionBuilder} txBuilder - Transaction builder instance
   * @returns {Object} - Fee amounts and transaction builder with fee transactions
   */
  createETHFeeTransactions(
    totalValueUSD,
    ethPrice,
    referralAddress = null,
    txBuilder = null
  ) {
    const feeAmounts = this.calculateFeeAmounts(
      totalValueUSD,
      ethPrice,
      referralAddress
    );

    // Use provided txBuilder or create new one
    const builder = txBuilder || new TransactionBuilder();

    if (referralAddress) {
      // Split fee: referrer share first, then treasury
      builder.addETHTransfer(
        referralAddress,
        feeAmounts.referrerFeeWei,
        `Referrer fee (${feeAmounts.referrerFeePercentage}%)`
      );

      builder.addETHTransfer(
        feeConfig.treasuryAddress,
        feeAmounts.treasuryFeeWei,
        `Treasury fee (${feeAmounts.treasuryFeePercentage}%)`
      );
    } else {
      // All fee to treasury
      builder.addETHTransfer(
        feeConfig.treasuryAddress,
        feeAmounts.totalFeeWei,
        'Platform fee (100%)'
      );
    }

    return {
      feeAmounts,
      txBuilder: builder,
    };
  }

  /**
   * Build fee info metadata for intent response
   * @param {number} totalValueUSD - Total value in USD
   * @param {string} referralAddress - Optional referral address
   * @param {boolean} useWETHPattern - Whether to use WETH wrapping pattern (default: true)
   * @returns {Object} - Fee info metadata object
   */
  buildFeeInfo(totalValueUSD, referralAddress = null, useWETHPattern = true) {
    const baseFeeInfo = feeConfig.calculateFees(totalValueUSD);

    // Calculate transaction count based on pattern used
    let feeTransactionCount;
    if (useWETHPattern) {
      // WETH pattern: 1 deposit + transfers (1 for treasury only, 2 for referral + treasury)
      feeTransactionCount = referralAddress ? 3 : 2; // deposit + transfer(s)
    } else {
      // Legacy ETH pattern: direct transfers
      feeTransactionCount = referralAddress ? 2 : 1;
    }

    return {
      // SECURITY: Removed startIndex/endIndex to prevent fee transaction filtering
      totalFeeUsd: baseFeeInfo.totalFeeUSD,
      referrerFeeUSD: baseFeeInfo.referrerFeeUSD,
      treasuryFee: baseFeeInfo.treasuryFeeUSD,
      feeTransactionCount, // Keep count for transparency, but not location
    };
  }

  /**
   * Calculate precise fee split using BigInt arithmetic
   * @param {string} totalFeeWei - Total fee amount in wei (as string)
   * @param {number} sharePercentage - Share percentage (0-1)
   * @returns {Object} - Split fee amounts in wei
   */
  static splitFeeAmount(totalFeeWei, sharePercentage) {
    const shareWei =
      (BigInt(totalFeeWei) *
        BigInt(
          Math.floor(sharePercentage * DUST_ZAP_CONFIG.FEE_PERCENTAGE_PRECISION)
        )) /
      BigInt(DUST_ZAP_CONFIG.FEE_PERCENTAGE_PRECISION);

    const remainderWei = BigInt(totalFeeWei) - shareWei;

    return {
      shareWei: shareWei.toString(),
      remainderWei: remainderWei.toString(),
    };
  }

  /**
   * Convert USD amount to Wei using current ETH price
   * @param {number} usdAmount - Amount in USD
   * @param {number} ethPrice - ETH price in USD
   * @returns {string} - Amount in wei as string
   */
  static usdToWei(usdAmount, ethPrice) {
    const ethAmount = usdAmount / ethPrice;
    const weiAmount = Math.floor(ethAmount * DUST_ZAP_CONFIG.WEI_FACTOR);
    return weiAmount.toString();
  }

  /**
   * Convert Wei to USD using current ETH price
   * @param {string} weiAmount - Amount in wei as string
   * @param {number} ethPrice - ETH price in USD
   * @returns {number} - Amount in USD
   */
  static weiToUsd(weiAmount, ethPrice) {
    const ethAmount = parseFloat(weiAmount) / DUST_ZAP_CONFIG.WEI_FACTOR;
    return ethAmount * ethPrice;
  }
}

module.exports = FeeCalculationService;
