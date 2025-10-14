/**
 * Swagger schemas for Intent-based operations
 */

module.exports = {
  schemas: {
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
          description: 'Array of dust tokens to be converted (dynamic length)',
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
  },

  tag: {
    name: 'Intents',
    description: 'Intent-based DeFi operations',
  },
};
