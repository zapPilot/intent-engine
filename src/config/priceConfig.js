/**
 * Price Provider Configuration
 * Defines provider priorities, rate limits, and settings
 */

const coinmarketcapMapping = require('./tokenMappings/coinmarketcap.json');
const coingeckoMapping = require('./tokenMappings/coingecko.json');

const priceConfig = {
  // Provider configurations in priority order
  providers: {
    coinmarketcap: {
      priority: 1,
      rateLimit: {
        rate: 30 / 60, // 30 requests per minute = 0.5 requests per second
        capacity: 30,
      },
      timeout: 5000,
      baseUrl: 'https://pro-api.coinmarketcap.com/v2/cryptocurrency',
      requiresApiKey: true,
      apiKeyHeader: 'X-CMC_PRO_API_KEY',
    },
    coingecko: {
      priority: 2,
      rateLimit: {
        rate: 100 / 60, // 100 requests per minute = 1.67 requests per second
        capacity: 100,
      },
      timeout: 5000,
      baseUrl: 'https://api.geckoterminal.com/api/v2/simple',
      requiresApiKey: false,
    },
    // Future providers can be added here
    cryptocompare: {
      priority: 3,
      rateLimit: {
        rate: 50 / 60, // 50 requests per minute
        capacity: 50,
      },
      timeout: 5000,
      baseUrl: 'https://min-api.cryptocompare.com/data',
      requiresApiKey: false,
      enabled: false, // Disabled for now
    },
  },

  // Cache configuration
  cache: {
    ttl: 180, // 3 minutes (same as Python implementation)
  },

  // Default settings
  defaults: {
    timeout: 5000,
    retries: 2,
    retryDelay: 1000,
  },

  // Token symbol mappings for different providers (loaded from JSON files)
  tokenMappings: {
    coinmarketcap: coinmarketcapMapping,
    coingecko: coingeckoMapping,
  },
};

/**
 * Get providers sorted by priority
 * @returns {Array} - Array of provider names sorted by priority
 */
function getProvidersByPriority() {
  return Object.entries(priceConfig.providers)
    .filter(([, config]) => config.enabled !== false)
    .sort((a, b) => a[1].priority - b[1].priority)
    .map(([name]) => name);
}

/**
 * Get configuration for a specific provider
 * @param {string} provider - Provider name
 * @returns {Object|null} - Provider configuration or null if not found
 */
function getProviderConfig(provider) {
  return priceConfig.providers[provider] || null;
}

/**
 * Get token identifier for a specific provider
 * @param {string} provider - Provider name
 * @param {string} symbol - Token symbol (e.g., 'btc', 'eth')
 * @returns {string|null} - Provider-specific token identifier
 */
function getTokenId(provider, symbol) {
  const mapping = priceConfig.tokenMappings[provider];
  if (!mapping) {
    return null;
  }
  return mapping[symbol.toLowerCase()] || null;
}

module.exports = {
  priceConfig,
  getProvidersByPriority,
  getProviderConfig,
  getTokenId,
};
