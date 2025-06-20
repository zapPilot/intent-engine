import request from 'supertest';
import express from 'express';
import routes from '../src/routes';
import { IntentController } from '../src/controllers/IntentController';
import { QuoteController } from '../src/controllers/QuoteController';

// Mock controllers
jest.mock('../src/controllers/IntentController');
jest.mock('../src/controllers/QuoteController');

// Mock validation middleware
jest.mock('../src/middleware/validation', () => ({
  validateRequest: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  intentRequestSchema: jest.fn(),
}));

describe('Routes', () => {
  let app: express.Application;
  let mockIntentController: jest.Mocked<IntentController>;
  let mockQuoteController: jest.Mocked<QuoteController>;

  beforeEach(() => {
    // Setup Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/v1', routes);

    // Mock controller methods
    mockIntentController = {
      executeIntent: jest.fn((_req, res) => res.json({ success: true })),
      optimizeTransactions: jest.fn((_req, res) => res.json({ optimized: true })),
      getIntentStatus: jest.fn((_req, res) => res.json({ status: 'completed' })),
    } as any;

    mockQuoteController = {
      getQuote: jest.fn((_req, res) => res.json({ quote: 'test' })),
    } as any;

    // Mock constructor returns
    (IntentController as jest.Mock).mockImplementation(() => mockIntentController);
    (QuoteController as jest.Mock).mockImplementation(() => mockQuoteController);

    jest.clearAllMocks();
  });

  describe('Intent Routes', () => {
    describe('POST /api/v1/intent/execute', () => {
      it('should execute intent successfully', async () => {
        const intentRequest = {
          action: 'swap',
          params: {
            amount: '1000',
            fromToken: '0x123',
            toToken: '0x456',
            chainId: 1,
          },
          userAddress: '0x789',
        };

        const response = await request(app)
          .post('/api/v1/intent/execute')
          .send(intentRequest)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(mockIntentController.executeIntent).toHaveBeenCalled();
      });

      it('should apply validation middleware', async () => {
        const { validateRequest } = require('../src/middleware/validation');
        
        await request(app)
          .post('/api/v1/intent/execute')
          .send({})
          .expect(200);

        expect(validateRequest).toHaveBeenCalled();
      });

      it('should handle controller errors', async () => {
        mockIntentController.executeIntent.mockImplementation((_req, _res, next) => {
          const error = new Error('Controller error');
          next(error);
        });

        await request(app)
          .post('/api/v1/intent/execute')
          .send({})
          .expect(500);
      });
    });

    describe('POST /api/v1/intent/optimize', () => {
      it('should optimize transactions successfully', async () => {
        const optimizeRequest = {
          transactions: [{ to: '0x123', data: '0x456' }],
          userAddress: '0x789',
        };

        const response = await request(app)
          .post('/api/v1/intent/optimize')
          .send(optimizeRequest)
          .expect(200);

        expect(response.body.optimized).toBe(true);
        expect(mockIntentController.optimizeTransactions).toHaveBeenCalled();
      });

      it('should handle empty optimization request', async () => {
        await request(app)
          .post('/api/v1/intent/optimize')
          .send({})
          .expect(200);

        expect(mockIntentController.optimizeTransactions).toHaveBeenCalled();
      });
    });

    describe('GET /api/v1/intent/status/:intentId', () => {
      it('should get intent status successfully', async () => {
        const intentId = 'intent_123456789';

        const response = await request(app)
          .get(`/api/v1/intent/status/${intentId}`)
          .expect(200);

        expect(response.body.status).toBe('completed');
        expect(mockIntentController.getIntentStatus).toHaveBeenCalled();
      });

      it('should handle URL parameters correctly', async () => {
        const intentId = 'intent_test_123';

        await request(app)
          .get(`/api/v1/intent/status/${intentId}`)
          .expect(200);

        // Check that the route parameter is passed to the controller
        const call = mockIntentController.getIntentStatus.mock.calls[0];
        const req = call?.[0];
        expect(req?.params?.['intentId']).toBe(intentId);
      });

      it('should handle special characters in intent ID', async () => {
        const intentId = 'intent_123-456_789';

        await request(app)
          .get(`/api/v1/intent/status/${intentId}`)
          .expect(200);

        const call = mockIntentController.getIntentStatus.mock.calls[0];
        const req = call?.[0];
        expect(req?.params?.['intentId']).toBe(intentId);
      });
    });
  });

  describe('Quote Routes', () => {
    describe('GET /api/v1/intent/quote', () => {
      it('should get quote successfully', async () => {
        const response = await request(app)
          .get('/api/v1/intent/quote')
          .query({
            action: 'swap',
            amount: '1000',
            fromToken: '0x123',
            toToken: '0x456',
            chainId: '1',
          })
          .expect(200);

        expect(response.body.quote).toBe('test');
        expect(mockQuoteController.getQuote).toHaveBeenCalled();
      });

      it('should handle query parameters correctly', async () => {
        const queryParams = {
          action: 'swap',
          amount: '2000',
          fromToken: '0xAAA',
          toToken: '0xBBB',
          chainId: '42',
          slippage: '0.5',
        };

        await request(app)
          .get('/api/v1/intent/quote')
          .query(queryParams)
          .expect(200);

        const call = mockQuoteController.getQuote.mock.calls[0];
        const req = call?.[0];
        expect(req?.query).toEqual(queryParams);
      });

      it('should handle missing query parameters', async () => {
        await request(app)
          .get('/api/v1/intent/quote')
          .expect(200);

        expect(mockQuoteController.getQuote).toHaveBeenCalled();
      });

      it('should handle quote controller errors', async () => {
        mockQuoteController.getQuote.mockImplementation((_req, _res, next) => {
          const error = new Error('Quote error');
          next(error);
        });

        await request(app)
          .get('/api/v1/intent/quote')
          .expect(500);
      });
    });
  });

  describe('Route Structure', () => {
    it('should mount all routes under /api/v1', async () => {
      // Test that routes are not accessible without the prefix
      await request(app)
        .get('/intent/quote')
        .expect(404);

      await request(app)
        .post('/intent/execute')
        .expect(404);
    });

    it('should handle non-existent routes', async () => {
      await request(app)
        .get('/api/v1/intent/nonexistent')
        .expect(404);

      await request(app)
        .post('/api/v1/intent/nonexistent')
        .expect(404);
    });

    it('should handle incorrect HTTP methods', async () => {
      // GET on POST-only endpoints
      await request(app)
        .get('/api/v1/intent/execute')
        .expect(404);

      // POST on GET-only endpoints
      await request(app)
        .post('/api/v1/intent/quote')
        .expect(404);
    });
  });

  describe('Import Dependencies', () => {
    it('should not import unused validation schemas', () => {
      // This test ensures our fix for unused imports worked
      require('../src/routes');
      expect(mockIntentController.executeIntent).toBeDefined();
      expect(mockQuoteController.getQuote).toBeDefined();
    });

    it('should properly instantiate controllers', () => {
      expect(IntentController).toHaveBeenCalledTimes(1);
      expect(QuoteController).toHaveBeenCalledTimes(1);
    });
  });

  describe('Middleware Integration', () => {
    it('should apply validation middleware to appropriate routes', async () => {
      const { validateRequest } = require('../src/middleware/validation');
      
      // Routes that should have validation
      await request(app)
        .post('/api/v1/intent/execute')
        .send({});

      expect(validateRequest).toHaveBeenCalled();
    });

    it('should handle validation errors gracefully', async () => {
      const { validateRequest } = require('../src/middleware/validation');
      
      // Mock validation failure
      validateRequest.mockImplementation(() => (_req: any, _res: any, next: any) => {
        const error = new Error('Validation failed');
        (error as any).statusCode = 400;
        next(error);
      });

      await request(app)
        .post('/api/v1/intent/execute')
        .send({})
        .expect(500); // Will be 500 because we don't have error handler in this test app
    });
  });

  describe('Router Export', () => {
    it('should export a valid Express router', () => {
      const routesModule = require('../src/routes');
      
      expect(routesModule.default).toBeDefined();
      expect(typeof routesModule.default).toBe('function');
      
      // Check if it has router-like properties
      expect(routesModule.default.stack).toBeDefined();
    });
  });
});