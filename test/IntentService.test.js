const IntentService = require('../src/intents/IntentService');
const DustZapIntentHandler = require('../src/intents/DustZapIntentHandler');

jest.mock('../src/intents/DustZapIntentHandler');

describe('IntentService', () => {
  let service;
  let mockSwapService;
  let mockPriceService;
  let mockRebalanceClient;
  let mockDustZapHandler;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSwapService = { execute: jest.fn() };
    mockPriceService = { getPrice: jest.fn() };
    mockRebalanceClient = { rebalance: jest.fn() };

    mockDustZapHandler = {
      execute: jest.fn(),
      cleanup: jest.fn(),
    };

    DustZapIntentHandler.mockImplementation(() => mockDustZapHandler);

    service = new IntentService(
      mockSwapService,
      mockPriceService,
      mockRebalanceClient
    );
  });

  describe('constructor', () => {
    it('should initialize with DustZapIntentHandler', () => {
      expect(DustZapIntentHandler).toHaveBeenCalledWith(
        mockSwapService,
        mockPriceService,
        mockRebalanceClient
      );
      expect(service.handlers.has('dustZap')).toBe(true);
      expect(service.handlers.get('dustZap')).toBe(mockDustZapHandler);
    });
  });

  describe('processIntent', () => {
    const validRequest = {
      userAddress: '0x1234567890123456789012345678901234567890',
      chainId: 1,
      params: { someParam: 'value' },
    };

    const validResponse = {
      intentId: 'test-intent-123',
      streamUrl: '/stream/test-intent-123',
      transactions: [],
    };

    it('should successfully process a valid dustZap intent', async () => {
      mockDustZapHandler.execute.mockResolvedValue(validResponse);

      const result = await service.processIntent('dustZap', validRequest);

      expect(result).toEqual(validResponse);
      expect(mockDustZapHandler.execute).toHaveBeenCalledWith(validRequest);
    });

    it('should throw error for missing intent type', async () => {
      await expect(service.processIntent(null, validRequest)).rejects.toThrow(
        'Intent type is required and must be a string'
      );

      await expect(
        service.processIntent(undefined, validRequest)
      ).rejects.toThrow('Intent type is required and must be a string');
    });

    it('should throw error for non-string intent type', async () => {
      await expect(service.processIntent(123, validRequest)).rejects.toThrow(
        'Intent type is required and must be a string'
      );

      await expect(service.processIntent({}, validRequest)).rejects.toThrow(
        'Intent type is required and must be a string'
      );
    });

    it('should throw error for unknown intent type', async () => {
      await expect(
        service.processIntent('unknownIntent', validRequest)
      ).rejects.toThrow(
        'Unknown intent type: unknownIntent. Supported types: dustZap'
      );
    });

    it('should throw error for invalid request object', async () => {
      await expect(service.processIntent('dustZap', null)).rejects.toThrow(
        'Request must be an object'
      );

      await expect(
        service.processIntent('dustZap', 'not an object')
      ).rejects.toThrow('Request must be an object');
    });

    it('should throw error for missing userAddress', async () => {
      const invalidRequest = { ...validRequest, userAddress: undefined };
      await expect(
        service.processIntent('dustZap', invalidRequest)
      ).rejects.toThrow('userAddress is required');
    });

    it('should throw error for missing chainId', async () => {
      const invalidRequest = { ...validRequest, chainId: undefined };
      await expect(
        service.processIntent('dustZap', invalidRequest)
      ).rejects.toThrow('chainId is required');
    });

    it('should throw error for missing params', async () => {
      const invalidRequest = { ...validRequest, params: undefined };
      await expect(
        service.processIntent('dustZap', invalidRequest)
      ).rejects.toThrow('params object is required');
    });

    it('should throw error for non-object params', async () => {
      const invalidRequest = { ...validRequest, params: 'not an object' };
      await expect(
        service.processIntent('dustZap', invalidRequest)
      ).rejects.toThrow('params object is required');
    });

    it('should throw error if handler returns invalid result', async () => {
      mockDustZapHandler.execute.mockResolvedValue(null);

      await expect(
        service.processIntent('dustZap', validRequest)
      ).rejects.toThrow('Intent handler returned invalid result');

      mockDustZapHandler.execute.mockResolvedValue('not an object');

      await expect(
        service.processIntent('dustZap', validRequest)
      ).rejects.toThrow('Intent handler returned invalid result');
    });

    it('should throw error if result missing intentId', async () => {
      mockDustZapHandler.execute.mockResolvedValue({
        streamUrl: '/stream/test',
      });

      await expect(
        service.processIntent('dustZap', validRequest)
      ).rejects.toThrow(
        'SSE streaming response must include intentId and streamUrl'
      );
    });

    it('should throw error if result missing streamUrl', async () => {
      mockDustZapHandler.execute.mockResolvedValue({
        intentId: 'test-123',
      });

      await expect(
        service.processIntent('dustZap', validRequest)
      ).rejects.toThrow(
        'SSE streaming response must include intentId and streamUrl'
      );
    });

    it('should handle and rethrow handler execution errors', async () => {
      const handlerError = new Error('Handler execution failed');
      mockDustZapHandler.execute.mockRejectedValue(handlerError);

      await expect(
        service.processIntent('dustZap', validRequest)
      ).rejects.toThrow('Handler execution failed');
    });
  });

  describe('getSupportedIntents', () => {
    it('should return array of supported intent types', () => {
      const supported = service.getSupportedIntents();
      expect(supported).toEqual(['dustZap']);
      expect(Array.isArray(supported)).toBe(true);
    });
  });

  describe('isIntentSupported', () => {
    it('should return true for supported intent types', () => {
      expect(service.isIntentSupported('dustZap')).toBe(true);
    });

    it('should return false for unsupported intent types', () => {
      expect(service.isIntentSupported('unknownIntent')).toBe(false);
      expect(service.isIntentSupported('zapIn')).toBe(false);
      expect(service.isIntentSupported('')).toBe(false);
    });
  });

  describe('getHandler', () => {
    it('should return handler for supported intent type', () => {
      const handler = service.getHandler('dustZap');
      expect(handler).toBe(mockDustZapHandler);
    });

    it('should return null for unsupported intent type', () => {
      expect(service.getHandler('unknownIntent')).toBeNull();
      expect(service.getHandler('')).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should call cleanup on all handlers', () => {
      service.cleanup();
      expect(mockDustZapHandler.cleanup).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', () => {
      mockDustZapHandler.cleanup.mockImplementation(() => {
        throw new Error('Cleanup failed');
      });

      // Should not throw
      expect(() => service.cleanup()).not.toThrow();
    });

    it('should skip handlers without cleanup method', () => {
      const handlerWithoutCleanup = {
        execute: jest.fn(),
      };
      service.handlers.set('testIntent', handlerWithoutCleanup);

      // Should not throw
      expect(() => service.cleanup()).not.toThrow();
    });

    it('should handle null handlers gracefully', () => {
      service.handlers.set('nullIntent', null);

      // Should not throw
      expect(() => service.cleanup()).not.toThrow();
    });
  });

  describe('validateRequest', () => {
    it('should not throw for valid request', () => {
      const validRequest = {
        userAddress: '0x123',
        chainId: 1,
        params: { test: 'value' },
      };

      expect(() => service.validateRequest(validRequest)).not.toThrow();
    });

    it('should accept different types of valid values', () => {
      const requests = [
        {
          userAddress: '0x0000000000000000000000000000000000000000',
          chainId: 42161,
          params: {},
        },
        {
          userAddress: 'any-string',
          chainId: '1', // string chainId should be accepted
          params: { nested: { object: true } },
        },
      ];

      requests.forEach(request => {
        expect(() => service.validateRequest(request)).not.toThrow();
      });
    });
  });
});
