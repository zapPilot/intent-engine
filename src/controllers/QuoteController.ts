import { Request, Response } from 'express';
import { QuoteRequest, QuoteResponse } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { oneInchProvider } from '../integrations/swap-providers/OneInchProvider';
import { gasOptimizer } from '../utils/GasOptimizer';

export class QuoteController {
  public getQuote = asyncHandler(async (req: Request, res: Response) => {
    const quoteRequest: QuoteRequest = {
      action: req.query.action as string,
      amount: req.query.amount as string,
      fromToken: req.query.fromToken as string,
      toToken: req.query.toToken as string,
      chainId: parseInt(req.query.chainId as string),
    };

    logger.info('Getting quote:', {
      action: quoteRequest.action,
      fromToken: quoteRequest.fromToken,
      toToken: quoteRequest.toToken,
      chainId: quoteRequest.chainId,
      amount: quoteRequest.amount,
    });

    try {
      let routes = [];
      let bestRoute;
      let gasEstimate = '21000';
      let priceImpact = '0';

      // Get quotes from 1inch if it's a swap and chain is supported
      if (
        quoteRequest.action === 'swap' &&
        oneInchProvider.isChainSupported(quoteRequest.chainId)
      ) {
        routes = await oneInchProvider.getQuotes(quoteRequest);

        if (routes.length > 0) {
          bestRoute = routes[0];
          gasEstimate = bestRoute.gasEstimate;
          priceImpact = bestRoute.priceImpact;
        }
      }

      // Fallback to default route if no routes found
      if (!bestRoute) {
        bestRoute = {
          provider: 'fallback',
          route: [quoteRequest.fromToken, quoteRequest.toToken],
          amountIn: quoteRequest.amount,
          amountOut: quoteRequest.amount,
          gasEstimate: '21000',
          priceImpact: '0.1',
        };
      }

      // Get gas price info for fee calculation
      const networkGasInfo = await gasOptimizer.getNetworkGasInfo(quoteRequest.chainId);
      const gasPriceWei = networkGasInfo.gasPrice;
      const gasCostWei = (BigInt(gasEstimate) * BigInt(gasPriceWei)).toString();
      const gasFeeEth = (Number(gasCostWei) / Math.pow(10, 18)).toFixed(6);

      const response: QuoteResponse = {
        bestRoute,
        alternatives: routes.slice(1), // All routes except the best one
        gasEstimate,
        priceImpact,
        fees: {
          protocolFee: '0', // This would come from the protocol configuration
          gasFee: gasFeeEth,
          bridgeFee: quoteRequest.action === 'bridge' ? '0.001' : undefined,
          totalFee: gasFeeEth,
        },
      };

      logger.info('Quote generated:', {
        provider: response.bestRoute.provider,
        gasEstimate: response.gasEstimate,
        priceImpact: response.priceImpact,
        routeCount: routes.length,
      });

      res.json(response);
    } catch (error) {
      logger.error('Quote generation failed:', {
        error: error.message,
        quoteRequest,
      });

      res.status(500).json({
        error: 'Quote generation failed',
        message: error.message,
      });
    }
  });
}
