import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env['PORT'] || '3003', 10),
    nodeEnv: process.env['NODE_ENV'] || 'development',
  },
  database: {
    url: process.env['DATABASE_URL'] || 'postgresql://localhost:5432/intent_engine',
  },
  redis: {
    url: process.env['REDIS_URL'] || 'redis://localhost:6379',
  },
  web3: {
    rpcUrls: {
      ethereum: process.env['ETHEREUM_RPC_URL'] || 'https://eth.llamarpc.com',
      arbitrum: process.env['ARBITRUM_RPC_URL'] || 'https://arb1.arbitrum.io/rpc',
      polygon: process.env['POLYGON_RPC_URL'] || 'https://polygon-rpc.com',
    },
  },
  apis: {
    oneInchApiKey: process.env['ONEINCH_API_KEY'] || '',
    zeroxApiKey: process.env['ZEROX_API_KEY'] || '',
    paraswapApiKey: process.env['PARASWAP_API_KEY'] || '',
  },
  logging: {
    level: process.env['LOG_LEVEL'] || 'info',
  },
  rateLimit: {
    windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000', 10),
    maxRequests: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100', 10),
  },
} as const;
