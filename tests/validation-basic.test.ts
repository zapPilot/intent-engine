import { validateRequest, intentRequestSchema, quoteRequestSchema } from '../src/middleware/validation';
import { Request, Response, NextFunction } from 'express';

describe('Validation Basic Tests', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockNext = jest.fn();
    
    mockRequest = {
      body: {}
    };
    
    mockResponse = {
      json: mockJson,
      status: mockStatus
    };
  });

  describe('validateRequest function', () => {
    it('should be a function', () => {
      expect(typeof validateRequest).toBe('function');
    });

    it('should return a middleware function', () => {
      const middleware = validateRequest(intentRequestSchema);
      expect(typeof middleware).toBe('function');
    });

    it('should call next for valid data', () => {
      mockRequest.body = {
        action: 'swap',
        params: {
          amount: '1000000000000000000',
          fromToken: 'ETH',
          toToken: '0xA0b86a33E6417C83b20B44eb26a3f1b1B3b02b7B',
          chainId: 1
        },
        userAddress: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571'
      };

      const middleware = validateRequest(intentRequestSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid data', () => {
      mockRequest.body = {
        action: 'invalid-action'
      };

      const middleware = validateRequest(intentRequestSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Schema exports', () => {
    it('should export intentRequestSchema', () => {
      expect(intentRequestSchema).toBeDefined();
    });

    it('should export quoteRequestSchema', () => {
      expect(quoteRequestSchema).toBeDefined();
    });
  });
});