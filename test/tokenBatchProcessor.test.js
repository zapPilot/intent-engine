const TokenBatchProcessor = require('../src/services/TokenBatchProcessor');

// Mock dependencies
jest.mock('../src/services/SmartFeeInsertionService', () => {
  return jest.fn().mockImplementation(() => ({
    processFeeInsertion: jest.fn(),
    insertRemainingFees: jest.fn(),
  }));
});

jest.mock('../src/services/ProgressTracker', () => {
  return jest.fn().mockImplementation(() => ({
    reset: jest.fn(),
    handleTokenProcessingResult: jest.fn(),
    getProgressInfo: jest.fn(),
    getFinalSummary: jest.fn(),
    failedCount: 0,
    processedCount: 0,
  }));
});

describe('TokenBatchProcessor', () => {
  let tokenBatchProcessor;
  let mockTokenProcessor;
  let mockSmartFeeInsertionService;
  let mockProgressTracker;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock TokenProcessor
    mockTokenProcessor = {
      processTokenWithSSE: jest.fn(),
      handleTokenFailure: jest.fn(),
    };

    // Create TokenBatchProcessor instance
    tokenBatchProcessor = new TokenBatchProcessor(mockTokenProcessor);

    // Get references to the mocked dependencies
    mockSmartFeeInsertionService = tokenBatchProcessor.smartFeeInsertionService;
    mockProgressTracker = tokenBatchProcessor.progressTracker;
  });

  describe('constructor', () => {
    it('should initialize with TokenProcessor and create dependent services', () => {
      expect(tokenBatchProcessor.tokenProcessor).toBe(mockTokenProcessor);
      expect(tokenBatchProcessor.smartFeeInsertionService).toBeDefined();
      expect(tokenBatchProcessor.progressTracker).toBeDefined();
    });
  });

  describe('processTokenBatchWithSSE', () => {
    const mockTokens = [
      { symbol: 'BTC', address: '0x123' },
      { symbol: 'ETH', address: '0x456' },
    ];

    const mockContext = { chainId: 1, userAddress: '0x789' };
    const mockStreamWriter = jest.fn();

    beforeEach(() => {
      // Setup default successful responses
      mockTokenProcessor.processTokenWithSSE.mockResolvedValue({
        success: true,
        transactionData: { hash: '0xabc' },
        valueUSD: 100,
      });

      mockProgressTracker.handleTokenProcessingResult.mockReturnValue({
        updatedTransactionIndex: 1,
      });
    });

    it('should process all tokens successfully without fee insertion', async () => {
      const params = {
        tokens: mockTokens,
        context: mockContext,
        streamWriter: mockStreamWriter,
      };

      const result = await tokenBatchProcessor.processTokenBatchWithSSE(params);

      expect(result).toEqual({
        successful: [],
        failed: [],
        transactions: [],
        totalValueUSD: 0,
      });

      expect(mockProgressTracker.reset).toHaveBeenCalledTimes(1);
      expect(mockTokenProcessor.processTokenWithSSE).toHaveBeenCalledTimes(2);
      expect(
        mockProgressTracker.handleTokenProcessingResult
      ).toHaveBeenCalledTimes(2);
    });

    it('should process tokens with fee insertion', async () => {
      const feeTransactions = [{ type: 'fee', data: '0xfee' }];
      const insertionStrategy = { insertionPoints: [0, 1] };

      mockSmartFeeInsertionService.processFeeInsertion.mockReturnValue({
        insertionPoints: [1],
        feesInserted: 1,
        currentTransactionIndex: 1,
      });

      const params = {
        tokens: mockTokens,
        context: mockContext,
        streamWriter: mockStreamWriter,
        feeTransactions,
        insertionStrategy,
      };

      const result = await tokenBatchProcessor.processTokenBatchWithSSE(params);

      expect(
        mockSmartFeeInsertionService.processFeeInsertion
      ).toHaveBeenCalledTimes(2);
      expect(
        mockSmartFeeInsertionService.insertRemainingFees
      ).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('should handle token processing failures', async () => {
      const mockError = new Error('Token processing failed');
      mockTokenProcessor.processTokenWithSSE
        .mockResolvedValueOnce({
          success: true,
          transactionData: { hash: '0xabc' },
          valueUSD: 100,
        })
        .mockRejectedValueOnce(mockError);

      mockTokenProcessor.handleTokenFailure.mockReturnValue({
        success: false,
        symbol: 'ETH',
        error: mockError.message,
      });

      const params = {
        tokens: mockTokens,
        context: mockContext,
        streamWriter: mockStreamWriter,
      };

      const result = await tokenBatchProcessor.processTokenBatchWithSSE(params);

      expect(mockTokenProcessor.handleTokenFailure).toHaveBeenCalledWith(
        mockTokens[1],
        mockError,
        expect.objectContaining({
          tokenIndex: 1,
          streamWriter: mockStreamWriter,
          processedTokens: 1,
          totalTokens: 2,
        })
      );

      expect(result.failed).toHaveLength(1);
      expect(mockProgressTracker.failedCount).toBe(1);
      expect(mockProgressTracker.processedCount).toBe(1);
    });

    it('should handle progress callback when provided', async () => {
      const mockOnProgress = jest.fn();

      const params = {
        tokens: mockTokens,
        context: mockContext,
        streamWriter: mockStreamWriter,
        onProgress: mockOnProgress,
      };

      await tokenBatchProcessor.processTokenBatchWithSSE(params);

      expect(
        mockProgressTracker.handleTokenProcessingResult
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          onProgress: mockOnProgress,
        })
      );
    });

    it('should pass correct parameters to processTokenStep', async () => {
      const params = {
        tokens: mockTokens,
        context: mockContext,
        streamWriter: mockStreamWriter,
      };

      await tokenBatchProcessor.processTokenBatchWithSSE(params);

      expect(mockTokenProcessor.processTokenWithSSE).toHaveBeenCalledWith({
        token: mockTokens[0],
        tokenIndex: 0,
        context: mockContext,
        streamWriter: mockStreamWriter,
        progressInfo: {
          processedTokens: 0,
          totalTokens: 2,
        },
      });

      expect(mockTokenProcessor.processTokenWithSSE).toHaveBeenCalledWith({
        token: mockTokens[1],
        tokenIndex: 1,
        context: mockContext,
        streamWriter: mockStreamWriter,
        progressInfo: {
          processedTokens: 1,
          totalTokens: 2,
        },
      });
    });

    it('should handle empty tokens array', async () => {
      const params = {
        tokens: [],
        context: mockContext,
        streamWriter: mockStreamWriter,
      };

      const result = await tokenBatchProcessor.processTokenBatchWithSSE(params);

      expect(result).toEqual({
        successful: [],
        failed: [],
        transactions: [],
        totalValueUSD: 0,
      });

      expect(mockTokenProcessor.processTokenWithSSE).not.toHaveBeenCalled();
      expect(mockProgressTracker.reset).toHaveBeenCalledTimes(1);
    });

    it('should handle null/undefined parameters gracefully', async () => {
      const params = {
        tokens: mockTokens,
        context: mockContext,
        streamWriter: mockStreamWriter,
        onProgress: null,
        feeTransactions: null,
        insertionStrategy: null,
      };

      const result = await tokenBatchProcessor.processTokenBatchWithSSE(params);

      expect(result).toBeDefined();
      expect(
        mockSmartFeeInsertionService.processFeeInsertion
      ).not.toHaveBeenCalled();
    });
  });

  describe('initializeFeeInsertionState', () => {
    it('should initialize state when fee transactions and strategy are provided', () => {
      const feeTransactions = [{ type: 'fee' }];
      const insertionStrategy = { insertionPoints: [0, 1, 2] };

      const state = tokenBatchProcessor.initializeFeeInsertionState(
        feeTransactions,
        insertionStrategy
      );

      expect(state).toEqual({
        shouldInsertFees: true,
        insertionPoints: [0, 1, 2],
        currentTransactionIndex: 0,
        feesInserted: 0,
        feeTransactions: [{ type: 'fee' }],
      });
    });

    it('should initialize with shouldInsertFees false when no fee transactions', () => {
      const state = tokenBatchProcessor.initializeFeeInsertionState(null, null);

      expect(state).toEqual({
        shouldInsertFees: null, // null && null = null (falsy)
        insertionPoints: [],
        currentTransactionIndex: 0,
        feesInserted: 0,
        feeTransactions: [],
      });
    });

    it('should initialize with shouldInsertFees false when feeTransactions is not array', () => {
      const feeTransactions = 'not an array';
      const insertionStrategy = { insertionPoints: [0] };

      const state = tokenBatchProcessor.initializeFeeInsertionState(
        feeTransactions,
        insertionStrategy
      );

      expect(state.shouldInsertFees).toBe(false); // 'not an array' && insertionStrategy && Array.isArray('not an array') = false
    });

    it('should handle undefined insertionStrategy', () => {
      const feeTransactions = [{ type: 'fee' }];

      const state = tokenBatchProcessor.initializeFeeInsertionState(
        feeTransactions,
        undefined
      );

      expect(state.shouldInsertFees).toBe(undefined); // feeTransactions && undefined = undefined
    });
  });

  describe('processFeeInsertionStep', () => {
    it('should process fee insertion when shouldInsertFees is true', () => {
      const feeInsertionState = {
        shouldInsertFees: true,
        insertionPoints: [0, 1],
        currentTransactionIndex: 0,
        feesInserted: 0,
        feeTransactions: [{ type: 'fee' }],
      };

      const results = { transactions: [] };

      mockSmartFeeInsertionService.processFeeInsertion.mockReturnValue({
        insertionPoints: [1],
        feesInserted: 1,
        currentTransactionIndex: 1,
      });

      tokenBatchProcessor.processFeeInsertionStep(feeInsertionState, results);

      expect(
        mockSmartFeeInsertionService.processFeeInsertion
      ).toHaveBeenCalledWith({
        shouldInsertFees: true,
        insertionPoints: [0, 1],
        currentTransactionIndex: 0,
        feesInserted: 0,
        feeTransactions: [{ type: 'fee' }],
        results,
      });

      expect(feeInsertionState.insertionPoints).toEqual([1]);
      expect(feeInsertionState.feesInserted).toBe(1);
      expect(feeInsertionState.currentTransactionIndex).toBe(1);
    });

    it('should not process fee insertion when shouldInsertFees is false', () => {
      const feeInsertionState = { shouldInsertFees: false };
      const results = { transactions: [] };

      tokenBatchProcessor.processFeeInsertionStep(feeInsertionState, results);

      expect(
        mockSmartFeeInsertionService.processFeeInsertion
      ).not.toHaveBeenCalled();
    });
  });

  describe('processTokenStep', () => {
    it('should call tokenProcessor.processTokenWithSSE with correct parameters', () => {
      const token = { symbol: 'BTC', address: '0x123' };
      const tokenIndex = 0;
      const context = { chainId: 1 };
      const streamWriter = jest.fn();
      const tokens = [token, { symbol: 'ETH' }];

      const params = {
        token,
        tokenIndex,
        context,
        streamWriter,
        tokens,
      };

      tokenBatchProcessor.processTokenStep(params);

      expect(mockTokenProcessor.processTokenWithSSE).toHaveBeenCalledWith({
        token,
        tokenIndex,
        context,
        streamWriter,
        progressInfo: {
          processedTokens: 0,
          totalTokens: 2,
        },
      });
    });
  });

  describe('insertRemainingFees', () => {
    it('should insert remaining fees when shouldInsertFees is true', () => {
      const feeInsertionState = {
        shouldInsertFees: true,
        feesInserted: 1,
        feeTransactions: [{ type: 'fee1' }, { type: 'fee2' }],
      };

      const results = { transactions: [] };

      tokenBatchProcessor.insertRemainingFees(feeInsertionState, results);

      expect(
        mockSmartFeeInsertionService.insertRemainingFees
      ).toHaveBeenCalledWith({
        shouldInsertFees: true,
        feesInserted: 1,
        feeTransactions: [{ type: 'fee1' }, { type: 'fee2' }],
        results,
      });
    });

    it('should not insert fees when shouldInsertFees is false', () => {
      const feeInsertionState = { shouldInsertFees: false };
      const results = { transactions: [] };

      tokenBatchProcessor.insertRemainingFees(feeInsertionState, results);

      expect(
        mockSmartFeeInsertionService.insertRemainingFees
      ).not.toHaveBeenCalled();
    });
  });

  describe('getProgressInfo', () => {
    it('should delegate to progressTracker.getProgressInfo', () => {
      const totalTokens = 5;
      const mockProgressInfo = {
        processedTokens: 3,
        totalTokens: 5,
        percentage: 60,
      };

      mockProgressTracker.getProgressInfo.mockReturnValue(mockProgressInfo);

      const result = tokenBatchProcessor.getProgressInfo(totalTokens);

      expect(mockProgressTracker.getProgressInfo).toHaveBeenCalledWith(
        totalTokens
      );
      expect(result).toEqual(mockProgressInfo);
    });
  });

  describe('getFinalSummary', () => {
    it('should delegate to progressTracker.getFinalSummary', () => {
      const totalTokens = 10;
      const mockSummary = {
        totalTokens: 10,
        successful: 8,
        failed: 2,
        duration: '2.5s',
      };

      mockProgressTracker.getFinalSummary.mockReturnValue(mockSummary);

      const result = tokenBatchProcessor.getFinalSummary(totalTokens);

      expect(mockProgressTracker.getFinalSummary).toHaveBeenCalledWith(
        totalTokens
      );
      expect(result).toEqual(mockSummary);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle multiple consecutive token failures', async () => {
      const mockTokens = [
        { symbol: 'BTC', address: '0x123' },
        { symbol: 'ETH', address: '0x456' },
        { symbol: 'USDC', address: '0x789' },
      ];

      const mockError1 = new Error('BTC processing failed');
      const mockError2 = new Error('ETH processing failed');

      mockTokenProcessor.processTokenWithSSE
        .mockRejectedValueOnce(mockError1)
        .mockRejectedValueOnce(mockError2)
        .mockResolvedValueOnce({
          success: true,
          transactionData: { hash: '0x123' },
          valueUSD: 50,
        });

      mockTokenProcessor.handleTokenFailure
        .mockReturnValueOnce({
          success: false,
          symbol: 'BTC',
          error: mockError1.message,
        })
        .mockReturnValueOnce({
          success: false,
          symbol: 'ETH',
          error: mockError2.message,
        });

      // Mock progress tracker to return proper results
      mockProgressTracker.handleTokenProcessingResult.mockReturnValue({
        updatedTransactionIndex: 1,
      });

      const params = {
        tokens: mockTokens,
        context: { chainId: 1 },
        streamWriter: jest.fn(),
      };

      const result = await tokenBatchProcessor.processTokenBatchWithSSE(params);

      expect(result.failed).toHaveLength(2);
      expect(mockProgressTracker.failedCount).toBe(2);
      expect(mockProgressTracker.processedCount).toBe(2);
      expect(mockTokenProcessor.handleTokenFailure).toHaveBeenCalledTimes(2);
      // The third token should be processed successfully
      expect(mockTokenProcessor.processTokenWithSSE).toHaveBeenCalledTimes(3);
    });

    it('should handle async errors from token processor gracefully', async () => {
      const mockTokens = [{ symbol: 'BTC', address: '0x123' }];
      const asyncError = new Error('Async processing error');

      mockTokenProcessor.processTokenWithSSE.mockRejectedValue(asyncError);
      mockTokenProcessor.handleTokenFailure.mockReturnValue({
        success: false,
        symbol: 'BTC',
        error: asyncError.message,
      });

      const params = {
        tokens: mockTokens,
        context: { chainId: 1 },
        streamWriter: jest.fn(),
      };

      // Should not throw, should handle gracefully
      const result = await tokenBatchProcessor.processTokenBatchWithSSE(params);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Async processing error');
    });

    it('should update fee insertion transaction index correctly', async () => {
      const mockTokens = [
        { symbol: 'BTC', address: '0x123' },
        { symbol: 'ETH', address: '0x456' },
      ];

      const feeTransactions = [{ type: 'fee' }];
      const insertionStrategy = { insertionPoints: [0, 1] };

      let currentIndex = 0;
      mockSmartFeeInsertionService.processFeeInsertion.mockReturnValue({
        insertionPoints: [],
        feesInserted: 1,
        currentTransactionIndex: ++currentIndex,
      });

      mockProgressTracker.handleTokenProcessingResult
        .mockReturnValueOnce({ updatedTransactionIndex: 2 })
        .mockReturnValueOnce({ updatedTransactionIndex: 3 });

      const params = {
        tokens: mockTokens,
        context: { chainId: 1 },
        streamWriter: jest.fn(),
        feeTransactions,
        insertionStrategy,
      };

      await tokenBatchProcessor.processTokenBatchWithSSE(params);

      // Verify that currentTransactionIndex is updated correctly throughout the process
      const feeInsertionCalls =
        mockSmartFeeInsertionService.processFeeInsertion.mock.calls;
      expect(feeInsertionCalls[0][0].currentTransactionIndex).toBe(0);
      expect(feeInsertionCalls[1][0].currentTransactionIndex).toBe(2);
    });
  });
});
