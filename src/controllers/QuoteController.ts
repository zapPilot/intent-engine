import { Request, Response } from 'express';
import { QuoteRequest, QuoteResponse, FeeBreakdown, RouteInfo } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { oneInchProvider } from '../integrations/swap-providers/OneInchProvider';
import { paraswapProvider } from '../integrations/swap-providers/ParaswapProvider';
import { zeroXProvider } from '../integrations/swap-providers/ZeroXProvider';
import { gasOptimizer } from '../utils/GasOptimizer';
import { enhancedSwapService, EnhancedSwapRequest } from '../services/EnhancedSwapService';

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

  /**
   * Enhanced swap endpoint that matches rebalance_backend get_the_best_swap_data functionality
   * Endpoint: GET /api/v1/swap/enhanced
   */
  public getEnhancedSwapData = asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();

    // Extract query parameters (matching rebalance_backend interface)
    const {
      chainId,
      fromTokenAddress,
      fromTokenDecimals,
      toTokenAddress,
      toTokenDecimals,
      amount,
      fromAddress,
      slippage,
      provider,
      ethPrice,
      toTokenPrice,
    } = req.query;

    logger.info('Enhanced swap data request', {
      chainId,
      fromTokenAddress,
      toTokenAddress,
      amount,
      provider,
      slippage,
    });

    try {
      // Validate required parameters
      if (!chainId || !fromTokenAddress || !toTokenAddress || !amount || !fromAddress) {
        return res.status(400).json({
          error: 'Missing required parameters',
          required: ['chainId', 'fromTokenAddress', 'toTokenAddress', 'amount', 'fromAddress'],
          provided: { chainId, fromTokenAddress, toTokenAddress, amount, fromAddress },
        });
      }

      // Parse and validate numeric parameters with defaults
      const parsedFromTokenDecimals = fromTokenDecimals
        ? parseInt(fromTokenDecimals as string)
        : 18;
      const parsedToTokenDecimals = toTokenDecimals ? parseInt(toTokenDecimals as string) : 18;
      const parsedSlippage = slippage ? parseFloat(slippage as string) : 1; // 1% default
      const parsedEthPrice = ethPrice ? parseFloat(ethPrice as string) : 2000; // Default ETH price
      const parsedToTokenPrice = toTokenPrice ? parseFloat(toTokenPrice as string) : 1; // Default token price

      // Validate provider
      const validProviders: Array<'1inch' | 'paraswap' | '0x'> = ['1inch', 'paraswap', '0x'];
      const selectedProvider = provider as string;

      if (provider && !validProviders.includes(selectedProvider as '1inch' | 'paraswap' | '0x')) {
        return res.status(400).json({
          error: 'Invalid provider',
          validProviders,
          provided: selectedProvider,
        });
      }

      const swapRequest: EnhancedSwapRequest = {
        chainId: chainId as string,
        fromTokenAddress: fromTokenAddress as string,
        fromTokenDecimals: parsedFromTokenDecimals,
        toTokenAddress: toTokenAddress as string,
        toTokenDecimals: parsedToTokenDecimals,
        amount: amount as string,
        fromAddress: fromAddress as string,
        slippage: parsedSlippage,
        provider: (selectedProvider || '1inch') as '1inch' | 'paraswap' | '0x',
        ethPrice: parsedEthPrice,
        toTokenPrice: parsedToTokenPrice,
      };

      let result;

      if (provider) {
        // Get data from specific provider
        result = await enhancedSwapService.getSwapData(swapRequest);
      } else {
        // Get best data by comparing all providers
        // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
        const { provider, ...requestWithoutProvider } = swapRequest;
        result = await enhancedSwapService.getBestSwapData(requestWithoutProvider);
      }

      const responseTime = Date.now() - startTime;

      logger.info('Enhanced swap data response', {
        provider: result.provider,
        toAmount: result.toAmount,
        gasCostUSD: result.gasCostUSD,
        toUsd: result.toUsd,
        responseTime: `${responseTime}ms`,
      });

      // Return response in rebalance_backend format
      return res.json({
        ...result,
        metadata: {
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || `req_${Date.now()}`,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const responseTime = Date.now() - startTime;

      logger.error('Enhanced swap data failed', {
        error: errorMessage,
        responseTime: `${responseTime}ms`,
        params: req.query,
      });

      return res.status(500).json({
        error: errorMessage,
        params: req.query,
        metadata: {
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  });
}
