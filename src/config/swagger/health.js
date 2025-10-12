/**
 * Swagger schemas for Health check operations
 */

module.exports = {
  schemas: {
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
  },

  tag: {
    name: 'Health',
    description: 'API health checks',
  },
};
