/**
 * Swagger schemas for Balance operations
 */

module.exports = {
  schemas: {
    BalanceRequest: {
      type: 'object',
      properties: {
        tokens: {
          type: 'array',
          description: 'Optional list of token addresses to filter balances',
          items: {
            $ref: '#/components/schemas/EthereumAddress',
          },
        },
      },
    },

    BalanceResponse: {
      type: 'object',
      required: [
        'success',
        'chainId',
        'address',
        'balances',
        'totalBalanceUSD',
        'timestamp',
        'metadata',
      ],
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
        chainId: {
          $ref: '#/components/schemas/ChainId',
        },
        address: {
          $ref: '#/components/schemas/EthereumAddress',
        },
        balances: {
          type: 'array',
          items: {
            type: 'object',
            required: [
              'token',
              'symbol',
              'balance',
              'balanceUSD',
              'decimals',
              'price',
            ],
            properties: {
              token: {
                $ref: '#/components/schemas/EthereumAddress',
              },
              symbol: {
                type: 'string',
                example: 'USDC',
              },
              balance: {
                type: 'string',
                description: "Balance in token's smallest unit (wei/satoshis)",
                example: '1000000000',
              },
              balanceUSD: {
                type: 'number',
                description: 'Total balance value in USD',
                example: 1000.5,
              },
              decimals: {
                type: 'integer',
                minimum: 0,
                maximum: 18,
                example: 6,
              },
              price: {
                type: 'number',
                description: 'Token price in USD',
                example: 1.0,
              },
            },
          },
        },
        totalBalanceUSD: {
          type: 'number',
          description: 'Total balance across all tokens in USD',
          example: 5250.75,
        },
        timestamp: {
          type: 'string',
          format: 'date-time',
          description: 'Timestamp of balance retrieval',
        },
        metadata: {
          type: 'object',
          properties: {
            fromCache: {
              type: 'boolean',
              description: 'Whether the balance was retrieved from cache',
              example: true,
            },
            cacheAge: {
              type: 'integer',
              description: 'Age of cached data in seconds',
              example: 15,
            },
          },
        },
      },
    },
  },

  tag: {
    name: 'Balances',
    description: 'Multi-chain token balance retrieval',
  },
};
