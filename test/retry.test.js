const { retryWithBackoff, RetryStrategies } = require('../src/utils/retry');

describe('Enhanced Retry System', () => {
  describe('retryWithBackoff with custom strategy', () => {
    it('should use custom retry strategy when provided', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('retryable error'))
        .mockResolvedValueOnce('success');

      const customStrategy = jest.fn().mockReturnValue(true);

      const result = await retryWithBackoff(
        mockFn,
        { retries: 1 },
        customStrategy
      );

      expect(result).toBe('success');
      expect(customStrategy).toHaveBeenCalledWith(
        expect.any(Error),
        1,
        expect.any(Object)
      );
    });

    it('should not retry when custom strategy returns false', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('non-retryable'));
      const customStrategy = jest.fn().mockReturnValue(false);

      await expect(
        retryWithBackoff(mockFn, { retries: 3 }, customStrategy)
      ).rejects.toThrow('non-retryable');

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(customStrategy).toHaveBeenCalledTimes(1);
    });
  });

  describe('RetryStrategies.oneInch', () => {
    it('should not retry on HTTP 400 errors', () => {
      const error = {
        response: { status: 400, data: { message: 'Bad Request' } },
      };

      const shouldRetry = RetryStrategies.oneInch(error, 1, {});
      expect(shouldRetry).toBe(false);
    });

    it('should not retry on unsupported token errors', () => {
      const error = {
        response: {
          status: 200,
          data: { message: 'Token not found' },
        },
      };

      const shouldRetry = RetryStrategies.oneInch(error, 1, {});
      expect(shouldRetry).toBe(false);
    });

    it('should retry on network errors', () => {
      const error = { code: 'ECONNRESET' };

      const shouldRetry = RetryStrategies.oneInch(error, 1, {});
      expect(shouldRetry).toBe(true);
    });

    it('should retry on 5xx server errors', () => {
      const error = {
        response: { status: 500, data: { message: 'Internal Server Error' } },
      };

      const shouldRetry = RetryStrategies.oneInch(error, 1, {});
      expect(shouldRetry).toBe(true);
    });
  });

  describe('RetryStrategies.paraswap', () => {
    it('should not retry on no route found errors', () => {
      const error = {
        response: {
          status: 400,
          data: { message: 'No route found' },
        },
      };

      const shouldRetry = RetryStrategies.paraswap(error, 1, {});
      expect(shouldRetry).toBe(false);
    });

    it('should not retry on authentication errors', () => {
      const error = {
        response: { status: 401, data: { message: 'Unauthorized' } },
      };

      const shouldRetry = RetryStrategies.paraswap(error, 1, {});
      expect(shouldRetry).toBe(false);
    });
  });

  describe('RetryStrategies.zeroX', () => {
    it('should not retry on asset not supported errors', () => {
      const error = {
        liquidityAvailable: false,
      };

      const shouldRetry = RetryStrategies.zeroX(error, 1, {});
      expect(shouldRetry).toBe(false);
    });
  });
});
