/**
 * UnifiedZapIntentHandler Unit Tests
 */

jest.mock('../../src/validators/UnifiedZapValidator');
jest.mock('../../src/utils/intentIdGenerator');
jest.mock('../../src/managers/ExecutionContextManager');

const UnifiedZapIntentHandler = require('../../src/intents/UnifiedZapIntentHandler');
const UnifiedZapValidator = require('../../src/validators/UnifiedZapValidator');
const IntentIdGenerator = require('../../src/utils/intentIdGenerator');

describe('UnifiedZapIntentHandler', () => {
  let handler;
  let mockSwapService;
  let mockPriceService;
  let mockRebalanceClient;
  let mockExecutor;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSwapService = {};
    mockPriceService = {};
    mockRebalanceClient = {};

    handler = new UnifiedZapIntentHandler(
      mockSwapService,
      mockPriceService,
      mockRebalanceClient
    );

    // Mock executor
    mockExecutor = {
      prepareExecutionContext: jest.fn(),
      generateTransactions: jest.fn(),
      estimateGas: jest.fn(),
      assembleFinalTransactions: jest.fn(),
      estimateProcessingDuration: jest.fn().mockReturnValue(30),
    };
    handler.executor = mockExecutor;
  });

  describe('constructor', () => {
    test('should initialize with context manager', () => {
      expect(handler.contextManager).toBeDefined();
    });

    test('should initialize executor', () => {
      expect(handler.executor).toBeDefined();
    });
  });

  describe('validate', () => {
    test('should call UnifiedZapValidator.validate', () => {
      const request = { type: 'unifiedZap' };
      handler.validate(request);

      expect(UnifiedZapValidator.validate).toHaveBeenCalledWith(
        request,
        expect.anything()
      );
    });
  });

  describe('execute', () => {
    test('should prepare execution context and return SSE response', async () => {
      const request = {
        type: 'unifiedZap',
        userAddress: '0xUser',
        strategies: [],
      };

      const mockContext = {
        strategyAllocations: [{ strategy: 'test' }],
        protocolAllocations: [{ protocol: 'aave' }],
        userAddress: '0xUser',
      };

      mockExecutor.prepareExecutionContext.mockResolvedValue(mockContext);
      IntentIdGenerator.generate.mockReturnValue('intent_123');

      const result = await handler.execute(request);

      expect(mockExecutor.prepareExecutionContext).toHaveBeenCalledWith(request);
      expect(result).toMatchObject({
        success: true,
        intentType: 'unifiedZap',
        mode: 'streaming',
        intentId: 'intent_123',
      });
    });

    test('should throw error if validation fails', async () => {
      UnifiedZapValidator.validate.mockImplementation(() => {
        throw new Error('Validation failed');
      });

      await expect(handler.execute({})).rejects.toThrow('Validation failed');
    });

    test('should handle executor errors', async () => {
      UnifiedZapValidator.validate.mockImplementation(() => {}); // Don't throw
      mockExecutor.prepareExecutionContext.mockRejectedValue(
        new Error('Executor error')
      );

      await expect(handler.execute({ userAddress: '0x123' })).rejects.toThrow(
        'Executor error'
      );
    });
  });

  describe('buildSSEResponse', () => {
    test('should build SSE response with metadata', () => {
      const executionContext = {
        strategyAllocations: [{ id: 1 }, { id: 2 }],
        protocolAllocations: [{ chainId: 1 }, { chainId: 137 }],
        userAddress: '0xUser',
      };

      IntentIdGenerator.generate.mockReturnValue('intent_456');

      const result = handler.buildSSEResponse(executionContext);

      expect(result).toMatchObject({
        success: true,
        intentType: 'unifiedZap',
        mode: 'streaming',
        intentId: 'intent_456',
        streamUrl: '/api/unifiedzap/intent_456/stream',
      });

      expect(result.metadata).toMatchObject({
        totalStrategies: 2,
        totalProtocols: 2,
        streamingEnabled: true,
      });
    });
  });

  describe('processWithSSEStreaming', () => {
    test('should process with progress events', async () => {
      const executionContext = {
        strategyAllocations: [],
        protocolAllocations: [],
      };

      const streamWriter = jest.fn();
      mockExecutor.generateTransactions.mockResolvedValue([]);
      mockExecutor.estimateGas.mockResolvedValue([]);
      mockExecutor.assembleFinalTransactions.mockResolvedValue([]);

      await handler.processWithSSEStreaming(executionContext, streamWriter);

      expect(streamWriter).toHaveBeenCalled();
      expect(mockExecutor.generateTransactions).toHaveBeenCalled();
    });

    test('should emit phase progress events', async () => {
      const executionContext = {
        strategyAllocations: [{ id: 1 }],
        protocolAllocations: [{ id: 1 }],
      };

      const streamWriter = jest.fn();
      mockExecutor.generateTransactions.mockResolvedValue([{ tx: 1 }]);
      mockExecutor.estimateGas.mockResolvedValue([{ gas: 1000 }]);
      mockExecutor.assembleFinalTransactions.mockResolvedValue([{ tx: 1 }]);

      await handler.processWithSSEStreaming(executionContext, streamWriter);

      const calls = streamWriter.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
    });

    test('should handle errors in streaming', async () => {
      const executionContext = {
        strategyAllocations: [],
        protocolAllocations: [],
      };

      const streamWriter = jest.fn();
      mockExecutor.generateTransactions.mockRejectedValue(new Error('TX error'));

      await expect(
        handler.processWithSSEStreaming(executionContext, streamWriter)
      ).rejects.toThrow('TX error');
    });
  });

  describe('_getUniqueChains', () => {
    test('should extract unique chain names', () => {
      const protocolAllocations = [
        { chain: 'ethereum' },
        { chain: 'polygon' },
        { chain: 'ethereum' },
      ];

      const chains = handler._getUniqueChains(protocolAllocations);
      expect(chains).toHaveLength(2);
      expect(chains).toContain('ethereum');
      expect(chains).toContain('polygon');
    });
  });

  describe('_countRequiredSwaps', () => {
    test('should count protocols requiring swaps', () => {
      const protocolAllocations = [
        { requiresSwap: true },
        { requiresSwap: false },
        { requiresSwap: true },
      ];

      const count = handler._countRequiredSwaps(protocolAllocations);
      expect(count).toBe(2);
    });

    test('should return 0 for no swaps', () => {
      const count = handler._countRequiredSwaps([]);
      expect(count).toBe(0);
    });
  });

  describe('context management', () => {
    test('should store execution context', () => {
      const spy = jest.spyOn(handler.contextManager, 'storeExecutionContext');

      const context = {
        strategyAllocations: [],
        protocolAllocations: [],
        userAddress: '0xUser',
      };

      IntentIdGenerator.generate.mockReturnValue('intent_789');
      handler.buildSSEResponse(context);

      expect(spy).toHaveBeenCalledWith('intent_789', context);
    });

    test('should retrieve execution context', () => {
      const spy = jest.spyOn(handler.contextManager, 'getExecutionContext');
      handler.getExecutionContext('intent_id');

      expect(spy).toHaveBeenCalledWith('intent_id');
    });

    test('should remove execution context', () => {
      const spy = jest.spyOn(handler.contextManager, 'removeExecutionContext');
      handler.removeExecutionContext('intent_id');

      expect(spy).toHaveBeenCalledWith('intent_id');
    });
  });

  describe('getStatus', () => {
    test('should return handler status', () => {
      jest.spyOn(handler.contextManager, 'getStatus').mockReturnValue({ active: 1 });
      handler.contextManager.executionContexts = new Map();

      const status = handler.getStatus();
      expect(status).toBeDefined();
      expect(status).toHaveProperty('contextManager');
      expect(status).toHaveProperty('executor');
    });
  });

  describe('cleanup', () => {
    test('should cleanup resources', () => {
      expect(() => handler.cleanup()).not.toThrow();
    });
  });
});
