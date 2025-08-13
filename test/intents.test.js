const request = require('supertest');
const app = require('../src/app');

describe('Intent API Endpoints', () => {
  describe('POST /api/v1/intents/zapIn', () => {
    describe('Parameter Validation', () => {
      it('should validate vault parameter', async () => {
        const request_data = {
          userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
          chainId: 1,
          params: {
            amount: '1000000000000000000',
            fromToken: '0x1234567890123456789012345678901234567890',
          },
        };
        await request(app)
          .post('/api/v1/intents/zapIn')
          .send(request_data)
          .expect(404);
      });

      it('should validate amount parameter', async () => {
        const request_data = {
          userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
          chainId: 1,
          params: {
            vault: 'stablecoin-vault',
            fromToken: '0x1234567890123456789012345678901234567890',
          },
        };
        await request(app)
          .post('/api/v1/intents/zapIn')
          .send(request_data)
          .expect(404);
      });

      it('should validate fromToken parameter', async () => {
        const request_data = {
          userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
          chainId: 1,
          params: {
            vault: 'stablecoin-vault',
            amount: '1000000000000000000',
          },
        };
        await request(app)
          .post('/api/v1/intents/zapIn')
          .send(request_data)
          .expect(404);
      });
    });
  });

  describe('POST /api/v1/intents/zapOut', () => {
    describe('Edge Cases', () => {
      it('should handle 0% withdrawal', async () => {
        const request_data = {
          userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
          chainId: 1,
          params: {
            vault: 'stablecoin-vault',
            percentage: 0,
            toToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          },
        };
        await request(app)
          .post('/api/v1/intents/zapOut')
          .send(request_data)
          .expect(404);
      });

      it('should handle 100% withdrawal', async () => {
        const request_data = {
          userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
          chainId: 1,
          params: {
            vault: 'stablecoin-vault',
            percentage: 100,
            toToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          },
        };
        await request(app)
          .post('/api/v1/intents/zapOut')
          .send(request_data)
          .expect(404);
      });
    });
  });
});
