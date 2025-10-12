/**
 * Swagger schemas for Token price operations
 */

module.exports = {
  schemas: {
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
  },

  tag: {
    name: 'Prices',
    description: 'Token price data with fallback providers',
  },
};
