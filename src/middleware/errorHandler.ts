import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  err.statusCode = err.statusCode || 500;
  err.isOperational = err.isOperational || false;

  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    statusCode: err.statusCode,
    method: req.method,
    url: req.url,
    ip: req.ip,
  });

  if (err.statusCode === 500) {
    res.status(500).json({
      error: 'Internal server error',
      requestId: req.headers['x-request-id'],
    });
  } else {
    res.status(err.statusCode).json({
      error: err.message,
      requestId: req.headers['x-request-id'],
    });
  }
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};