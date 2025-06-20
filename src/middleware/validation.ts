import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body);

    if (error) {
      res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
      return;
    }

    next();
  };
};

export const intentRequestSchema = Joi.object({
  action: Joi.string().valid('zapIn', 'zapOut', 'rebalance', 'swap', 'bridge').required(),
  params: Joi.object({
    amount: Joi.string().required(),
    fromToken: Joi.string().required(),
    toToken: Joi.string().required(),
    chainId: Joi.number().integer().required(),
    slippageTolerance: Joi.number().min(0).max(100).optional(),
    deadline: Joi.number().integer().optional(),
  }).required(),
  userAddress: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{40}$/)
    .required(),
  preferences: Joi.object({
    gasOptimization: Joi.string().valid('speed', 'cost', 'balanced').optional(),
    bridgeProvider: Joi.string().valid('across', 'squid', 'auto').optional(),
  }).optional(),
});

export const quoteRequestSchema = Joi.object({
  action: Joi.string().required(),
  amount: Joi.string().required(),
  fromToken: Joi.string().required(),
  toToken: Joi.string().required(),
  chainId: Joi.number().integer().required(),
});
