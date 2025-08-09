const SSEEventFactory = require('../src/services/SSEEventFactory');
const { SSE_EVENT_TYPES } = require('../src/utils/SwapErrorClassifier');
const TokenProcessingResult = require('../src/valueObjects/TokenProcessingResult');
const SSEEventParams = require('../src/valueObjects/SSEEventParams');

describe('SSEEventFactory', () => {
  describe('createConnectionEvent', () => {
    it('should create a connection event with default metadata', () => {
      const intentId = 'test-intent-123';
      const event = SSEEventFactory.createConnectionEvent(intentId);

      expect(event).toMatchObject({
        type: 'connected',
        intentId,
        timestamp: expect.any(String),
      });
      expect(new Date(event.timestamp)).toBeInstanceOf(Date);
    });

    it('should include custom metadata in connection event', () => {
      const intentId = 'test-intent-123';
      const metadata = { userId: 'user-456', version: '1.0' };
      const event = SSEEventFactory.createConnectionEvent(intentId, metadata);

      expect(event).toMatchObject({
        type: 'connected',
        intentId,
        userId: 'user-456',
        version: '1.0',
      });
    });
  });

  describe('createTokenReadyEvent', () => {
    const mockTokenData = {
      tokenIndex: 0,
      token: {
        symbol: 'USDC',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      },
      transactions: [{ to: '0x123', value: '0' }],
      provider: '1inch',
      expectedTokenAmount: '1000000',
      minToAmount: '950000',
      toUsd: 100,
      gasCostUSD: 5,
      tradingLoss: 2,
      processedTokens: 0,
      totalTokens: 5,
    };

    it('should create token ready event from direct parameters', () => {
      const event = SSEEventFactory.createTokenReadyEvent(mockTokenData);

      expect(event).toMatchObject({
        type: SSE_EVENT_TYPES.TOKEN_READY,
        tokenIndex: 0,
        tokenSymbol: 'USDC',
        tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        transactions: mockTokenData.transactions,
        provider: '1inch',
        expectedTokenAmount: '1000000',
        minToAmount: '950000',
        toUsd: 100,
        gasCostUSD: 5,
        tradingLoss: 2,
        progress: 0.2,
        processedTokens: 1,
        totalTokens: 5,
        timestamp: expect.any(String),
      });
    });

    it('should create token ready event from SSEEventParams', () => {
      const params = new SSEEventParams();
      // Mock the getTokenReadyParams method
      jest.spyOn(params, 'getTokenReadyParams').mockReturnValue(mockTokenData);

      const event = SSEEventFactory.createTokenReadyEvent(params);

      expect(event.type).toBe(SSE_EVENT_TYPES.TOKEN_READY);
      expect(event.tokenSymbol).toBe('USDC');
      expect(params.getTokenReadyParams).toHaveBeenCalled();
    });
  });

  describe('createTokenFailedEvent', () => {
    const mockFailureData = {
      tokenIndex: 1,
      token: {
        symbol: 'DAI',
        address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      },
      error: 'Insufficient liquidity',
      errorCategory: 'liquidity',
      userFriendlyMessage: 'Not enough liquidity for this token',
      provider: 'paraswap',
      tradingLoss: null,
      processedTokens: 1,
      totalTokens: 5,
    };

    it('should create token failed event from direct parameters', () => {
      const event = SSEEventFactory.createTokenFailedEvent(mockFailureData);

      expect(event).toMatchObject({
        type: SSE_EVENT_TYPES.TOKEN_FAILED,
        tokenIndex: 1,
        tokenSymbol: 'DAI',
        tokenAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        error: 'Insufficient liquidity',
        errorCategory: 'liquidity',
        userFriendlyMessage: 'Not enough liquidity for this token',
        provider: 'paraswap',
        tradingLoss: null,
        progress: 0.4,
        processedTokens: 2,
        totalTokens: 5,
        timestamp: expect.any(String),
      });
    });

    it('should create token failed event from SSEEventParams', () => {
      const params = new SSEEventParams();
      // Mock the getTokenFailedParams method
      jest
        .spyOn(params, 'getTokenFailedParams')
        .mockReturnValue(mockFailureData);

      const event = SSEEventFactory.createTokenFailedEvent(params);

      expect(event.type).toBe(SSE_EVENT_TYPES.TOKEN_FAILED);
      expect(event.tokenSymbol).toBe('DAI');
      expect(params.getTokenFailedParams).toHaveBeenCalled();
    });
  });

  describe('createTokenReadyEventFromResult', () => {
    it('should create token ready event from successful TokenProcessingResult', () => {
      const mockToken = {
        symbol: 'USDC',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      };
      const mockSwapData = {
        provider: '1inch',
        expectedTokenAmount: '1000000',
        minToAmount: '950000',
        toUsd: 100,
        gasCostUSD: 5,
      };

      const result = new TokenProcessingResult({
        token: mockToken,
        success: true,
        transactions: [{ to: '0x123', value: '0' }],
        provider: '1inch',
        tradingLoss: 2,
        metadata: { swapData: mockSwapData },
      });

      // Mock the getSwapData method
      jest.spyOn(result, 'getSwapData').mockReturnValue(mockSwapData);

      const event = SSEEventFactory.createTokenReadyEventFromResult(
        result,
        0,
        0,
        5
      );

      expect(event).toMatchObject({
        type: SSE_EVENT_TYPES.TOKEN_READY,
        tokenIndex: 0,
        tokenSymbol: 'USDC',
        provider: '1inch',
        expectedTokenAmount: '1000000',
        minToAmount: '950000',
        toUsd: 100,
        gasCostUSD: 5,
        tradingLoss: 2,
        processedTokens: 1,
        totalTokens: 5,
      });
    });

    it('should throw error if not a TokenProcessingResult instance', () => {
      expect(() => {
        SSEEventFactory.createTokenReadyEventFromResult({}, 0, 0, 5);
      }).toThrow('Expected TokenProcessingResult instance');
    });

    it('should throw error if result is not successful', () => {
      const result = new TokenProcessingResult({
        token: { symbol: 'USDC', address: '0x123' },
        success: false,
        error: 'Failed',
      });

      expect(() => {
        SSEEventFactory.createTokenReadyEventFromResult(result, 0, 0, 5);
      }).toThrow('Cannot create token ready event from failed result');
    });
  });

  describe('createTokenFailedEventFromResult', () => {
    it('should create token failed event from failed TokenProcessingResult', () => {
      const mockToken = {
        symbol: 'DAI',
        address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      };

      const result = new TokenProcessingResult({
        token: mockToken,
        success: false,
        error: 'Insufficient liquidity',
        provider: 'paraswap',
        tradingLoss: null,
        metadata: {
          errorCategory: 'liquidity',
          userFriendlyMessage: 'Not enough liquidity for this token',
        },
      });

      const event = SSEEventFactory.createTokenFailedEventFromResult(
        result,
        1,
        1,
        5
      );

      expect(event).toMatchObject({
        type: SSE_EVENT_TYPES.TOKEN_FAILED,
        tokenIndex: 1,
        tokenSymbol: 'DAI',
        error: 'Insufficient liquidity',
        errorCategory: 'liquidity',
        userFriendlyMessage: 'Not enough liquidity for this token',
        provider: 'paraswap',
        processedTokens: 2,
        totalTokens: 5,
      });
    });

    it('should throw error if not a TokenProcessingResult instance', () => {
      expect(() => {
        SSEEventFactory.createTokenFailedEventFromResult({}, 0, 0, 5);
      }).toThrow('Expected TokenProcessingResult instance');
    });

    it('should throw error if result is successful', () => {
      const result = new TokenProcessingResult({
        token: { symbol: 'USDC', address: '0x123' },
        success: true,
        transactions: [],
      });

      expect(() => {
        SSEEventFactory.createTokenFailedEventFromResult(result, 0, 0, 5);
      }).toThrow('Cannot create token failed event from successful result');
    });

    it('should use default values for missing metadata', () => {
      const result = new TokenProcessingResult({
        token: { symbol: 'DAI', address: '0x123' },
        success: false,
        error: 'Generic error',
      });

      const event = SSEEventFactory.createTokenFailedEventFromResult(
        result,
        0,
        0,
        5
      );

      expect(event.errorCategory).toBe('unknown');
      expect(event.userFriendlyMessage).toBe('Generic error');
      expect(event.provider).toBe('failed');
    });
  });

  describe('createCompletionEvent', () => {
    it('should create completion event with minimal parameters', () => {
      const event = SSEEventFactory.createCompletionEvent({});

      expect(event).toMatchObject({
        type: SSE_EVENT_TYPES.COMPLETE,
        transactions: [],
        metadata: {
          totalTokens: 0,
          processedTokens: 0,
        },
        timestamp: expect.any(String),
      });
    });

    it('should create completion event with full parameters', () => {
      const params = {
        transactions: [
          { to: '0x123', value: '0' },
          { to: '0x456', value: '100' },
        ],
        metadata: { duration: 5000, gasUsed: '500000' },
        totalTokens: 5,
        processedTokens: 5,
        additionalData: { sessionId: 'session-123' },
      };

      const event = SSEEventFactory.createCompletionEvent(params);

      expect(event).toMatchObject({
        type: SSE_EVENT_TYPES.COMPLETE,
        transactions: params.transactions,
        metadata: {
          totalTokens: 5,
          processedTokens: 5,
          duration: 5000,
          gasUsed: '500000',
        },
        sessionId: 'session-123',
        timestamp: expect.any(String),
      });
    });
  });

  describe('createErrorEvent', () => {
    it('should create error event from string', () => {
      const event = SSEEventFactory.createErrorEvent('Processing failed');

      expect(event).toMatchObject({
        type: SSE_EVENT_TYPES.ERROR,
        error: 'Processing failed',
        processedTokens: 0,
        totalTokens: 0,
        timestamp: expect.any(String),
      });
    });

    it('should create error event from Error object', () => {
      const error = new Error('Network error');
      const context = { processedTokens: 2, totalTokens: 5, attemptNumber: 3 };

      const event = SSEEventFactory.createErrorEvent(error, context);

      expect(event).toMatchObject({
        type: SSE_EVENT_TYPES.ERROR,
        error: 'Network error',
        processedTokens: 2,
        totalTokens: 5,
        attemptNumber: 3,
        timestamp: expect.any(String),
      });
    });

    it('should handle error without message', () => {
      const event = SSEEventFactory.createErrorEvent({});

      expect(event.error).toBe('Processing failed');
    });
  });

  describe('createProgressEvent', () => {
    it('should create progress event', () => {
      const params = {
        processedTokens: 3,
        totalTokens: 10,
        currentOperation: 'analyzing',
        additionalInfo: { estimatedTimeRemaining: 30 },
      };

      const event = SSEEventFactory.createProgressEvent(params);

      expect(event).toMatchObject({
        type: 'progress',
        progress: 0.3,
        processedTokens: 3,
        totalTokens: 10,
        currentOperation: 'analyzing',
        estimatedTimeRemaining: 30,
        timestamp: expect.any(String),
      });
    });

    it('should use default values', () => {
      const event = SSEEventFactory.createProgressEvent({
        processedTokens: 1,
        totalTokens: 5,
      });

      expect(event.currentOperation).toBe('processing');
      expect(event.progress).toBe(0.2);
    });
  });

  describe('validateEvent', () => {
    it('should validate valid token ready event', () => {
      const event = {
        type: SSE_EVENT_TYPES.TOKEN_READY,
        tokenSymbol: 'USDC',
        tokenAddress: '0x123',
        tokenIndex: 0,
        processedTokens: 1,
        totalTokens: 5,
        timestamp: new Date().toISOString(),
      };

      expect(SSEEventFactory.validateEvent(event)).toBe(true);
    });

    it('should validate valid token failed event', () => {
      const event = {
        type: SSE_EVENT_TYPES.TOKEN_FAILED,
        tokenSymbol: 'DAI',
        tokenAddress: '0x456',
        tokenIndex: 1,
        processedTokens: 2,
        totalTokens: 5,
        timestamp: new Date().toISOString(),
      };

      expect(SSEEventFactory.validateEvent(event)).toBe(true);
    });

    it('should validate valid complete event', () => {
      const event = {
        type: SSE_EVENT_TYPES.COMPLETE,
        transactions: [],
        metadata: {},
        timestamp: new Date().toISOString(),
      };

      expect(SSEEventFactory.validateEvent(event)).toBe(true);
    });

    it('should validate valid error event', () => {
      const event = {
        type: SSE_EVENT_TYPES.ERROR,
        error: 'Test error',
        timestamp: new Date().toISOString(),
      };

      expect(SSEEventFactory.validateEvent(event)).toBe(true);
    });

    it('should reject invalid events', () => {
      expect(SSEEventFactory.validateEvent(null)).toBe(false);
      expect(SSEEventFactory.validateEvent('string')).toBe(false);
      expect(SSEEventFactory.validateEvent({})).toBe(false);
      expect(SSEEventFactory.validateEvent({ type: 'test' })).toBe(false);
      expect(
        SSEEventFactory.validateEvent({ timestamp: new Date().toISOString() })
      ).toBe(false);
    });

    it('should reject token events with missing required fields', () => {
      const invalidTokenEvent = {
        type: SSE_EVENT_TYPES.TOKEN_READY,
        timestamp: new Date().toISOString(),
      };

      expect(SSEEventFactory.validateEvent(invalidTokenEvent)).toBe(false);
    });

    it('should allow custom event types', () => {
      const customEvent = {
        type: 'custom-event',
        timestamp: new Date().toISOString(),
        data: 'custom data',
      };

      expect(SSEEventFactory.validateEvent(customEvent)).toBe(true);
    });
  });

  describe('formatForSSE', () => {
    it('should format valid event for SSE', () => {
      const event = {
        type: 'test',
        timestamp: new Date().toISOString(),
        data: 'test data',
      };

      const formatted = SSEEventFactory.formatForSSE(event);

      expect(formatted).toBe(`data: ${JSON.stringify(event)}\n\n`);
    });

    it('should throw error for invalid event', () => {
      expect(() => {
        SSEEventFactory.formatForSSE({ type: 'test' });
      }).toThrow('Invalid event structure for SSE transmission');
    });
  });

  describe('createIntentBatchEvent', () => {
    it('should create completed batch event', () => {
      const batchData = {
        batchId: 'batch-123',
        intentType: 'dustZap',
        transactions: [{ to: '0x123' }, { to: '0x456' }],
        batchIndex: 0,
        totalBatches: 3,
        status: 'completed',
        metadata: { gasPrice: '20' },
      };

      const event = SSEEventFactory.createIntentBatchEvent(batchData);

      expect(event).toMatchObject({
        type: SSE_EVENT_TYPES.INTENT_BATCH,
        batchId: 'batch-123',
        intentType: 'dustZap',
        batchIndex: 0,
        totalBatches: 3,
        progress: 1 / 3,
        status: 'completed',
        transactions: batchData.transactions,
        metadata: {
          batchSize: 2,
          gasPrice: '20',
        },
        timestamp: expect.any(String),
      });
    });

    it('should create failed batch event', () => {
      const batchData = {
        batchId: 'batch-456',
        intentType: 'swap',
        status: 'failed',
        error: new Error('Batch processing failed'),
        transactions: [{ to: '0x789' }],
      };

      const event = SSEEventFactory.createIntentBatchEvent(batchData);

      expect(event).toMatchObject({
        type: SSE_EVENT_TYPES.INTENT_BATCH,
        status: 'failed',
        error: 'Batch processing failed',
        transactions: [],
        progress: 1,
      });
    });

    it('should handle string error', () => {
      const batchData = {
        batchId: 'batch-789',
        status: 'failed',
        error: 'String error message',
      };

      const event = SSEEventFactory.createIntentBatchEvent(batchData);

      expect(event.error).toBe('String error message');
    });
  });

  describe('createTransactionUpdateEvent', () => {
    it('should create pending transaction update', () => {
      const txnData = {
        transactionId: 'txn-123',
        txnIndex: 0,
        totalTxns: 5,
        status: 'pending',
        metadata: { nonce: 42 },
      };

      const event = SSEEventFactory.createTransactionUpdateEvent(txnData);

      expect(event).toMatchObject({
        type: SSE_EVENT_TYPES.TRANSACTION_UPDATE,
        transactionId: 'txn-123',
        txnIndex: 0,
        totalTxns: 5,
        progress: 0.2,
        status: 'pending',
        transactionHash: null,
        gasUsed: null,
        blockNumber: null,
        error: null,
        metadata: { nonce: 42 },
        timestamp: expect.any(String),
      });
    });

    it('should create confirmed transaction update', () => {
      const txnData = {
        transactionId: 'txn-456',
        txnIndex: 2,
        totalTxns: 3,
        status: 'confirmed',
        transactionHash: '0xabc123',
        gasUsed: '21000',
        blockNumber: 12345678,
      };

      const event = SSEEventFactory.createTransactionUpdateEvent(txnData);

      expect(event).toMatchObject({
        type: SSE_EVENT_TYPES.TRANSACTION_UPDATE,
        status: 'confirmed',
        transactionHash: '0xabc123',
        gasUsed: '21000',
        blockNumber: 12345678,
        progress: 1,
      });
    });

    it('should create failed transaction update', () => {
      const txnData = {
        transactionId: 'txn-789',
        txnIndex: 1,
        totalTxns: 2,
        status: 'failed',
        error: new Error('Transaction reverted'),
      };

      const event = SSEEventFactory.createTransactionUpdateEvent(txnData);

      expect(event).toMatchObject({
        type: SSE_EVENT_TYPES.TRANSACTION_UPDATE,
        status: 'failed',
        error: 'Transaction reverted',
      });
    });

    it('should handle string error', () => {
      const txnData = {
        transactionId: 'txn-999',
        txnIndex: 0,
        totalTxns: 1,
        error: 'Out of gas',
      };

      const event = SSEEventFactory.createTransactionUpdateEvent(txnData);

      expect(event.error).toBe('Out of gas');
    });
  });

  describe('createStreamWriter', () => {
    let mockRes;

    beforeEach(() => {
      mockRes = {
        write: jest.fn(),
      };
    });

    it('should create a working stream writer', () => {
      const writer = SSEEventFactory.createStreamWriter(mockRes);
      const event = {
        type: 'test',
        timestamp: new Date().toISOString(),
        data: 'test',
      };

      writer(event);

      expect(mockRes.write).toHaveBeenCalledWith(
        `data: ${JSON.stringify(event)}\n\n`
      );
    });

    it('should handle formatting errors gracefully', () => {
      const writer = SSEEventFactory.createStreamWriter(mockRes);
      const invalidEvent = { type: 'test' }; // Missing timestamp

      // Mock console.error to avoid test output noise
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      writer(invalidEvent);

      expect(consoleError).toHaveBeenCalled();
      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('Event formatting failed')
      );

      consoleError.mockRestore();
    });
  });
});
