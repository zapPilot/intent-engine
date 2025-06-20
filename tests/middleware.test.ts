import { Request, Response, NextFunction } from 'express';
import { errorHandler, asyncHandler, AppError } from '../src/middleware/errorHandler';
import { logger } from '../src/utils/logger';

// Mock logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      url: '/test',
      ip: '127.0.0.1',
      headers: {
        'x-request-id': 'test-request-id',
      },
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();

    // Clear mock calls
    jest.clearAllMocks();
  });

  describe('errorHandler', () => {
    it('should handle AppError with custom status code', () => {
      const error: AppError = new Error('Custom error');
      error.statusCode = 400;
      error.isOperational = true;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Custom error',
        requestId: 'test-request-id',
      });
      expect(logger.error).toHaveBeenCalledWith('Error occurred:', {
        message: 'Custom error',
        stack: error.stack,
        statusCode: 400,
        method: 'GET',
        url: '/test',
        ip: '127.0.0.1',
      });
    });

    it('should handle generic error with 500 status code', () => {
      const error = new Error('Internal error');

      errorHandler(error as AppError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        requestId: 'test-request-id',
      });
      expect(logger.error).toHaveBeenCalledWith('Error occurred:', {
        message: 'Internal error',
        stack: error.stack,
        statusCode: 500,
        method: 'GET',
        url: '/test',
        ip: '127.0.0.1',
      });
    });

    it('should handle error without request ID', () => {
      const error: AppError = new Error('Test error');
      error.statusCode = 404;
      mockRequest.headers = {};

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Test error',
        requestId: undefined,
      });
    });

    it('should set default values for missing error properties', () => {
      const error = new Error('Basic error') as AppError;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(logger.error).toHaveBeenCalledWith(
        'Error occurred:',
        expect.objectContaining({
          statusCode: 500,
          message: 'Basic error',
        })
      );
    });

    it('should preserve existing error properties', () => {
      const error: AppError = new Error('Preserved error');
      error.statusCode = 422;
      error.isOperational = true;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(logger.error).toHaveBeenCalledWith(
        'Error occurred:',
        expect.objectContaining({
          statusCode: 422,
          message: 'Preserved error',
        })
      );
    });

    it('should handle different HTTP methods and URLs', () => {
      const error = new Error('Method test') as AppError;
      mockRequest.method = 'POST';
      mockRequest.url = '/api/v1/test';

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        'Error occurred:',
        expect.objectContaining({
          method: 'POST',
          url: '/api/v1/test',
        })
      );
    });

    it('should not call next function (unused parameter test)', () => {
      const error = new Error('Next function test') as AppError;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('asyncHandler', () => {
    it('should call the wrapped function with correct parameters', async () => {
      const mockFunction = jest.fn().mockResolvedValue('success');
      const wrappedFunction = asyncHandler(mockFunction);

      await wrappedFunction(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockFunction).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
    });

    it('should pass through successful function execution', async () => {
      const mockFunction = jest.fn().mockResolvedValue('success');
      const wrappedFunction = asyncHandler(mockFunction);

      await wrappedFunction(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockFunction).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should catch and forward rejected promises to next', async () => {
      const error = new Error('Async error');
      const mockFunction = jest.fn().mockRejectedValue(error);
      const wrappedFunction = asyncHandler(mockFunction);

      await wrappedFunction(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should handle Promise.resolve wrapper for sync functions', async () => {
      const mockFunction = jest.fn().mockReturnValue('sync result');
      const wrappedFunction = asyncHandler(mockFunction);

      await wrappedFunction(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockFunction).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle functions that return undefined', async () => {
      const mockFunction = jest.fn().mockResolvedValue(undefined);
      const wrappedFunction = asyncHandler(mockFunction);

      const result = await wrappedFunction(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(result).toBeUndefined();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should work with different function signatures', async () => {
      const mockFunction = jest.fn((req: Request, res: Response) => {
        return Promise.resolve({ req: req.method, res: res.status });
      });
      const wrappedFunction = asyncHandler(mockFunction);

      await wrappedFunction(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockFunction).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
    });
  });

  describe('AppError Interface', () => {
    it('should create AppError with extended properties', () => {
      const error: AppError = new Error('App error test');
      error.statusCode = 400;
      error.isOperational = true;

      expect(error.message).toBe('App error test');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
      expect(error.stack).toBeDefined();
    });

    it('should allow AppError without extended properties', () => {
      const error: AppError = new Error('Basic app error');

      expect(error.message).toBe('Basic app error');
      expect(error.statusCode).toBeUndefined();
      expect(error.isOperational).toBeUndefined();
    });
  });
});
