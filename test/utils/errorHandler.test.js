const {
  ApiError,
  ValidationError,
  NotFoundError,
  ExternalServiceError,
  RateLimitError,
  InsufficientLiquidityError,
  TokenNotSupportedError,
  formatErrorResponse,
  getErrorStatusCode,
  asyncHandler,
  logError,
  createExternalServiceError,
} = require('../../src/utils/errorHandler');

describe('Error Handler Utilities', () => {
  describe('ApiError', () => {
    it('should create an ApiError with default values', () => {
      const error = new ApiError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.details).toEqual({});
      expect(error.timestamp).toBeDefined();
    });

    it('should create an ApiError with custom values', () => {
      const error = new ApiError('Custom error', 400, 'CUSTOM_ERROR', {
        field: 'test',
      });
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('CUSTOM_ERROR');
      expect(error.details).toEqual({ field: 'test' });
    });

    it('should serialize to JSON correctly', () => {
      const error = new ApiError('Test error', 404, 'NOT_FOUND');
      const json = error.toJSON();
      expect(json).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Test error',
          statusCode: 404,
          details: {},
          timestamp: expect.any(String),
        },
      });
    });
  });

  describe('ValidationError', () => {
    it('should create a ValidationError', () => {
      const errors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' },
      ];
      const error = new ValidationError('Validation failed', errors);
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details.errors).toEqual(errors);
    });
  });

  describe('NotFoundError', () => {
    it('should create a NotFoundError', () => {
      const error = new NotFoundError('User', '123');
      expect(error.message).toBe('User not found: 123');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.details).toEqual({ resource: 'User', identifier: '123' });
    });
  });

  describe('ExternalServiceError', () => {
    it('should create an ExternalServiceError', () => {
      const originalError = new Error('Connection failed');
      const error = new ExternalServiceError(
        'PaymentAPI',
        'Connection timeout',
        originalError
      );
      expect(error.message).toBe('PaymentAPI error: Connection timeout');
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(error.service).toBe('PaymentAPI');
      expect(error.originalError).toBe(originalError);
    });
  });

  describe('RateLimitError', () => {
    it('should create a RateLimitError', () => {
      const error = new RateLimitError('GitHub', 60);
      expect(error.message).toBe('Rate limit exceeded for GitHub');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('InsufficientLiquidityError', () => {
    it('should create an InsufficientLiquidityError', () => {
      const error = new InsufficientLiquidityError('Uniswap', 'ETH/USDC');
      expect(error.message).toBe(
        'Insufficient liquidity on Uniswap for ETH/USDC'
      );
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('INSUFFICIENT_LIQUIDITY');
    });
  });

  describe('TokenNotSupportedError', () => {
    it('should create a TokenNotSupportedError without provider', () => {
      const error = new TokenNotSupportedError('XYZ');
      expect(error.message).toBe('Token XYZ not supported');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TOKEN_NOT_SUPPORTED');
    });

    it('should create a TokenNotSupportedError with provider', () => {
      const error = new TokenNotSupportedError('XYZ', 'CoinGecko');
      expect(error.message).toBe('Token XYZ not supported by CoinGecko');
    });
  });

  describe('formatErrorResponse', () => {
    it('should format ApiError correctly', () => {
      const error = new ApiError('Test error', 400, 'TEST_ERROR', {
        foo: 'bar',
      });
      const response = formatErrorResponse(error);
      expect(response).toEqual({
        error: {
          code: 'TEST_ERROR',
          message: 'Test error',
          statusCode: 400,
          details: { foo: 'bar' },
          timestamp: expect.any(String),
        },
      });
    });

    it('should format generic Error correctly', () => {
      const error = new Error('Generic error');
      const response = formatErrorResponse(error);
      expect(response).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Generic error',
          statusCode: 500,
          timestamp: expect.any(String),
        },
      });
    });

    it('should handle error without message', () => {
      const error = new Error();
      const response = formatErrorResponse(error);
      expect(response.error.message).toBe('An unexpected error occurred');
    });
  });

  describe('getErrorStatusCode', () => {
    it('should get status code from ApiError', () => {
      const error = new ApiError('Test', 404);
      expect(getErrorStatusCode(error)).toBe(404);
    });

    it('should get status code from error.status', () => {
      const error = new Error('Test');
      error.status = 401;
      expect(getErrorStatusCode(error)).toBe(401);
    });

    it('should get status code from error.statusCode', () => {
      const error = new Error('Test');
      error.statusCode = 403;
      expect(getErrorStatusCode(error)).toBe(403);
    });

    it('should get status code from error.response.status', () => {
      const error = new Error('Test');
      error.response = { status: 429 };
      expect(getErrorStatusCode(error)).toBe(429);
    });

    it('should return 500 for unknown error', () => {
      const error = new Error('Test');
      expect(getErrorStatusCode(error)).toBe(500);
    });
  });

  describe('asyncHandler', () => {
    it('should handle successful async function', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      const wrapped = asyncHandler(mockFn);
      const req = {};
      const res = {};
      const next = jest.fn();

      await wrapped(req, res, next);

      expect(mockFn).toHaveBeenCalledWith(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });

    it('should catch errors and pass to next', async () => {
      const error = new Error('Async error');
      const mockFn = jest.fn().mockRejectedValue(error);
      const wrapped = asyncHandler(mockFn);
      const req = {};
      const res = {};
      const next = jest.fn();

      await wrapped(req, res, next);

      expect(mockFn).toHaveBeenCalledWith(req, res, next);
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('logError', () => {
    let consoleErrorSpy;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should log error with context', () => {
      const error = new Error('Test error');
      error.stack = 'Error stack';
      const context = { userId: '123', action: 'create' };

      logError(error, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error occurred:',
        expect.stringContaining('"name": "Error"')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error occurred:',
        expect.stringContaining('"message": "Test error"')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error occurred:',
        expect.stringContaining('"userId": "123"')
      );
    });
  });

  describe('createExternalServiceError', () => {
    it('should create error from axios response error', () => {
      const axiosError = new Error('Request failed');
      axiosError.response = {
        data: { message: 'Invalid API key' },
      };

      const error = createExternalServiceError('TestAPI', axiosError);

      expect(error).toBeInstanceOf(ExternalServiceError);
      expect(error.message).toBe('TestAPI error: Invalid API key');
      expect(error.service).toBe('TestAPI');
    });

    it('should handle various error message formats', () => {
      const testCases = [
        { data: { error: 'Error message' }, expected: 'Error message' },
        { data: { error_message: 'Error msg' }, expected: 'Error msg' },
        {
          data: { status: { error_message: 'Status error' } },
          expected: 'Status error',
        },
      ];

      testCases.forEach(({ data, expected }) => {
        const axiosError = new Error('Request failed');
        axiosError.response = { data };
        const error = createExternalServiceError('API', axiosError);
        expect(error.message).toBe(`API error: ${expected}`);
      });
    });

    it('should handle network error', () => {
      const axiosError = new Error('Network error');
      axiosError.request = {};

      const error = createExternalServiceError('TestAPI', axiosError);

      expect(error.message).toBe('TestAPI error: Network error: Network error');
    });

    it('should handle generic error', () => {
      const genericError = new Error('Something went wrong');

      const error = createExternalServiceError('TestAPI', genericError);

      expect(error.message).toBe('TestAPI error: Something went wrong');
    });
  });
});
