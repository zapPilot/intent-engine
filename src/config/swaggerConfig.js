const swaggerJsdoc = require('swagger-jsdoc');

/**
 * Swagger configuration for Intent Engine API
 */
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Intent Engine API',
      version: '1.0.0',
      description:
        'A Node.js Express API server for intent-based DeFi operations, providing optimal swap execution and bulk token pricing with intelligent fallback logic.',
      contact: {
        name: 'API Support',
        url: 'https://github.com/all-weather-protocol/intent-engine',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'https://intent-engine.fly.dev',
        description: 'Production server',
      },
    ],
    components: {
      schemas: {
        // Common schemas
        EthereumAddress: {
          type: 'string',
          pattern: '^0x[a-fA-F0-9]{40}$',
          example: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
          description: 'Valid Ethereum address',
        },
        ChainId: {
          type: 'integer',
          enum: [1, 10, 137, 42161, 8453],
          example: 1,
          description: 'Supported blockchain network ID',
        },
        ErrorResponse: {
          type: 'object',
          required: ['success', 'error'],
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: {
                  type: 'string',
                  example: 'INVALID_INPUT',
                },
                message: {
                  type: 'string',
                  example:
                    'Invalid userAddress: must be a valid Ethereum address',
                },
                details: {
                  type: 'object',
                  additionalProperties: true,
                },
              },
            },
          },
        },

        // Intent schemas
        IntentRequest: {
          type: 'object',
          required: ['userAddress', 'chainId', 'params'],
          properties: {
            userAddress: {
              $ref: '#/components/schemas/EthereumAddress',
            },
            chainId: {
              $ref: '#/components/schemas/ChainId',
            },
            params: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },

        DustZapParams: {
          type: 'object',
          required: ['toTokenAddress', 'toTokenDecimals'],
          properties: {
            dustThreshold: {
              type: 'number',
              minimum: 0,
              example: 5,
              description: 'Minimum USD value threshold for dust tokens',
            },
            targetToken: {
              type: 'string',
              enum: ['ETH'],
              example: 'ETH',
              description: 'Target token symbol (currently only ETH supported)',
            },
            referralAddress: {
              $ref: '#/components/schemas/EthereumAddress',
              description: 'Optional referral address for fee sharing',
            },
            toTokenAddress: {
              $ref: '#/components/schemas/EthereumAddress',
              description: 'Target token contract address',
            },
            toTokenDecimals: {
              type: 'integer',
              minimum: 1,
              maximum: 18,
              example: 18,
              description: 'Number of decimals for target token',
            },
            slippage: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              example: 1,
              description: 'Slippage tolerance percentage',
            },
            dustTokens: {
              type: 'array',
              items: {
                type: 'object',
                required: [
                  'address',
                  'symbol',
                  'amount',
                  'price',
                  'decimals',
                  'raw_amount_hex_str',
                ],
                properties: {
                  address: {
                    $ref: '#/components/schemas/EthereumAddress',
                    description: 'Token contract address',
                  },
                  symbol: {
                    type: 'string',
                    example: 'OpenUSDT',
                    description: 'Token symbol',
                  },
                  amount: {
                    type: 'number',
                    example: 0.943473,
                    description: 'Token amount in human readable format',
                  },
                  price: {
                    type: 'number',
                    example: 0.99985,
                    description: 'Token price in USD',
                  },
                  decimals: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 18,
                    example: 6,
                    description: 'Number of decimals for the token',
                  },
                  raw_amount_hex_str: {
                    type: 'string',
                    example: '0xe6571',
                    description: 'Token amount in hex string format',
                  },
                },
              },
              example: [
                {
                  address: '0x1217bfe6c773eec6cc4a38b5dc45b92292b6e189',
                  symbol: 'OpenUSDT',
                  amount: 0.943473,
                  price: 0.99985,
                  decimals: 6,
                  raw_amount_hex_str: '0xe6571',
                },
                {
                  address: '0x526728dbc96689597f85ae4cd716d4f7fccbae9d',
                  symbol: 'msUSD',
                  amount: 0.040852155251341185,
                  price: 0.9962465895840099,
                  decimals: 18,
                  raw_amount_hex_str: '0x9122d19a10b77f',
                },
              ],
              description:
                'Array of dust tokens to be converted (dynamic length)',
            },
          },
        },

        DustZapResponse: {
          type: 'object',
          required: [
            'success',
            'intentType',
            'mode',
            'intentId',
            'streamUrl',
            'metadata',
          ],
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            intentType: {
              type: 'string',
              example: 'dustZap',
            },
            mode: {
              type: 'string',
              example: 'streaming',
            },
            intentId: {
              type: 'string',
              example: 'dustZap_1640995200000_abc123_def456789abcdef0',
            },
            streamUrl: {
              type: 'string',
              example:
                '/api/dustzap/dustZap_1640995200000_abc123_def456789abcdef0/stream',
            },
            metadata: {
              type: 'object',
              properties: {
                totalTokens: {
                  type: 'integer',
                  example: 5,
                },
                estimatedDuration: {
                  type: 'string',
                  example: '5-10 seconds',
                },
                streamingEnabled: {
                  type: 'boolean',
                  example: true,
                },
              },
            },
          },
        },

        // Swap schemas
        SwapQuoteRequest: {
          type: 'object',
          required: [
            'chainId',
            'fromTokenAddress',
            'fromTokenDecimals',
            'toTokenAddress',
            'toTokenDecimals',
            'amount',
            'fromAddress',
            'slippage',
            'to_token_price',
          ],
          properties: {
            chainId: {
              $ref: '#/components/schemas/ChainId',
            },
            fromTokenAddress: {
              $ref: '#/components/schemas/EthereumAddress',
            },
            fromTokenDecimals: {
              type: 'integer',
              minimum: 0,
              maximum: 18,
              example: 18,
            },
            toTokenAddress: {
              $ref: '#/components/schemas/EthereumAddress',
            },
            toTokenDecimals: {
              type: 'integer',
              minimum: 0,
              maximum: 18,
              example: 6,
            },
            amount: {
              type: 'string',
              example: '1000000000000000000',
              description: 'Amount to swap in smallest token unit (wei)',
            },
            fromAddress: {
              $ref: '#/components/schemas/EthereumAddress',
            },
            slippage: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              example: 1,
            },
            to_token_price: {
              type: 'number',
              example: 1000,
              description: 'Destination token price in USD',
            },
            eth_price: {
              type: 'number',
              example: 3000,
              description: 'ETH price in USD (optional, default: 1000)',
            },
          },
        },

        SwapQuoteResponse: {
          type: 'object',
          required: [
            'approve_to',
            'to',
            'toAmount',
            'minToAmount',
            'data',
            'gasCostUSD',
            'gas',
            'custom_slippage',
            'toUsd',
            'provider',
          ],
          properties: {
            approve_to: {
              $ref: '#/components/schemas/EthereumAddress',
            },
            to: {
              $ref: '#/components/schemas/EthereumAddress',
            },
            toAmount: {
              type: 'string',
              example: '1000000000',
            },
            minToAmount: {
              type: 'string',
              example: '990000000',
            },
            data: {
              type: 'string',
              example: '0x...',
            },
            gasCostUSD: {
              type: 'number',
              example: 25.5,
            },
            gas: {
              type: 'string',
              example: '200000',
            },
            custom_slippage: {
              type: 'number',
              example: 100,
            },
            toUsd: {
              type: 'number',
              example: 974.5,
            },
            provider: {
              type: 'string',
              enum: ['1inch', 'paraswap', '0x'],
              example: '1inch',
            },
            allQuotes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  provider: {
                    type: 'string',
                  },
                  toUsd: {
                    type: 'number',
                  },
                  gasCostUSD: {
                    type: 'number',
                  },
                  toAmount: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },

        // Price schemas
        TokenPricesResponse: {
          type: 'object',
          required: [
            'results',
            'errors',
            'totalRequested',
            'fromCache',
            'fromProviders',
            'failed',
            'timestamp',
          ],
          properties: {
            results: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: true,
                  },
                  price: {
                    type: 'number',
                    example: 45000.5,
                  },
                  symbol: {
                    type: 'string',
                    example: 'btc',
                  },
                  provider: {
                    type: 'string',
                    example: 'coinmarketcap',
                  },
                  timestamp: {
                    type: 'string',
                    format: 'date-time',
                  },
                  fromCache: {
                    type: 'boolean',
                    example: false,
                  },
                  metadata: {
                    type: 'object',
                    properties: {
                      tokenId: {
                        type: 'string',
                      },
                      marketCap: {
                        type: 'number',
                      },
                      volume24h: {
                        type: 'number',
                      },
                      percentChange24h: {
                        type: 'number',
                      },
                    },
                  },
                },
              },
            },
            errors: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            totalRequested: {
              type: 'integer',
            },
            fromCache: {
              type: 'integer',
            },
            fromProviders: {
              type: 'integer',
            },
            failed: {
              type: 'integer',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
          },
        },

        // Health check schemas
        HealthResponse: {
          type: 'object',
          required: ['status', 'timestamp'],
          properties: {
            status: {
              type: 'string',
              enum: ['healthy'],
              example: 'healthy',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
          },
        },

        // Vault schemas
        VaultInfo: {
          type: 'object',
          required: [
            'id',
            'name',
            'description',
            'riskLevel',
            'expectedAPR',
            'supportedChains',
            'totalTVL',
            'status',
          ],
          properties: {
            id: {
              type: 'string',
              example: 'stablecoin-vault',
            },
            name: {
              type: 'string',
              example: 'Stablecoin Vault',
            },
            description: {
              type: 'string',
              example: 'Low-risk yield generation with stablecoins',
            },
            riskLevel: {
              type: 'string',
              enum: ['low', 'medium', 'medium-high', 'high'],
              example: 'low',
            },
            expectedAPR: {
              type: 'object',
              properties: {
                min: {
                  type: 'number',
                  example: 5,
                },
                max: {
                  type: 'number',
                  example: 15,
                },
              },
            },
            supportedChains: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/ChainId',
              },
            },
            totalTVL: {
              type: 'number',
              example: 0,
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'deprecated'],
              example: 'active',
            },
          },
        },
      },

      responses: {
        BadRequest: {
          description: 'Bad request - Invalid input parameters',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        InternalServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        ServiceUnavailable: {
          description: 'Service unavailable - External service error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
      },
    },

    tags: [
      {
        name: 'Intents',
        description: 'Intent-based DeFi operations',
      },
      {
        name: 'Swaps',
        description: 'DEX aggregator swap operations',
      },
      {
        name: 'Prices',
        description: 'Token price data with fallback providers',
      },
      {
        name: 'Vaults',
        description: 'Vault strategy information',
      },
      {
        name: 'Health',
        description: 'API health checks',
      },
    ],
  },
  apis: [
    './src/routes/*.js', // Path to the API docs
    './src/app.js', // Main app file
  ],
};

// Generate Swagger specification
const swaggerSpec = swaggerJsdoc(swaggerOptions);

module.exports = {
  swaggerOptions,
  swaggerSpec,
};
