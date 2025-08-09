const {
  SSEStreamManager,
  DustZapSSEOrchestrator,
} = require('../src/services/SSEStreamManager');
const SSEEventFactory = require('../src/services/SSEEventFactory');
const SwapProcessingService = require('../src/services/SwapProcessingService');

// Mock dependencies
jest.mock('../src/services/SSEEventFactory');
jest.mock('../src/services/SwapProcessingService');

describe('SSEStreamManager', () => {
  describe('SSE_HEADERS', () => {
    it('should return correct SSE headers', () => {
      const headers = SSEStreamManager.SSE_HEADERS;

      expect(headers).toEqual({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });
    });
  });

  describe('initializeStream', () => {
    let mockRes, mockStreamWriter;

    beforeEach(() => {
      mockRes = {
        writeHead: jest.fn(),
      };
      mockStreamWriter = jest.fn();
      SSEEventFactory.createStreamWriter.mockReturnValue(mockStreamWriter);
      SSEEventFactory.createConnectionEvent.mockReturnValue({
        type: 'connected',
      });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should initialize stream with headers and send connection event', () => {
      const intentId = 'test-intent-123';
      const metadata = { userId: 'user-456' };

      const writer = SSEStreamManager.initializeStream(
        mockRes,
        intentId,
        metadata
      );

      expect(mockRes.writeHead).toHaveBeenCalledWith(
        200,
        SSEStreamManager.SSE_HEADERS
      );
      expect(SSEEventFactory.createStreamWriter).toHaveBeenCalledWith(mockRes);
      expect(SSEEventFactory.createConnectionEvent).toHaveBeenCalledWith(
        intentId,
        metadata
      );
      expect(mockStreamWriter).toHaveBeenCalledWith({ type: 'connected' });
      expect(writer).toBe(mockStreamWriter);
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

      const event = SSEStreamManager.createIntentBatchEvent(batchData);

      expect(event).toMatchObject({
        type: 'intent_batch',
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

    it('should create failed batch event without transactions', () => {
      const batchData = {
        batchId: 'batch-456',
        intentType: 'swap',
        status: 'failed',
        error: new Error('Batch processing failed'),
        transactions: [{ to: '0x789' }],
      };

      const event = SSEStreamManager.createIntentBatchEvent(batchData);

      expect(event).toMatchObject({
        type: 'intent_batch',
        status: 'failed',
        error: 'Batch processing failed',
        transactions: [],
      });
    });

    it('should handle string error', () => {
      const batchData = {
        batchId: 'batch-789',
        status: 'failed',
        error: 'String error message',
      };

      const event = SSEStreamManager.createIntentBatchEvent(batchData);

      expect(event.error).toBe('String error message');
    });

    it('should use default values', () => {
      const event = SSEStreamManager.createIntentBatchEvent({
        batchId: 'batch-000',
        intentType: 'test',
      });

      expect(event.batchIndex).toBe(0);
      expect(event.totalBatches).toBe(1);
      expect(event.status).toBe('completed');
      expect(event.progress).toBe(1);
      expect(event.transactions).toEqual([]);
    });
  });

  describe('createTransactionEvent', () => {
    it('should create pending transaction event', () => {
      const txnData = {
        transactionId: 'txn-123',
        txnIndex: 0,
        totalTxns: 5,
        status: 'pending',
        metadata: { nonce: 42 },
      };

      const event = SSEStreamManager.createTransactionEvent(txnData);

      expect(event).toMatchObject({
        type: 'transaction_update',
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

    it('should create confirmed transaction event', () => {
      const txnData = {
        transactionId: 'txn-456',
        txnIndex: 2,
        totalTxns: 3,
        status: 'confirmed',
        transactionHash: '0xabc123',
        gasUsed: '21000',
        blockNumber: 12345678,
      };

      const event = SSEStreamManager.createTransactionEvent(txnData);

      expect(event).toMatchObject({
        status: 'confirmed',
        transactionHash: '0xabc123',
        gasUsed: '21000',
        blockNumber: 12345678,
        progress: 1,
      });
    });

    it('should handle error objects', () => {
      const txnData = {
        transactionId: 'txn-789',
        txnIndex: 1,
        totalTxns: 2,
        error: new Error('Transaction failed'),
      };

      const event = SSEStreamManager.createTransactionEvent(txnData);

      expect(event.error).toBe('Transaction failed');
    });
  });

  describe('handleStreamError', () => {
    let mockRes, mockStreamWriter;

    beforeEach(() => {
      mockRes = {
        headersSent: false,
        writeHead: jest.fn(),
        end: jest.fn(),
        destroyed: false,
        destroy: jest.fn(),
      };
      mockStreamWriter = jest.fn();
      SSEEventFactory.createStreamWriter.mockReturnValue(mockStreamWriter);
      SSEEventFactory.createErrorEvent.mockReturnValue({ type: 'error' });
    });

    afterEach(() => {
      jest.clearAllMocks();
      jest.restoreAllMocks();
    });

    it('should send JSON error response if headers not sent', () => {
      const error = new Error('Test error');
      const context = { intentId: 'test-123' };

      SSEStreamManager.handleStreamError(mockRes, error, context);

      expect(mockRes.writeHead).toHaveBeenCalledWith(500, {
        'Content-Type': 'application/json',
      });
      expect(mockRes.end).toHaveBeenCalledWith(
        JSON.stringify({
          success: false,
          error: {
            code: 'STREAMING_ERROR',
            message: 'Failed to process streaming request',
          },
        })
      );
    });

    it('should send SSE error event if already streaming', done => {
      mockRes.headersSent = true;
      const error = new Error('Stream error');
      const context = { processedTokens: 2, totalTokens: 5 };

      SSEStreamManager.handleStreamError(mockRes, error, context);

      expect(SSEEventFactory.createStreamWriter).toHaveBeenCalledWith(mockRes);
      expect(SSEEventFactory.createErrorEvent).toHaveBeenCalledWith(
        error,
        context
      );
      expect(mockStreamWriter).toHaveBeenCalledWith({ type: 'error' });

      // Check that res.end is called after delay
      setTimeout(() => {
        expect(mockRes.end).toHaveBeenCalled();
        done();
      }, 150);
    });

    it('should handle write errors gracefully', () => {
      mockRes.headersSent = true;
      SSEEventFactory.createStreamWriter.mockImplementation(() => {
        throw new Error('Write error');
      });

      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      SSEStreamManager.handleStreamError(mockRes, new Error('Test'), {});

      expect(consoleError).toHaveBeenCalled();
      expect(mockRes.destroy).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('should not destroy if already destroyed', () => {
      mockRes.headersSent = true;
      mockRes.destroyed = true;
      SSEEventFactory.createStreamWriter.mockImplementation(() => {
        throw new Error('Write error');
      });

      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      SSEStreamManager.handleStreamError(mockRes, new Error('Test'), {});

      expect(mockRes.destroy).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('closeStream', () => {
    let mockRes, mockStreamWriter;

    beforeEach(() => {
      mockRes = {
        destroyed: false,
        end: jest.fn(),
        destroy: jest.fn(),
      };
      mockStreamWriter = jest.fn();
      SSEEventFactory.createStreamWriter.mockReturnValue(mockStreamWriter);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should close stream without final event', done => {
      SSEStreamManager.closeStream(mockRes);

      setTimeout(() => {
        expect(mockRes.end).toHaveBeenCalled();
        done();
      }, 150);
    });

    it('should send final event before closing', done => {
      const finalEvent = { type: 'complete', data: 'final' };

      SSEStreamManager.closeStream(mockRes, finalEvent);

      expect(SSEEventFactory.createStreamWriter).toHaveBeenCalledWith(mockRes);
      expect(mockStreamWriter).toHaveBeenCalledWith(finalEvent);

      setTimeout(() => {
        expect(mockRes.end).toHaveBeenCalled();
        done();
      }, 150);
    });

    it('should respect custom delay', done => {
      const customDelay = 50;

      SSEStreamManager.closeStream(mockRes, null, customDelay);

      setTimeout(() => {
        expect(mockRes.end).not.toHaveBeenCalled();
      }, 30);

      setTimeout(() => {
        expect(mockRes.end).toHaveBeenCalled();
        done();
      }, customDelay + 20);
    });

    it('should handle errors gracefully', () => {
      SSEEventFactory.createStreamWriter.mockImplementation(() => {
        throw new Error('Write error');
      });

      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      const finalEvent = { type: 'complete' };

      SSEStreamManager.closeStream(mockRes, finalEvent);

      expect(consoleError).toHaveBeenCalled();
      expect(mockRes.destroy).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('should not destroy if already destroyed', () => {
      mockRes.destroyed = true;

      SSEStreamManager.closeStream(mockRes);

      expect(mockRes.end).not.toHaveBeenCalled();
      expect(mockRes.destroy).not.toHaveBeenCalled();
    });
  });

  describe('createStreamEndpoint', () => {
    let mockReq, mockRes, mockStreamWriter;
    let validateParams, getExecutionContext, processStream, cleanup;

    beforeEach(() => {
      mockReq = {
        params: { intentId: 'test-intent-123' },
      };
      mockRes = {
        status: jest.fn(() => mockRes),
        json: jest.fn(),
        writeHead: jest.fn(),
        end: jest.fn(),
        destroyed: false,
      };
      mockStreamWriter = jest.fn();

      validateParams = jest.fn(() => ({ isValid: true }));
      getExecutionContext = jest.fn(() => ({ totalItems: 5 }));
      processStream = jest.fn();
      cleanup = jest.fn();

      SSEEventFactory.createStreamWriter.mockReturnValue(mockStreamWriter);
      SSEEventFactory.createConnectionEvent.mockReturnValue({
        type: 'connected',
      });
      SSEEventFactory.createCompletionEvent.mockReturnValue({
        type: 'complete',
      });
      SSEEventFactory.createErrorEvent.mockReturnValue({ type: 'error' });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should create a working stream endpoint', async () => {
      const handler = SSEStreamManager.createStreamEndpoint({
        validateParams,
        getExecutionContext,
        processStream,
        cleanup,
        intentType: 'test',
      });

      await handler(mockReq, mockRes);

      expect(validateParams).toHaveBeenCalledWith(mockReq);
      expect(getExecutionContext).toHaveBeenCalledWith('test-intent-123');
      expect(mockRes.writeHead).toHaveBeenCalledWith(
        200,
        SSEStreamManager.SSE_HEADERS
      );
      expect(processStream).toHaveBeenCalledWith(
        { totalItems: 5 },
        mockStreamWriter
      );
      expect(cleanup).toHaveBeenCalledWith('test-intent-123');
    });

    it('should handle validation failure', async () => {
      validateParams.mockReturnValue({
        isValid: false,
        statusCode: 400,
        error: { code: 'INVALID_PARAMS', message: 'Invalid parameters' },
      });

      const handler = SSEStreamManager.createStreamEndpoint({
        validateParams,
        getExecutionContext,
        processStream,
      });

      await handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Invalid parameters' },
      });
      expect(processStream).not.toHaveBeenCalled();
    });

    it('should handle missing execution context', async () => {
      getExecutionContext.mockReturnValue(null);

      const handler = SSEStreamManager.createStreamEndpoint({
        getExecutionContext,
        processStream,
      });

      await handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTENT_NOT_FOUND',
          message: 'Intent execution context not found',
        },
      });
      expect(processStream).not.toHaveBeenCalled();
    });

    it('should handle stream processing errors', async () => {
      const error = new Error('Processing failed');
      processStream.mockRejectedValue(error);

      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      const handler = SSEStreamManager.createStreamEndpoint({
        getExecutionContext,
        processStream,
        cleanup,
      });

      await handler(mockReq, mockRes);

      expect(consoleError).toHaveBeenCalledWith('SSE streaming error:', error);
      expect(cleanup).toHaveBeenCalledWith('test-intent-123');

      consoleError.mockRestore();
    });

    it('should work without optional parameters', async () => {
      const handler = SSEStreamManager.createStreamEndpoint({
        getExecutionContext,
        processStream,
      });

      await handler(mockReq, mockRes);

      expect(processStream).toHaveBeenCalled();
    });
  });
});

describe('DustZapSSEOrchestrator', () => {
  let orchestrator, mockDustZapHandler, mockStreamWriter;

  beforeEach(() => {
    mockDustZapHandler = {
      executor: {
        feeCalculationService: {
          createFeeTransactions: jest.fn(() => ({
            txBuilder: {
              getTransactions: jest.fn(() => [{ to: '0xfee', value: '100' }]),
            },
            feeAmounts: { totalFeeETH: '100' },
          })),
          buildFeeInfo: jest.fn(() => ({ platform: '50', referral: '50' })),
        },
        smartFeeInsertionService: {
          calculateInsertionStrategy: jest.fn(() => ({ strategy: 'random' })),
        },
        swapProcessingService: {
          processTokenBatchWithSSE: jest.fn(() => ({
            successful: [{ inputValueUSD: 100 }],
            failed: [],
            transactions: [{ to: '0x123' }],
          })),
        },
      },
    };

    mockStreamWriter = jest.fn();
    orchestrator = new DustZapSSEOrchestrator(mockDustZapHandler);

    SSEEventFactory.createCompletionEvent.mockReturnValue({ type: 'complete' });
    SSEEventFactory.createErrorEvent.mockReturnValue({ type: 'error' });
    SwapProcessingService.createProcessingContext.mockReturnValue({
      context: 'test',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('orchestrateSSEStreaming', () => {
    const mockExecutionContext = {
      dustTokens: [
        { symbol: 'USDC', amount: 100, price: 1 },
        { symbol: 'DAI', amount: 50, price: 1 },
      ],
      params: { referralAddress: '0xref123' },
      ethPrice: 2000,
      chainId: 1,
      batches: [[{ symbol: 'USDC' }], [{ symbol: 'DAI' }]],
    };

    it('should orchestrate complete SSE streaming workflow', async () => {
      const result = await orchestrator.orchestrateSSEStreaming(
        mockExecutionContext,
        mockStreamWriter
      );

      expect(
        SwapProcessingService.createProcessingContext
      ).toHaveBeenCalledWith(mockExecutionContext);
      expect(
        mockDustZapHandler.executor.swapProcessingService
          .processTokenBatchWithSSE
      ).toHaveBeenCalled();
      expect(mockStreamWriter).toHaveBeenCalledWith({ type: 'complete' });
      expect(result).toMatchObject({
        allTransactions: [{ to: '0x123' }],
        totalValueUSD: 100,
        processedTokens: 1,
        successfulTokens: 1,
        failedTokens: 0,
      });
    });

    it('should handle errors during orchestration', async () => {
      const error = new Error('Orchestration failed');
      mockDustZapHandler.executor.swapProcessingService.processTokenBatchWithSSE.mockRejectedValue(
        error
      );

      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      await expect(
        orchestrator.orchestrateSSEStreaming(
          mockExecutionContext,
          mockStreamWriter
        )
      ).rejects.toThrow(error);

      expect(consoleError).toHaveBeenCalledWith(
        'SSE orchestration error:',
        error
      );
      expect(mockStreamWriter).toHaveBeenCalledWith({ type: 'error' });

      consoleError.mockRestore();
    });
  });

  describe('processTokensWithStreaming', () => {
    const mockExecutionContext = {
      dustTokens: [
        { symbol: 'USDC', amount: 100, price: 1 },
        { symbol: 'DAI', amount: 50, price: 1 },
      ],
      params: { referralAddress: '0xref123' },
      ethPrice: 2000,
      chainId: 1,
      batches: [[{ symbol: 'USDC' }], [{ symbol: 'DAI' }]],
    };

    it('should process tokens with streaming', async () => {
      const result = await orchestrator.processTokensWithStreaming(
        mockExecutionContext,
        mockStreamWriter
      );

      expect(
        mockDustZapHandler.executor.feeCalculationService.createFeeTransactions
      ).toHaveBeenCalledWith(
        150, // estimatedTotalValueUSD
        2000, // ethPrice
        1, // chainId
        '0xref123' // referralAddress
      );

      expect(
        mockDustZapHandler.executor.smartFeeInsertionService
          .calculateInsertionStrategy
      ).toHaveBeenCalledWith(
        mockExecutionContext.batches,
        '100', // totalFeeETH
        4, // totalExpectedTransactions (2 tokens * 2)
        1 // feeTransactions.length
      );

      expect(
        mockDustZapHandler.executor.swapProcessingService
          .processTokenBatchWithSSE
      ).toHaveBeenCalledWith({
        tokens: mockExecutionContext.dustTokens,
        context: { context: 'test' },
        streamWriter: mockStreamWriter,
        feeTransactions: [{ to: '0xfee', value: '100' }],
        insertionStrategy: { strategy: 'random' },
      });

      expect(result).toMatchObject({
        allTransactions: [{ to: '0x123' }],
        totalValueUSD: 100,
        processedTokens: 1,
        successfulTokens: 1,
        failedTokens: 0,
      });
    });
  });

  describe('createCompletionEvent', () => {
    it('should create completion event with processing results', () => {
      const processingResults = {
        allTransactions: [{ to: '0x123' }, { to: '0x456' }],
        successful: [{ symbol: 'USDC' }, { symbol: 'DAI' }],
        failed: [{ symbol: 'SHIB' }],
        totalValueUSD: 150,
        feeInfo: { platform: '50', referral: '50' },
        feeInsertionStrategy: { strategy: 'random' },
      };

      const executionContext = {
        dustTokens: [{ symbol: 'USDC' }, { symbol: 'DAI' }, { symbol: 'SHIB' }],
      };

      orchestrator.createCompletionEvent(processingResults, executionContext);

      expect(SSEEventFactory.createCompletionEvent).toHaveBeenCalledWith({
        transactions: processingResults.allTransactions,
        metadata: {
          totalTokens: 3,
          processedTokens: 3,
          successfulTokens: 2,
          failedTokens: 1,
          totalValueUSD: 150,
          feeInfo: processingResults.feeInfo,
          feeInsertionStrategy: processingResults.feeInsertionStrategy,
        },
      });
    });

    it('should handle missing data gracefully', () => {
      orchestrator.createCompletionEvent({}, {});

      expect(SSEEventFactory.createCompletionEvent).toHaveBeenCalledWith({
        transactions: [],
        metadata: {
          totalTokens: 0,
          processedTokens: 0,
          successfulTokens: 0,
          failedTokens: 0,
          totalValueUSD: 0,
          feeInfo: null,
          feeInsertionStrategy: null,
        },
      });
    });
  });

  describe('createErrorEvent', () => {
    it('should create error event', () => {
      const error = new Error('Test error');
      const context = { processedTokens: 2, totalTokens: 5 };

      orchestrator.createErrorEvent(error, context);

      expect(SSEEventFactory.createErrorEvent).toHaveBeenCalledWith(
        error,
        context
      );
    });
  });
});
