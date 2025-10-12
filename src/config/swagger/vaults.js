/**
 * Swagger schemas for Vault operations
 */

module.exports = {
  schemas: {
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

  tag: {
    name: 'Vaults',
    description: 'Vault strategy information',
  },
};
