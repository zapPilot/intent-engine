const DustZapIntentHandler = require('../src/intents/DustZapIntentHandler');
const IntentIdGenerator = require('../src/utils/intentIdGenerator');
const DUST_ZAP_CONFIG = require('../src/config/dustZapConfig');

describe('SSE Streaming Functionality', () => {
  let handler;
  let mockSwapService;
  let mockPriceService;
  let mockRebalanceClient;

  beforeEach(() => {
    mockSwapService = {
      getSecondBestSwapQuote: jest.fn(),
    };
    mockPriceService = {
      getPrice: jest.fn(),
    };
    mockRebalanceClient = {
      getUserTokenBalances: jest.fn(),
    };

    handler = new DustZapIntentHandler(
      mockSwapService,
      mockPriceService,
      mockRebalanceClient
    );

    // Clear any existing execution contexts
    handler.executionContexts.clear();
  });

  afterEach(() => {
    // Clean up any timers or contexts
    handler.executionContexts.clear();

    // Clear any intervals to prevent Jest warnings
    if (handler.cleanupTimer) {
      clearInterval(handler.cleanupTimer);
    }
  });

  afterAll(() => {
    // Clear all timers and handles
    jest.clearAllTimers();
  });

  describe('SSE Configuration', () => {
    it('should have SSE streaming enabled by default', () => {
      expect(DUST_ZAP_CONFIG.SSE_STREAMING.ENABLED).toBe(true);
    });

    it('should have token-level streaming batch size', () => {
      expect(DUST_ZAP_CONFIG.SSE_STREAMING.STREAM_BATCH_SIZE).toBe(1);
    });

    it('should have reasonable timeout values', () => {
      expect(DUST_ZAP_CONFIG.SSE_STREAMING.CONNECTION_TIMEOUT).toBeGreaterThan(
        0
      );
      expect(DUST_ZAP_CONFIG.SSE_STREAMING.CLEANUP_INTERVAL).toBeGreaterThan(0);
    });
  });

  describe('Intent ID Generation', () => {
    it('should generate valid intent IDs', () => {
      const userAddress = '0x2eCBC6f229feD06044CDb0dD772437a30190CD50';
      const intentId = IntentIdGenerator.generate('dustZap', userAddress);

      expect(intentId).toMatch(/^dustZap_\d+_[a-fA-F0-9]{6}_[a-fA-F0-9]{16}$/);
      expect(IntentIdGenerator.validate(intentId)).toBe(true);
    });

    it('should extract intent type correctly', () => {
      const intentId = 'dustZap_1234567890_abcdef_0123456789abcdef';
      expect(IntentIdGenerator.extractIntentType(intentId)).toBe('dustZap');
    });

    it('should validate intent ID format', () => {
      expect(IntentIdGenerator.validate('dustZap_1234_abc_def')).toBe(true);
      expect(IntentIdGenerator.validate('invalid')).toBe(false);
      expect(IntentIdGenerator.validate('')).toBe(false);
      expect(IntentIdGenerator.validate(null)).toBe(false);
    });

    it('should detect expired intent IDs', () => {
      const oldTimestamp = Date.now() - 7200000; // 2 hours ago
      const expiredId = `dustZap_${oldTimestamp}_abcdef_0123456789abcdef`;
      expect(IntentIdGenerator.isExpired(expiredId, 3600000)).toBe(true); // 1 hour max age
    });
  });

  describe('SSE Response Format', () => {
    it('should return SSE response when streaming is enabled', async () => {
      // Mock successful price and balance calls
      mockPriceService.getPrice.mockResolvedValue({ price: 3000 });
      mockRebalanceClient.getUserTokenBalances.mockResolvedValue([
        {
          id: '0x1234567890123456789012345678901234567890',
          symbol: 'TEST',
          decimals: 18,
          amount: 1.0, // 1 token
          price: 10.0, // $10 per token
          raw_amount: '1000000000000000000',
        },
      ]);

      const request = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustThreshold: 5, // Token has $10 value, so it qualifies as dust with $5 threshold
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      const result = await handler.execute(request, { useSSE: true });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('streaming');
      expect(result.intentId).toMatch(/^dustZap_/);
      expect(result.streamUrl).toContain(result.intentId);
      expect(result.metadata.totalTokens).toBe(1);
      expect(result.metadata.streamingEnabled).toBe(true);
    });

    it('should return immediate response when streaming is disabled', async () => {
      // Mock successful calls
      mockPriceService.getPrice.mockResolvedValue({ price: 3000 });
      mockRebalanceClient.getUserTokenBalances.mockResolvedValue([
        {
          id: '0x1234567890123456789012345678901234567890',
          symbol: 'TEST',
          decimals: 18,
          amount: 1.0, // 1 token
          price: 10.0, // $10 per token
          raw_amount: '1000000000000000000',
        },
      ]);
      mockSwapService.getSecondBestSwapQuote.mockResolvedValue({
        to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        value: '0',
        data: '0x',
        gas: '150000',
      });

      const request = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustThreshold: 5,
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      const result = await handler.execute(request, { useSSE: false });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('immediate');
      expect(result.transactions).toBeDefined();
      expect(Array.isArray(result.transactions)).toBe(true);
    });
  });

  describe('Execution Context Management', () => {
    it('should store and retrieve execution context', () => {
      const intentId = 'test_intent_123';
      const executionContext = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        dustTokens: [],
        ethPrice: 3000,
      };

      handler.storeExecutionContext(intentId, executionContext);
      const retrieved = handler.getExecutionContext(intentId);

      expect(retrieved).toBeDefined();
      expect(retrieved.userAddress).toBe(executionContext.userAddress);
      expect(retrieved.intentId).toBe(intentId);
      expect(retrieved.createdAt).toBeDefined();
    });

    it('should remove execution context', () => {
      const intentId = 'test_intent_456';
      const executionContext = { userAddress: '0x123' };

      handler.storeExecutionContext(intentId, executionContext);
      expect(handler.getExecutionContext(intentId)).toBeDefined();

      handler.removeExecutionContext(intentId);
      expect(handler.getExecutionContext(intentId)).toBeNull();
    });

    it('should return null for non-existent execution context', () => {
      const result = handler.getExecutionContext('non_existent_intent');
      expect(result).toBeNull();
    });
  });

  describe('Duration Estimation', () => {
    it('should estimate duration correctly for small token counts', () => {
      const duration = handler.estimateProcessingDuration(5);
      expect(duration).toMatch(/\d+-\d+ seconds/);
    });

    it('should estimate duration in minutes for large token counts', () => {
      const duration = handler.estimateProcessingDuration(100);
      expect(duration).toMatch(/\d+-\d+ minutes/);
    });

    it('should have minimum duration', () => {
      const duration = handler.estimateProcessingDuration(1);
      expect(duration).toContain('5');
    });
  });

  describe('SSE Token Processing', () => {
    it('should process tokens individually with SSE streaming', async () => {
      const executionContext = {
        dustTokens: [
          {
            id: '0x1111111111111111111111111111111111111111',
            symbol: 'TOKEN1',
            decimals: 18,
            amount: 1.0,
            price: 10.0,
            raw_amount: '1000000000000000000',
            value: 10.0,
          },
          {
            id: '0x2222222222222222222222222222222222222222',
            symbol: 'TOKEN2',
            decimals: 18,
            amount: 2.0,
            price: 10.0,
            raw_amount: '2000000000000000000',
            value: 20.0,
          },
        ],
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        ethPrice: 3000,
        params: {
          referralAddress: null,
          toTokenAddress: undefined,
          toTokenDecimals: undefined,
          slippage: undefined,
        },
      };

      // Mock swap service to return valid quotes
      mockSwapService.getSecondBestSwapQuote.mockResolvedValue({
        to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        value: '0',
        data: '0x',
        gas: '150000',
      });

      const streamEvents = [];
      const mockStreamWriter = data => {
        streamEvents.push(data);
      };

      const result = await handler.processTokensWithSSEStreaming(
        executionContext,
        mockStreamWriter
      );

      // Should have processed both tokens
      expect(result.processedTokens).toBe(2);
      expect(result.allTransactions.length).toBeGreaterThan(0);

      // Should have streamed events for each token
      const tokenReadyEvents = streamEvents.filter(
        e => e.type === 'token_ready'
      );
      expect(tokenReadyEvents).toHaveLength(2);

      // Should have a completion event
      const completeEvents = streamEvents.filter(e => e.type === 'complete');
      expect(completeEvents).toHaveLength(1);

      // Check token ready event structure
      const firstTokenEvent = tokenReadyEvents[0];
      expect(firstTokenEvent.tokenIndex).toBe(0);
      expect(firstTokenEvent.tokenSymbol).toBe('TOKEN1');
      expect(firstTokenEvent.transactions).toBeDefined();
      expect(firstTokenEvent.progress).toBe(0.5); // 1/2 tokens
    });

    it('should handle token processing failures gracefully', async () => {
      const executionContext = {
        dustTokens: [
          {
            id: '0x1111111111111111111111111111111111111111',
            symbol: 'GOOD_TOKEN',
            decimals: 18,
            amount: 1.0,
            price: 10.0,
            raw_amount: '1000000000000000000',
            value: 10.0,
          },
          {
            id: '0x2222222222222222222222222222222222222222',
            symbol: 'BAD_TOKEN',
            decimals: 18,
            amount: 2.0,
            price: 10.0,
            raw_amount: '2000000000000000000',
            value: 20.0,
          },
        ],
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        ethPrice: 3000,
        params: {
          referralAddress: null,
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      // Mock first token success, second token failure
      mockSwapService.getSecondBestSwapQuote
        .mockResolvedValueOnce({
          to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          value: '0',
          data: '0x',
          gas: '150000',
        })
        .mockRejectedValue(new Error('Swap failed')); // All subsequent calls fail

      const streamEvents = [];
      const mockStreamWriter = data => {
        streamEvents.push(data);
      };

      const result = await handler.processTokensWithSSEStreaming(
        executionContext,
        mockStreamWriter
      );
      // Should have processed both tokens (success + failure)
      //3 stands for approve, swap and platform fee
      expect(result.processedTokens).toBe(3);

      // Should have token ready events for both tokens
      const tokenReadyEvents = streamEvents.filter(
        e => e.type === 'token_ready'
      );
      expect(tokenReadyEvents).toHaveLength(1);

      // First token should have transactions, second should have empty array due to swap failure
      const firstTokenEvent = tokenReadyEvents.find(
        e => e.tokenSymbol === 'GOOD_TOKEN'
      );
      const secondTokenEvent = tokenReadyEvents.find(
        e => e.tokenSymbol === 'BAD_TOKEN'
      );

      expect(firstTokenEvent.transactions.length).toBeGreaterThan(0);
      expect(secondTokenEvent).toBeUndefined();
    });
  });

  describe('Cleanup', () => {
    it('should clean up expired execution contexts', () => {
      const now = Date.now();
      const expiredTime =
        now - (DUST_ZAP_CONFIG.SSE_STREAMING.CONNECTION_TIMEOUT + 1000);

      // Add some contexts
      handler.executionContexts.set('expired_intent', {
        createdAt: expiredTime,
      });
      handler.executionContexts.set('valid_intent', { createdAt: now });

      expect(handler.executionContexts.size).toBe(2);

      handler.cleanupExpiredContexts();

      expect(handler.executionContexts.size).toBe(1);
      expect(handler.executionContexts.has('valid_intent')).toBe(true);
      expect(handler.executionContexts.has('expired_intent')).toBe(false);
    });
  });
});
