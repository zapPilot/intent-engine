/**
 * Fee Configuration
 * Centralized configuration for platform fees, referrer shares, and treasury settings
 */

module.exports = {
  /**
   * Platform fee rate (percentage of transaction value)
   * Default: 0.0001 (0.01%)
   * Environment: PLATFORM_FEE_RATE
   */
  platformFeeRate: parseFloat(process.env.PLATFORM_FEE_RATE) || 0.0001,

  /**
   * Referrer fee share (percentage of platform fee going to referrer)
   * Default: 0.7 (70% to referrer, 30% to treasury)
   * Environment: REFERRER_FEE_SHARE
   */
  referrerFeeShare: parseFloat(process.env.REFERRER_FEE_SHARE) || 0.7,

  /**
   * Treasury address for receiving platform fees
   * Environment: TREASURY_ADDRESS
   */
  treasuryAddress:
    process.env.TREASURY_ADDRESS ||
    '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',

  /**
   * Calculate fee amounts for a given transaction value
   * @param {number} totalValueUSD - Total transaction value in USD
   * @returns {Object} - Fee breakdown object
   */
  calculateFees(totalValueUSD) {
    const totalFeeUSD = totalValueUSD * this.platformFeeRate;
    const referrerFeeUSD = totalFeeUSD * this.referrerFeeShare;
    const treasuryFeeUSD = totalFeeUSD * (1 - this.referrerFeeShare);

    return {
      totalFeeUSD,
      referrerFeeUSD,
      treasuryFeeUSD,
      referrerFeePercentage: this.referrerFeeShare * 100,
      treasuryFeePercentage: (1 - this.referrerFeeShare) * 100,
    };
  },

  /**
   * Get treasury address
   * @returns {string} - Treasury address
   */
  getTreasuryAddress() {
    return this.treasuryAddress;
  },

  /**
   * Get platform fee rate as percentage
   * @returns {number} - Platform fee rate as percentage (e.g., 0.01 for 0.01%)
   */
  getPlatformFeePercentage() {
    return this.platformFeeRate * 100;
  },
};
