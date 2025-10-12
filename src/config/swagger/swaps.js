/**
 * Swagger schemas for Swap operations
 */

module.exports = {
  schemas: {
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
          example: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        },
        fromTokenDecimals: {
          type: 'integer',
          minimum: 0,
          maximum: 18,
          example: 18,
        },
        toTokenAddress: {
          $ref: '#/components/schemas/EthereumAddress',
          example: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
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
  },

  tag: {
    name: 'Swaps',
    description: 'DEX aggregator swap operations',
  },
};
