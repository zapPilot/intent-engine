/**
 * Custom application errors for standardized error handling.
 */

class BaseError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when a token symbol cannot be found in a provider's mapping file.
 * This is a configuration error that is actionable by developers.
 */
class MissingTokenMappingError extends BaseError {
  /**
   * @param {string} provider - The name of the price provider.
   * @param {string} symbol - The token symbol that is missing.
   */
  constructor(provider, symbol) {
    const developerMessage = `Token '${symbol}' not found in mapping for provider '${provider}'. Please add it to the corresponding JSON configuration file.`;
    const productionMessage = `Configuration for token '${symbol}' is missing.`;

    // Use the detailed message in development, otherwise use the generic one.
    const message =
      process.env.NODE_ENV !== 'production'
        ? developerMessage
        : productionMessage;

    super(message);
    this.provider = provider;
    this.symbol = symbol;
    this.developerMessage = developerMessage; // Make the detailed message always available for logging.
  }
}

module.exports = {
  MissingTokenMappingError,
};
