const { getProvidersByPriority } = require('../../config/priceConfig');

/**
 * Bulk Price Processor - Handles the main bulk processing logic
 */
class BulkPriceProcessor {
  constructor(providers, rateLimitManager, cache, orchestrator) {
    this.providers = providers;
    this.rateLimitManager = rateLimitManager;
    this.cache = cache;
    this.orchestrator = orchestrator;
  }

  /**
   * Process bulk price requests with provider fallback logic
   * @param {Array<string>} symbols - Array of token symbols
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Bulk price response
   */
  async getBulkPrices(symbols, options = {}) {
    const { useCache = true, timeout = 5000 } = options;

    const errors = [];
    let fromProviders = 0;

    // Step 1: Check cache for all symbols
    const cacheResult = this.processCache(symbols, useCache);
    const results = cacheResult.results;
    const remaining = new Set(cacheResult.remaining);

    // If all symbols found in cache, return early
    if (remaining.size === 0) {
      return this.formatResponse(
        symbols,
        results,
        errors,
        fromProviders,
        remaining.size
      );
    }

    // Step 2: Try each provider in priority order
    const providers = getProvidersByPriority();

    for (const providerName of providers) {
      if (remaining.size === 0) {
        break;
      }

      const provider = this.providers[providerName];
      if (!provider || !provider.isAvailable()) {
        continue;
      }

      const processedCount = await this.processProvider(
        provider,
        providerName,
        Array.from(remaining),
        results,
        errors,
        remaining,
        timeout,
        useCache
      );

      fromProviders += processedCount;
    }

    // Step 3: Add errors for tokens that couldn't be fetched from any provider
    this.addFailureErrors(remaining, errors, providers);

    return this.formatResponse(
      symbols,
      results,
      errors,
      fromProviders,
      remaining.size
    );
  }

  /**
   * Process cache lookup for all symbols
   * @param {Array<string>} symbols - Array of symbols
   * @param {boolean} useCache - Whether to use cache
   * @returns {Object} - Cache results and remaining symbols
   */
  processCache(symbols, useCache) {
    if (!useCache) {
      return {
        results: {},
        remaining: symbols.map(s => s.toLowerCase()),
      };
    }

    return this.cache.getBulk(symbols);
  }

  /**
   * Process a single provider for bulk requests
   * @param {Object} provider - Provider instance
   * @param {string} providerName - Provider name
   * @param {Array<string>} symbolsArray - Symbols to process
   * @param {Object} results - Results object to update
   * @param {Array} errors - Errors array to update
   * @param {Set} remaining - Set of remaining symbols
   * @param {number} timeout - Request timeout
   * @param {boolean} useCache - Whether to use cache
   * @returns {number} - Number of symbols processed
   */
  async processProvider(
    provider,
    providerName,
    symbolsArray,
    results,
    errors,
    remaining,
    timeout,
    useCache
  ) {
    const initialProcessed = Object.keys(results).length;

    // Check if provider supports bulk requests
    if (!provider.getBulkPrices) {
      // Fallback to individual requests
      await this.orchestrator.processIndividualRequests(
        provider,
        providerName,
        symbolsArray,
        results,
        errors,
        remaining,
        timeout,
        useCache
      );
      return Object.keys(results).length - initialProcessed;
    }

    // Check rate limit (only consume 1 token for bulk request)
    if (!this.rateLimitManager.consumeTokens(providerName)) {
      return 0;
    }

    try {
      const bulkResult = await provider.getBulkPrices(symbolsArray, {
        timeout,
      });
      return this.processBulkResult(
        bulkResult,
        results,
        errors,
        remaining,
        useCache,
        initialProcessed
      );
    } catch (error) {
      console.error(
        `Bulk request error from provider ${providerName}:`,
        error.message
      );

      // If bulk request fails, try individual requests as fallback
      await this.orchestrator.processIndividualRequests(
        provider,
        providerName,
        symbolsArray,
        results,
        errors,
        remaining,
        timeout,
        useCache
      );

      return Object.keys(results).length - initialProcessed;
    }
  }

  /**
   * Process successful bulk result from provider
   * @param {Object} bulkResult - Bulk result from provider
   * @param {Object} results - Results object to update
   * @param {Array} errors - Errors array to update
   * @param {Set} remaining - Set of remaining symbols
   * @param {boolean} useCache - Whether to use cache
   * @param {number} initialProcessed - Initial count of processed symbols
   * @returns {number} - Number of symbols processed
   */
  processBulkResult(
    bulkResult,
    results,
    errors,
    remaining,
    useCache,
    initialProcessed
  ) {
    // Process successful results
    for (const [symbol, priceData] of Object.entries(bulkResult.results)) {
      results[symbol] = {
        ...priceData,
        fromCache: false,
      };
      remaining.delete(symbol);

      // Cache successful results
      if (useCache) {
        this.cache.set(symbol, priceData);
      }
    }

    // Add errors from this provider
    if (bulkResult.errors) {
      errors.push(...bulkResult.errors);
    }

    return Object.keys(results).length - initialProcessed;
  }

  /**
   * Add failure errors for symbols that couldn't be fetched
   * @param {Set} remaining - Set of remaining symbols
   * @param {Array} errors - Errors array to update
   * @param {Array} providers - List of provider names
   */
  addFailureErrors(remaining, errors, providers) {
    for (const symbol of remaining) {
      errors.push({
        symbol,
        error: 'Failed to get price from all providers',
        providers: providers.filter(
          p => this.providers[p] && this.providers[p].isAvailable()
        ),
      });
    }
  }

  /**
   * Format the final response
   * @param {Array<string>} originalSymbols - Original requested symbols
   * @param {Object} results - Results object
   * @param {Array} errors - Errors array
   * @param {number} fromProviders - Count from providers
   * @param {number} failedCount - Count of failed symbols
   * @returns {Object} - Formatted response
   */
  formatResponse(originalSymbols, results, errors, fromProviders, failedCount) {
    return {
      results,
      errors,
      totalRequested: originalSymbols.length,
      fromCache: originalSymbols.length - fromProviders - failedCount,
      fromProviders,
      failed: failedCount,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = BulkPriceProcessor;
