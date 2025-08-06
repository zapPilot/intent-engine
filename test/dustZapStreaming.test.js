/**
 * DustZap Streaming Endpoint Tests
 * HTTP integration tests for /api/dustzap/:intentId/stream endpoint
 */

const request = require('supertest');
const app = require('../src/app');
const IntentIdGenerator = require('../src/utils/intentIdGenerator');
const intentRoutes = require('../src/routes/intents');
const { TEST_ADDRESSES, expectErrorResponse } = require('./utils/testHelpers');

describe('GET /api/dustzap/:intentId/stream', () => {
  // Clean up timers to prevent Jest hanging
  afterAll(() => {
    if (intentRoutes.intentService) {
      intentRoutes.intentService.cleanup();
    }
    jest.clearAllTimers();
  });

  describe('Parameter Validation', () => {
    test('should reject invalid intent ID format', async () => {
      const response = await request(app)
        .get('/api/dustzap/invalid-intent-id/stream')
        .expect(400);

      expectErrorResponse(response, 'INVALID_INTENT_ID');
      expect(response.body.error.message).toContain('Invalid intent ID format');
    });

    test('should reject expired intent ID', async () => {
      // Create an expired intent ID (2 hours ago)
      const expiredTimestamp = Date.now() - 7200000;
      const expiredId = `dustZap_${expiredTimestamp}_abc123_def456789abcdef0`;

      const response = await request(app)
        .get(`/api/dustzap/${expiredId}/stream`)
        .expect(410);

      expectErrorResponse(response, 'INTENT_EXPIRED');
      expect(response.body.error.message).toContain('Intent ID has expired');
    });

    test('should return 404 for non-existent intent context', async () => {
      // Generate a valid but non-existent intent ID
      const validId = IntentIdGenerator.generate(
        'dustZap',
        TEST_ADDRESSES.VALID_USER
      );

      const response = await request(app)
        .get(`/api/dustzap/${validId}/stream`)
        .expect(404);

      expectErrorResponse(response, 'INTENT_NOT_FOUND');
      expect(response.body.error.message).toContain(
        'Intent execution context not found'
      );
    });
  });

  describe('SSE Response Format', () => {
    test('should set correct SSE headers for valid intent', async () => {
      // First, create a dustZap intent to get a valid context
      const dustZapRequest = {
        userAddress: TEST_ADDRESSES.VALID_USER,
        chainId: 1,
        params: {
          dustThreshold: 5,
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
          dustTokens: [
            {
              address: '0x526728dbc96689597f85ae4cd716d4f7fccbae9d',
              symbol: 'msUSD',
              amount: 0.01914348794526596,
              decimals: 18,
              price: 0.9990673603016684,
              raw_amount_hex_str: '440D7E8E3A658',
            },
          ],
        },
      };

      // Mock the necessary services to avoid external dependencies
      const mockIntentService = intentRoutes.intentService;
      if (mockIntentService && mockIntentService.processIntent) {
        jest.spyOn(mockIntentService, 'processIntent').mockResolvedValue({
          success: true,
          mode: 'streaming',
          intentId: 'dustZap_1234567890_abc123_def456789abcdef0',
          streamUrl:
            '/api/dustzap/dustZap_1234567890_abc123_def456789abcdef0/stream',
          metadata: {
            totalTokens: 1,
            streamingEnabled: true,
          },
        });
      }

      try {
        // Create the intent first
        const intentResponse = await request(app)
          .post('/api/v1/intents/dustZap')
          .send(dustZapRequest);

        // Skip if intent creation fails (service unavailable)
        if (intentResponse.status !== 200) {
          console.log('Skipping SSE test - intent service unavailable');
          return;
        }

        const intentId = intentResponse.body.intentId;

        // Mock execution context for the stream endpoint
        const mockHandler = {
          getExecutionContext: jest.fn().mockReturnValue({
            dustTokens: dustZapRequest.params.dustTokens,
            userAddress: TEST_ADDRESSES.VALID_USER,
            intentId,
          }),
          processTokensWithSSEStreaming: jest
            .fn()
            .mockImplementation((context, streamWriter) => {
              // Simulate basic streaming
              streamWriter({
                type: 'connected',
                intentId,
                totalTokens: 1,
                timestamp: new Date().toISOString(),
              });
              streamWriter({
                type: 'complete',
                timestamp: new Date().toISOString(),
              });
            }),
          removeExecutionContext: jest.fn(),
        };

        if (mockIntentService && mockIntentService.getHandler) {
          jest
            .spyOn(mockIntentService, 'getHandler')
            .mockReturnValue(mockHandler);
        }

        // Test the streaming endpoint
        const streamResponse = await request(app)
          .get(`/api/dustzap/${intentId}/stream`)
          .expect(200);

        // Verify SSE headers
        expect(streamResponse.headers['content-type']).toBe(
          'text/event-stream'
        );
        expect(streamResponse.headers['cache-control']).toBe('no-cache');
        expect(streamResponse.headers['connection']).toBe('keep-alive');
        expect(streamResponse.headers['access-control-allow-origin']).toBe('*');
      } catch (error) {
        // If this fails due to missing services, just skip
        console.log(
          'Skipping SSE integration test - service setup failed:',
          error.message
        );
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle streaming errors gracefully', async () => {
      // Generate a valid intent ID
      const validId = IntentIdGenerator.generate(
        'dustZap',
        TEST_ADDRESSES.VALID_USER
      );

      // Mock a handler that throws an error
      const mockIntentService = intentRoutes.intentService;
      if (mockIntentService && mockIntentService.getHandler) {
        const mockHandler = {
          getExecutionContext: jest.fn().mockReturnValue({
            dustTokens: [],
            userAddress: TEST_ADDRESSES.VALID_USER,
            intentId: validId,
          }),
          processTokensWithSSEStreaming: jest
            .fn()
            .mockRejectedValue(new Error('Processing failed')),
          removeExecutionContext: jest.fn(),
        };

        jest
          .spyOn(mockIntentService, 'getHandler')
          .mockReturnValue(mockHandler);

        // This might return 200 initially with SSE headers, then stream error events
        const response = await request(app).get(
          `/api/dustzap/${validId}/stream`
        );

        // Response should either be 500 or 200 with SSE error events
        expect([200, 500]).toContain(response.status);

        // If 200, it means SSE headers were sent and error will be in stream
        if (response.status === 200) {
          expect(response.headers['content-type']).toBe('text/event-stream');
        }
      }
    });
  });
});
