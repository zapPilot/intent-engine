/**
 * Centralized application configuration
 */

const config = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    env: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || '*',
  },

  // API configuration
  api: {
    basePath: '/api/v1',
    timeout: parseInt(process.env.API_TIMEOUT, 10) || 30000,
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 30000,
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
  },

  // External services
  externalServices: {
    rebalanceBackend: {
      url: process.env.REBALANCE_BACKEND_URL || 'http://localhost:5000',
      timeout: parseInt(process.env.REBALANCE_BACKEND_TIMEOUT, 10) || 10000,
    },
    ethPrice: {
      default: parseFloat(process.env.DEFAULT_ETH_PRICE) || 3000,
    },
  },

  // Retry configuration
  retry: {
    attempts: parseInt(process.env.RETRY_ATTEMPTS, 10) || 3,
    factor: parseInt(process.env.RETRY_FACTOR, 10) || 2,
    minTimeout: parseInt(process.env.RETRY_MIN_TIMEOUT, 10) || 3000,
    maxTimeout: parseInt(process.env.RETRY_MAX_TIMEOUT, 10) || 10000,
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000, // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    message: 'Too many requests from this IP, please try again later.',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    colorize: process.env.LOG_COLORIZE === 'true',
  },

  // Security
  security: {
    helmet: {
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
    },
    trustProxy: process.env.TRUST_PROXY === 'true',
  },

  // Swap configuration
  swap: {
    defaultSlippage: parseFloat(process.env.DEFAULT_SLIPPAGE) || 0.5,
    maxSlippage: parseFloat(process.env.MAX_SLIPPAGE) || 50,
    defaultTimeout: parseInt(process.env.SWAP_TIMEOUT, 10) || 30000,
    minTimeout: 1000,
    maxTimeout: 30000,
  },

  // Transaction configuration
  transaction: {
    defaultGasLimit: process.env.DEFAULT_GAS_LIMIT || '30000',
    approvalGasLimit: process.env.APPROVAL_GAS_LIMIT || '30000',
  },

  // SSE (Server-Sent Events) configuration
  sse: {
    heartbeatInterval: parseInt(process.env.SSE_HEARTBEAT_INTERVAL, 10) || 30000,
    connectionTimeout: parseInt(process.env.SSE_CONNECTION_TIMEOUT, 10) || 300000, // 5 minutes
    maxConnections: parseInt(process.env.SSE_MAX_CONNECTIONS, 10) || 1000,
  },

  // Cache configuration
  cache: {
    ttl: parseInt(process.env.CACHE_TTL, 10) || 300, // 5 minutes
    checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD, 10) || 60, // 1 minute
  },

  // Feature flags
  features: {
    enableMockData: process.env.ENABLE_MOCK_DATA === 'true',
    enableSwagger: process.env.ENABLE_SWAGGER !== 'false', // Default to true
    enableMetrics: process.env.ENABLE_METRICS === 'true',
    enableHealthCheck: process.env.ENABLE_HEALTH_CHECK !== 'false', // Default to true
  },

  // Development configuration
  development: {
    enableStackTrace: process.env.NODE_ENV === 'development',
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING === 'true',
    mockDataDelay: parseInt(process.env.MOCK_DATA_DELAY, 10) || 0,
  },

  // Validation
  validation: {
    maxTokensPerRequest: parseInt(process.env.MAX_TOKENS_PER_REQUEST, 10) || 100,
    maxTokenSymbolLength: parseInt(process.env.MAX_TOKEN_SYMBOL_LENGTH, 10) || 20,
    ethAddressPattern: /^0x[a-fA-F0-9]{40}$/,
  },
};

// Freeze configuration to prevent accidental modifications
module.exports = Object.freeze(config);