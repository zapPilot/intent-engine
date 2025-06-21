import { Request, Response } from 'express';
import { QuoteRequest, QuoteResponse, FeeBreakdown, RouteInfo } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { oneInchProvider } from '../integrations/swap-providers/OneInchProvider';
import { paraswapProvider } from '../integrations/swap-providers/ParaswapProvider';
import { zeroXProvider } from '../integrations/swap-providers/ZeroXProvider';
import { gasOptimizer } from '../utils/GasOptimizer';

export class QuoteController {
  private readonly aggregators = [
    { name: '1inch', provider: oneInchProvider },
    { name: 'paraswap', provider: paraswapProvider },
    { name: '0x', provider: zeroXProvider },
  ];

  public getQuote = asyncHandler(async (req: Request, res: Response) => {
    const quoteRequest: QuoteRequest = {
      action: req.query['action'] as string,
      amount: req.query['amount'] as string,
      fromToken: req.query['fromToken'] as string,
      toToken: req.query['toToken'] as string,
      chainId: parseInt(req.query['chainId'] as string),
    };

    logger.info('Getting comprehensive quote from all DEX aggregators:', {
      action: quoteRequest.action,
      fromToken: quoteRequest.fromToken,
      toToken: quoteRequest.toToken,
      chainId: quoteRequest.chainId,
      amount: quoteRequest.amount,
    });

    try {
      // Only process swap requests
      if (quoteRequest.action !== 'swap') {
        return res.status(400).json({
          error: 'Only swap action is supported for quotes',
          supportedActions: ['swap'],
        });
      }

      const startTime = Date.now();

      // Get quotes from all supported aggregators in parallel
      const quotePromises = this.aggregators.map(async ({ name, provider }) => {
        try {
          if (!provider.isChainSupported(quoteRequest.chainId)) {
            logger.debug(`${name} does not support chain ${quoteRequest.chainId}`);
            return { name, routes: [], error: 'Chain not supported' };
          }

          const routes = await provider.getQuotes(quoteRequest);
          logger.debug(`${name} returned ${routes.length} routes`);
          return { name, routes, error: null };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.warn(`${name} quote failed:`, { error: errorMessage });
          return { name, routes: [], error: errorMessage };
        }
      });

      // Wait for all quotes to complete
      const results = await Promise.all(quotePromises);
      const fetchTime = Date.now() - startTime;

      // Aggregate all routes and organize by provider
      const allRoutes: RouteInfo[] = [];
      const aggregatorResults: Record<string, RouteInfo | null> = {};
      const failedAggregators: string[] = [];

      results.forEach(({ name, routes, error }) => {
        if (error) {
          failedAggregators.push(name);
          aggregatorResults[name] = null;
        } else if (routes.length > 0) {
          allRoutes.push(...routes);
          aggregatorResults[name] = routes[0] || null; // Best route from this aggregator
        } else {
          aggregatorResults[name] = null;
        }
      });

      // Sort routes by output amount (best first)
      allRoutes.sort((a, b) => {
        const aOutput = BigInt(a.amountOut);
        const bOutput = BigInt(b.amountOut);
        return bOutput > aOutput ? 1 : bOutput < aOutput ? -1 : 0;
      });

      let bestRoute: RouteInfo;
      let gasEstimate = '21000';
      let priceImpact = '0';

      if (allRoutes.length > 0) {
        const firstRoute = allRoutes[0];
        if (!firstRoute) {
          throw new Error('No valid routes found');
        }
        bestRoute = firstRoute;
        gasEstimate = bestRoute.gasEstimate;
        priceImpact = bestRoute.priceImpact;

        // Calculate savings vs worst quote
        if (allRoutes.length > 1) {
          const worstRoute = allRoutes[allRoutes.length - 1];
          if (worstRoute) {
            const bestAmount = BigInt(bestRoute.amountOut);
            const worstAmount = BigInt(worstRoute.amountOut);
            const savings = bestAmount - worstAmount;
            const savingsPercent = Number((savings * BigInt(10000)) / worstAmount) / 100;

            bestRoute.metadata = {
              ...bestRoute.metadata,
              savings: savings.toString(),
              savingsPercent: savingsPercent.toFixed(2),
            };
          }
        }
      } else {
        // Fallback route if all aggregators failed
        bestRoute = {
          provider: 'fallback',
          route: [quoteRequest.fromToken, quoteRequest.toToken],
          amountIn: quoteRequest.amount,
          amountOut: quoteRequest.amount,
          gasEstimate: '21000',
          priceImpact: '0.1',
          metadata: {
            warning: 'All DEX aggregators failed, using fallback estimation',
          },
        };
      }

      // Get gas price info for fee calculation
      const networkGasInfo = await gasOptimizer.getNetworkGasInfo(quoteRequest.chainId);
      const gasPriceWei = networkGasInfo.gasPrice;
      const gasCostWei = (BigInt(gasEstimate) * BigInt(gasPriceWei)).toString();
      const gasFeeEth = (Number(gasCostWei) / Math.pow(10, 18)).toFixed(6);

      const fees: FeeBreakdown = {
        protocolFee: '0',
        gasFee: gasFeeEth,
        totalFee: gasFeeEth,
      };

      const response: QuoteResponse = {
        bestRoute,
        alternatives: allRoutes.slice(1), // All routes except the best one
        gasEstimate,
        priceImpact,
        fees,
        metadata: {
          quoteFetchTime: `${fetchTime}ms`,
          failedAggregators,
          totalAggregatorsCalled: this.aggregators.length,
          aggregatorResults,
        },
      };

      logger.info('Comprehensive quote generated:', {
        bestProvider: response.bestRoute.provider,
        gasEstimate: response.gasEstimate,
        priceImpact: response.priceImpact,
        totalRoutes: allRoutes.length,
        fetchTime: `${fetchTime}ms`,
        successfulAggregators: this.aggregators.length - failedAggregators.length,
        failedAggregators,
      });

      return res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Quote generation failed:', {
        error: errorMessage,
        quoteRequest,
      });

      return res.status(500).json({
        error: 'Quote generation failed',
        message: errorMessage,
      });
    }
  });
}
