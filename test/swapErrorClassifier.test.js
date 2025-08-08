const {
  SwapErrorClassifier,
  ERROR_CATEGORIES,
  PROVIDER_STATES,
  SSE_EVENT_TYPES,
} = require('../src/utils/SwapErrorClassifier');

describe('SwapErrorClassifier', () => {
  describe('classifyError', () => {
    it('should classify network errors', () => {
      const result = SwapErrorClassifier.classifyError('network timeout', {
        tokenSymbol: 'BTC',
      });
      expect(result.category).toBe(ERROR_CATEGORIES.NETWORK_ERROR);
      expect(result.providerState).toBe(PROVIDER_STATES.TIMEOUT);
      expect(result.userFriendlyMessage).toMatch(/Network error/);
    });

    it('should classify validation errors', () => {
      const result = SwapErrorClassifier.classifyError('validation failed', {
        tokenSymbol: 'ETH',
      });
      expect(result.category).toBe(ERROR_CATEGORIES.VALIDATION_ERROR);
      expect(result.providerState).toBe(PROVIDER_STATES.FAILED);
    });

    it('should classify data extraction errors', () => {
      const result = SwapErrorClassifier.classifyError('some error', {
        tokenSymbol: 'USDC',
        swapQuote: {},
      });
      expect(result.category).toBe(ERROR_CATEGORIES.DATA_EXTRACTION_ERROR);
    });

    it('should classify quote failures', () => {
      const result = SwapErrorClassifier.classifyError('no route', {
        tokenSymbol: 'DAI',
        swapQuote: { provider: 'failed' },
      });
      expect(result.category).toBe(ERROR_CATEGORIES.QUOTE_FAILED);
      expect(result.providerState).toBe(PROVIDER_STATES.FAILED);
    });

    it('should classify processing errors by default', () => {
      const result = SwapErrorClassifier.classifyError('other error', {
        tokenSymbol: 'MKR',
        swapQuote: { provider: 'uniswap' },
      });
      expect(result.category).toBe(ERROR_CATEGORIES.PROCESSING_ERROR);
      expect(result.providerState).toBe(PROVIDER_STATES.ERROR);
    });
  });

  describe('createFallbackData', () => {
    it('should create standardized fallback data', () => {
      const classification = {
        category: ERROR_CATEGORIES.NETWORK_ERROR,
        providerState: PROVIDER_STATES.TIMEOUT,
        errorMessage: 'timeout',
        userFriendlyMessage: 'Network error',
      };
      const data = SwapErrorClassifier.createFallbackData(classification, {
        inputValueUSD: 100,
      });
      expect(data.provider).toBe(PROVIDER_STATES.TIMEOUT);
      expect(data.tradingLoss.netLossUSD).toBe(100);
      expect(data.errorCategory).toBe(ERROR_CATEGORIES.NETWORK_ERROR);
      expect(data.success).toBe(false);
    });
  });

  it('getSSEEventType should always return token_failed', () => {
    expect(SwapErrorClassifier.getSSEEventType({})).toBe(
      SSE_EVENT_TYPES.TOKEN_FAILED
    );
  });

  it('createSSEErrorEvent should build event with fallback data', () => {
    const token = { symbol: 'BTC', address: '0xbtc', amount: 1, price: 10000 };
    const event = SwapErrorClassifier.createSSEErrorEvent(
      token,
      'network down',
      0,
      { processedTokens: 0, totalTokens: 2 }
    );
    expect(event.type).toBe(SSE_EVENT_TYPES.TOKEN_FAILED);
    expect(event.tokenSymbol).toBe('BTC');
    expect(event.progress).toBeCloseTo(0.5);
    expect(event.tradingLoss.inputValueUSD).toBe(10000);
  });

  describe('isSwapSuccessful', () => {
    it('should detect successful swaps', () => {
      const swapResult = { success: true, swapQuote: { provider: 'ok' } };
      expect(SwapErrorClassifier.isSwapSuccessful(swapResult)).toBe(true);
    });

    it('should detect failed swaps', () => {
      const swapResult = { success: false, swapQuote: { provider: 'failed' } };
      expect(SwapErrorClassifier.isSwapSuccessful(swapResult)).toBe(false);
    });
  });
});
