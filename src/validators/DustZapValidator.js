const DUST_ZAP_CONFIG = require('../config/dustZapConfig');

/**
 * DustZap Validator - Focused validation logic for DustZap intents
 */
class DustZapValidator {
  /**
   * Validate dustZap-specific parameters
   * @param {Object} request - Intent request
   * @param {Object} config - DustZap configuration (optional, uses default)
   */
  static validate(request, config = DUST_ZAP_CONFIG) {
    this.validateCommon(request);

    const { params } = request;
    if (!params) {
      throw new Error(config.ERRORS.MISSING_PARAMS);
    }

    const {
      dustTokens: filteredDustTokens,
      targetToken,
      referralAddress,
      toTokenAddress,
      toTokenDecimals,
    } = params;

    // Validate filteredDustTokens
    if (!filteredDustTokens || !Array.isArray(filteredDustTokens)) {
      throw new Error('filteredDustTokens must be provided as an array');
    }

    if (filteredDustTokens.length === 0) {
      throw new Error(config.ERRORS.NO_DUST_TOKENS);
    }

    // Validate each token structure
    for (const token of filteredDustTokens) {
      if (
        !token.address ||
        !token.symbol ||
        !token.decimals ||
        !token.raw_amount_hex_str ||
        !token.price
      ) {
        throw new Error(
          'Each token must have address, symbol, decimals, raw_amount_hex_str, and price'
        );
      }
    }

    if (targetToken && !config.SUPPORTED_TARGET_TOKENS.includes(targetToken)) {
      throw new Error(config.ERRORS.UNSUPPORTED_TARGET_TOKEN);
    }

    if (
      referralAddress &&
      !config.VALIDATION.ETH_ADDRESS_PATTERN.test(referralAddress)
    ) {
      throw new Error(config.ERRORS.INVALID_REFERRAL_ADDRESS);
    }

    // Validate toTokenAddress
    if (!toTokenAddress) {
      throw new Error(config.ERRORS.MISSING_TO_TOKEN_ADDRESS);
    }

    if (!config.VALIDATION.ETH_ADDRESS_PATTERN.test(toTokenAddress)) {
      throw new Error(config.ERRORS.INVALID_TO_TOKEN_ADDRESS);
    }

    // Validate toTokenDecimals
    if (toTokenDecimals === undefined || toTokenDecimals === null) {
      throw new Error(config.ERRORS.MISSING_TO_TOKEN_DECIMALS);
    }

    if (!Number.isInteger(toTokenDecimals) || toTokenDecimals <= 0) {
      throw new Error(config.ERRORS.INVALID_TO_TOKEN_DECIMALS);
    }
  }

  /**
   * Common validation for all intents
   * @param {Object} request - Intent request
   */
  static validateCommon(request) {
    const { userAddress, chainId } = request;

    if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      throw new Error('Invalid userAddress: must be a valid Ethereum address');
    }

    if (!chainId || !Number.isInteger(chainId) || chainId <= 0) {
      throw new Error('Invalid chainId: must be a positive integer');
    }
  }
}

module.exports = DustZapValidator;
