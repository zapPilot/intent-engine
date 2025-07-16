/**
 * Fee Calculation Service
 * Dedicated service for handling complex fee calculations and transaction generation
 */

const feeConfig = require('../config/feeConfig');
const DUST_ZAP_CONFIG = require('../config/dustZapConfig');

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
   * Add fee transactions to the transaction builder (legacy method)
   * @param {TransactionBuilder} txBuilder - Transaction builder instance
   * @param {number} totalValueUSD - Total swap value in USD
   * @param {number} ethPrice - ETH price in USD
   * @param {string} referralAddress - Optional referral address
   * @returns {Object} - Fee calculation results for metadata
   */
  addFeeTransactions(
    txBuilder,
    totalValueUSD,
    ethPrice,
    referralAddress = null
  ) {
    const feeAmounts = this.calculateFeeAmounts(
      totalValueUSD,
      ethPrice,
      referralAddress
    );

    if (referralAddress) {
      // Split fee: referrer share to referrer, remainder to treasury
      txBuilder.addETHTransfer(
        referralAddress,
        feeAmounts.referrerFeeWei,
        `Referrer fee (${feeAmounts.referrerFeePercentage}%)`
      );

      txBuilder.addETHTransfer(
        feeConfig.treasuryAddress,
        feeAmounts.treasuryFeeWei,
        `Treasury fee (${feeAmounts.treasuryFeePercentage}%)`
      );
    } else {
      // All fee to treasury
      txBuilder.addETHTransfer(
        feeConfig.treasuryAddress,
        feeAmounts.totalFeeWei,
        'Platform fee (100%)'
      );
    }

    return feeAmounts;
  }

  /**
   * Create fee transaction data for random insertion
   * @param {number} totalValueUSD - Total swap value in USD
   * @param {number} ethPrice - ETH price in USD
   * @param {string} referralAddress - Optional referral address
   * @returns {Array} - Array of fee transaction data objects
   */
  createFeeTransactionData(totalValueUSD, ethPrice, referralAddress = null) {
    const feeAmounts = this.calculateFeeAmounts(
      totalValueUSD,
      ethPrice,
      referralAddress
    );
    const feeTransactions = [];

    if (referralAddress) {
      // Split fee: referrer share first, then treasury
      feeTransactions.push({
        recipient: referralAddress,
        amount: feeAmounts.referrerFeeWei,
        description: `Referrer fee (${feeAmounts.referrerFeePercentage}%)`,
        type: 'referrer_fee',
      });

      feeTransactions.push({
        recipient: feeConfig.treasuryAddress,
        amount: feeAmounts.treasuryFeeWei,
        description: `Treasury fee (${feeAmounts.treasuryFeePercentage}%)`,
        type: 'treasury_fee',
      });
    } else {
      // All fee to treasury
      feeTransactions.push({
        recipient: feeConfig.treasuryAddress,
        amount: feeAmounts.totalFeeWei,
        description: 'Platform fee (100%)',
        type: 'platform_fee',
      });
    }

    return {
      feeTransactions,
      feeAmounts,
    };
  }

  /**
   * Build fee info metadata for intent response
   * @param {number} totalValueUSD - Total value in USD
   * @param {string} referralAddress - Optional referral address
   * @returns {Object} - Fee info metadata object
   */
  buildFeeInfo(totalValueUSD, referralAddress = null) {
    const baseFeeInfo = feeConfig.calculateFees(totalValueUSD);
    const feeTransactionCount = referralAddress ? 2 : 1;

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
