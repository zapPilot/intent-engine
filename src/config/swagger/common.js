/**
 * Common Swagger schemas used across multiple domains
 */

module.exports = {
  schemas: {
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
              example: 'Invalid userAddress: must be a valid Ethereum address',
            },
            details: {
              type: 'object',
              additionalProperties: true,
            },
          },
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
};
