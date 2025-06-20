import { Request, Response } from 'express';
import { QuoteRequest, QuoteResponse } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export class QuoteController {
  public getQuote = asyncHandler(async (req: Request, res: Response) => {
    const quoteRequest: QuoteRequest = req.query as any;
    
    logger.info('Getting quote:', {
      action: quoteRequest.action,
      fromToken: quoteRequest.fromToken,
      toToken: quoteRequest.toToken,
      chainId: quoteRequest.chainId,
      amount: quoteRequest.amount,
    });

    const response: QuoteResponse = {
      bestRoute: {
        provider: '1inch',
        route: [quoteRequest.fromToken, quoteRequest.toToken],
        amountIn: quoteRequest.amount,
        amountOut: quoteRequest.amount,
        gasEstimate: '21000',
        priceImpact: '0.1',
      },
      alternatives: [],
      gasEstimate: '21000',
      priceImpact: '0.1',
      fees: {
        protocolFee: '0',
        gasFee: '0.001',
        totalFee: '0.001',
      },
    };

    logger.info('Quote generated:', {
      provider: response.bestRoute.provider,
      gasEstimate: response.gasEstimate,
      priceImpact: response.priceImpact,
    });

    res.json(response);
  });
}