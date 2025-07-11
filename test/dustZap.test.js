const request = require('supertest');
const app = require('../src/app');
const { filterDustTokens } = require('../src/utils/dustFilters');

describe('DustZap Intent System', () => {
  describe('Dust Filters', () => {
    test('should filter dust tokens correctly', () => {
      const mockTokens = [
        {
          address: '0x1',
          symbol: 'TOKEN1',
          amount: '1000000000000000000',
          price: 0.01,
        }, // $0.01 - above threshold
        {
          address: '0x2',
          symbol: 'TOKEN2',
          amount: '100000000000000000',
          price: 0.001,
        }, // $0.0001 - below threshold
        { address: '0x3', symbol: 'USDC', amount: '1000000', price: 1 }, // Excluded stablecoin
        {
          address: '0x4',
          symbol: 'TOKEN-LP',
          amount: '1000000000000000000',
          price: 0.01,
        }, // LP token
        { address: '0x5', symbol: 'aUSDC', amount: '1000000', price: 1 }, // Aave token
      ];

      const dustTokens = filterDustTokens(mockTokens, 0.005);

      expect(dustTokens).toHaveLength(1);
      expect(dustTokens[0].symbol).toBe('TOKEN1');
      expect(dustTokens[0].value).toBe(0.01);
    });

    test('should sort dust tokens by value descending', () => {
      const mockTokens = [
        {
          address: '0x1',
          symbol: 'TOKEN1',
          amount: '1000000000000000000',
          price: 0.01,
        }, // $0.01
        {
          address: '0x2',
          symbol: 'TOKEN2',
          amount: '1000000000000000000',
          price: 0.02,
        }, // $0.02
        {
          address: '0x3',
          symbol: 'TOKEN3',
          amount: '1000000000000000000',
          price: 0.015,
        }, // $0.015
      ];

      const dustTokens = filterDustTokens(mockTokens, 0.005);

      expect(dustTokens).toHaveLength(3);
      expect(dustTokens[0].symbol).toBe('TOKEN2'); // Highest value first
      expect(dustTokens[1].symbol).toBe('TOKEN3');
      expect(dustTokens[2].symbol).toBe('TOKEN1');
    });
  });

  describe('API Endpoints', () => {
    describe('GET /api/v1/intents', () => {
      test('should return supported intents', async () => {
        const response = await request(app).get('/api/v1/intents').expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.intents).toContain('dustZap');
        expect(response.body.total).toBeGreaterThan(0);
      });
    });

    describe('GET /api/v1/intents/health', () => {
      test('should return health status', async () => {
        const response = await request(app).get('/api/v1/intents/health');

        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('services');
        expect(response.body.services).toHaveProperty('intentService');
        expect(response.body.services).toHaveProperty('swapService');
        expect(response.body.services).toHaveProperty('priceService');
        expect(response.body.services).toHaveProperty('rebalanceBackend');

        // Should be 200 if all healthy, 503 if some services are down
        expect([200, 503]).toContain(response.status);
      });
    });

    describe('POST /api/v1/intents/dustZap', () => {
      test('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/v1/intents/dustZap')
          .send({})
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('INVALID_INPUT');
      });

      test('should validate userAddress format', async () => {
        const response = await request(app)
          .post('/api/v1/intents/dustZap')
          .send({
            userAddress: 'invalid',
            chainId: 1,
            params: {},
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('userAddress');
      });

      test('should validate chainId format', async () => {
        const response = await request(app)
          .post('/api/v1/intents/dustZap')
          .send({
            userAddress: '0x742d35Cc6634C0532925a3b8D5c5c8d8e2bBC9d0',
            chainId: 'invalid',
            params: {},
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('chainId');
      });

      test('should require params object', async () => {
        const response = await request(app)
          .post('/api/v1/intents/dustZap')
          .send({
            userAddress: '0x742d35Cc6634C0532925a3b8D5c5c8d8e2bBC9d0',
            chainId: 1,
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('params');
      });
    });

    describe('Future Intent Endpoints', () => {
      test('zapIn should validate required parameters', async () => {
        const response = await request(app)
          .post('/api/v1/intents/zapIn')
          .send({
            userAddress: '0x742d35Cc6634C0532925a3b8D5c5c8d8e2bBC9d0',
            chainId: 1,
            params: {},
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('INVALID_INPUT');
        expect(response.body.error.message).toContain(
          'fromToken, vault, and amount are required'
        );
      });

      test('zapIn should return not implemented with valid params', async () => {
        const response = await request(app)
          .post('/api/v1/intents/zapIn')
          .send({
            userAddress: '0x742d35Cc6634C0532925a3b8D5c5c8d8e2bBC9d0',
            chainId: 1,
            params: {
              fromToken: '0xa0b86a33e6441c8d59fb4b4df95c4ffaffd46037',
              vault: 'stablecoin-vault',
              amount: '1000000000000000000',
            },
          })
          .expect(501);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('NOT_IMPLEMENTED');
      });

      test('zapOut should validate required parameters', async () => {
        const response = await request(app)
          .post('/api/v1/intents/zapOut')
          .send({
            userAddress: '0x742d35Cc6634C0532925a3b8D5c5c8d8e2bBC9d0',
            chainId: 1,
            params: {},
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('INVALID_INPUT');
        expect(response.body.error.message).toContain(
          'vault, percentage, and toToken are required'
        );
      });

      test('zapOut should return not implemented with valid params', async () => {
        const response = await request(app)
          .post('/api/v1/intents/zapOut')
          .send({
            userAddress: '0x742d35Cc6634C0532925a3b8D5c5c8d8e2bBC9d0',
            chainId: 1,
            params: {
              vault: 'stablecoin-vault',
              percentage: 50,
              toToken: '0xa0b86a33e6441c8d59fb4b4df95c4ffaffd46037',
            },
          })
          .expect(501);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('NOT_IMPLEMENTED');
      });

      test('rebalance should redirect to optimize endpoint', async () => {
        const response = await request(app)
          .post('/api/v1/intents/rebalance')
          .send({
            userAddress: '0x742d35Cc6634C0532925a3b8D5c5c8d8e2bBC9d0',
            chainId: 1,
            params: {},
          })
          .expect(301);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('ENDPOINT_DEPRECATED');
        expect(response.body.redirectTo).toBe('/api/v1/intents/optimize');
      });

      test('vaults endpoint should return available vaults', async () => {
        const response = await request(app).get('/api/v1/vaults').expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.vaults).toBeInstanceOf(Array);
        expect(response.body.vaults.length).toBeGreaterThan(0);
        expect(response.body.vaults[0]).toHaveProperty('id');
        expect(response.body.vaults[0]).toHaveProperty('name');
        expect(response.body.vaults[0]).toHaveProperty('description');
      });

      test('vault strategy endpoint should return strategy configuration', async () => {
        const response = await request(app)
          .get('/api/v1/vaults/stablecoin-vault/strategy')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.vaultId).toBe('stablecoin-vault');
        expect(response.body.strategy).toHaveProperty('weightMapping');
        expect(response.body.strategy).toHaveProperty('protocols');
      });

      test('vault strategy endpoint should return 404 for unknown vault', async () => {
        const response = await request(app)
          .get('/api/v1/vaults/unknown-vault/strategy')
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VAULT_NOT_FOUND');
      });
    });
  });

  describe('Transaction Builder', () => {
    const TransactionBuilder = require('../src/transactions/TransactionBuilder');

    test('should build transactions correctly', () => {
      const builder = new TransactionBuilder();

      builder.addApprove(
        '0x1234567890123456789012345678901234567890',
        '0x0987654321098765432109876543210987654321',
        '1000000000000000000'
      );

      builder.addETHTransfer(
        '0x1111111111111111111111111111111111111111',
        '100000000000000000',
        'Test transfer'
      );

      const transactions = builder.getTransactions();
      expect(transactions).toHaveLength(2);

      // Check approve transaction
      expect(transactions[0].to).toBe(
        '0x1234567890123456789012345678901234567890'
      );
      expect(transactions[0].data).toMatch(/^0x095ea7b3/); // approve method signature
      expect(transactions[0].value).toBe('0');

      // Check ETH transfer
      expect(transactions[1].to).toBe(
        '0x1111111111111111111111111111111111111111'
      );
      expect(transactions[1].value).toBe('100000000000000000');
      expect(transactions[1].data).toBe('0x');
    });

    test('should calculate total gas correctly', () => {
      const builder = new TransactionBuilder();

      builder.addApprove(
        '0x1234567890123456789012345678901234567890',
        '0x0987654321098765432109876543210987654321',
        '1000'
      );
      builder.addETHTransfer(
        '0x1111111111111111111111111111111111111111',
        '100',
        'Test'
      );

      const totalGas = builder.getTotalGas();
      expect(totalGas).toBe('71000'); // 50000 + 21000
    });
  });
});
