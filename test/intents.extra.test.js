const request = require('supertest');

let app;
let IntentController;
let VaultController;

jest.mock('../src/controllers/IntentController', () => ({
  processDustZapIntent: jest.fn(),
  handleDustZapStream: jest.fn((req, res) =>
    res.status(200).send('Mock Stream')
  ), // Provide a default implementation
  getSupportedIntents: jest.fn(),
  getIntentHealth: jest.fn(),
  processOptimizeIntent: jest.fn(), // Add the missing method
}));

jest.mock('../src/controllers/VaultController', () => ({
  getAllVaults: jest.fn(),
  getVaultStrategy: jest.fn(),
}));

describe('Intents Routes Extra Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules(); // Clears the module cache
    app = require('../src/app');
    // Re-import controllers after resetting modules to ensure the mocks are applied
    IntentController = require('../src/controllers/IntentController');
    VaultController = require('../src/controllers/VaultController');

    // Default mock implementations for IntentController methods
    // These are now set on the mocked functions directly
    IntentController.processDustZapIntent.mockResolvedValue({
      success: true,
      intentType: 'dustZap',
      mode: 'streaming',
      intentId: 'mockIntentId',
      streamUrl: '/mockStreamUrl',
    });
    // handleDustZapStream already has a default implementation in jest.mock
    IntentController.getSupportedIntents.mockResolvedValue({
      success: true,
      intents: ['dustZap'],
      total: 1,
    });
    IntentController.getIntentHealth.mockResolvedValue({
      success: true,
      status: 'healthy',
      services: {},
      timestamp: new Date().toISOString(),
    });
    VaultController.getAllVaults.mockImplementation((req, res) => {
      res.json({
        success: true,
        vaults: [{ id: 'stablecoin-vault', name: 'Stablecoin Vault' }],
        total: 1,
        timestamp: new Date().toISOString(),
      });
    });
    VaultController.getVaultStrategy.mockImplementation((req, res) => {
      if (req.params.vaultId === 'stablecoin-vault') {
        res.json({
          success: true,
          vaultId: 'stablecoin-vault',
          strategy: { description: 'Mock strategy' },
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(404).json({
          success: false,
          error: { code: 'VAULT_NOT_FOUND', message: 'Vault not found' },
        });
      }
    });
    IntentController.processOptimizeIntent.mockImplementation((req, res) => {
      res.status(501).json({
        success: false,
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Optimize intent is not yet implemented',
        },
      });
    });
  });

  const validBody = {
    userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
    chainId: 1,
    params: {
      dustThreshold: 5,
      targetToken: 'ETH',
      toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      toTokenDecimals: 18,
      slippage: 1,
      dustTokens: [],
    },
  };

  describe('POST /api/v1/intents/dustZap', () => {
    it('should handle "No dust tokens found" error', async () => {
      IntentController.processDustZapIntent.mockImplementation((req, res) => {
        res.status(400).json({
          success: false,
          error: {
            code: 'NO_DUST_TOKENS',
            message: 'No dust tokens found',
          },
        });
      });
      const response = await request(app)
        .post('/api/v1/intents/dustZap')
        .send(validBody);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('NO_DUST_TOKENS');
    });

    it('should handle validation error', async () => {
      IntentController.processDustZapIntent.mockImplementation((req, res) => {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
          },
        });
      });
      const response = await request(app)
        .post('/api/v1/intents/dustZap')
        .send(validBody);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle rebalance backend error', async () => {
      IntentController.processDustZapIntent.mockImplementation((req, res) => {
        res.status(503).json({
          success: false,
          error: {
            code: 'EXTERNAL_SERVICE_ERROR',
            message: 'Rebalance backend error',
          },
        });
      });
      const response = await request(app)
        .post('/api/v1/intents/dustZap')
        .send(validBody);
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('EXTERNAL_SERVICE_ERROR');
    });

    it('should handle swap quote error', async () => {
      IntentController.processDustZapIntent.mockImplementation((req, res) => {
        res.status(503).json({
          success: false,
          error: {
            code: 'LIQUIDITY_ERROR',
            message: 'swap quote error',
          },
        });
      });
      const response = await request(app)
        .post('/api/v1/intents/dustZap')
        .send(validBody);
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('LIQUIDITY_ERROR');
    });

    it('should handle generic error', async () => {
      IntentController.processDustZapIntent.mockImplementation((req, res) => {
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Some other error',
          },
        });
      });
      const response = await request(app)
        .post('/api/v1/intents/dustZap')
        .send(validBody);
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  describe('Placeholder Endpoints', () => {
    it('should return 404 for POST /api/v1/intents/zapIn', async () => {
      const response = await request(app)
        .post('/api/v1/intents/zapIn')
        .send(validBody);
      expect(response.status).toBe(404);
    });

    it('should return 404 for POST /api/v1/intents/zapOut', async () => {
      const response = await request(app)
        .post('/api/v1/intents/zapOut')
        .send({ ...validBody, params: { percentage: 50 } });
      expect(response.status).toBe(404);
    });

    it('should return 404 for POST /api/v1/intents/zapOut with invalid percentage', async () => {
      const response = await request(app)
        .post('/api/v1/intents/zapOut')
        .send({ ...validBody, params: { percentage: 150 } });
      expect(response.status).toBe(404);
    });

    it('should return 301 for POST /api/v1/intents/rebalance', async () => {
      const response = await request(app)
        .post('/api/v1/intents/rebalance')
        .send(validBody);
      expect(response.status).toBe(301);
      expect(response.body.error.code).toBe('ENDPOINT_DEPRECATED');
    });

    it('should return 501 for POST /api/v1/intents/optimize', async () => {
      const response = await request(app)
        .post('/api/v1/intents/optimize')
        .send(validBody);
      expect(response.status).toBe(501);
      expect(response.body.error.code).toBe('NOT_IMPLEMENTED');
    });
  });

  describe('Vault Endpoints', () => {
    it('should return 200 for GET /api/v1/vaults', async () => {
      const response = await request(app).get('/api/v1/vaults');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.vaults).toBeInstanceOf(Array);
    });

    it('should return 200 for GET /api/v1/vaults/:vaultId/strategy with valid vaultId', async () => {
      const response = await request(app).get(
        '/api/v1/vaults/stablecoin-vault/strategy'
      );
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.vaultId).toBe('stablecoin-vault');
    });

    it('should return 404 for GET /api/v1/vaults/:vaultId/strategy with invalid vaultId', async () => {
      const response = await request(app).get(
        '/api/v1/vaults/invalid-vault/strategy'
      );
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('VAULT_NOT_FOUND');
    });
  });

  describe('GET /api/v1/intents', () => {
    it('should handle errors when getting supported intents', async () => {
      IntentController.getSupportedIntents.mockImplementation((req, res) => {
        res
          .status(500)
          .json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR' } });
      });
      const response = await request(app).get('/api/v1/intents');
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  describe('GET /api/v1/intents/health', () => {
    it('should handle errors during health check', async () => {
      IntentController.getIntentHealth.mockImplementation((req, res) => {
        res.status(500).json({ success: false, status: 'error' });
      });

      const response = await request(app).get('/api/v1/intents/health');
      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
    });
  });
});
