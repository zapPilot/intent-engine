import { logger } from '../utils/logger';
import { monitoring } from '../utils/monitoring';
import { errorHandler, withRetry, CircuitBreaker } from '../utils/errorUtils';
import {
  oneInchProvider,
  EnhancedOneInchSwapParams,
} from '../integrations/swap-providers/OneInchProvider';
import {
  paraswapProvider,
  EnhancedParaswapParams,
} from '../integrations/swap-providers/ParaswapProvider';
import { zeroXProvider, EnhancedZeroXParams } from '../integrations/swap-providers/ZeroXProvider';

export interface EnhancedSwapRequest {
  chainId: string;
  fromTokenAddress: string;
  fromTokenDecimals: number;
  toTokenAddress: string;
  toTokenDecimals: number;
  amount: string;
  fromAddress: string;
  slippage: number;
  provider: '1inch' | 'paraswap' | '0x';
  ethPrice: number;
  toTokenPrice: number;
}

export interface UnifiedSwapResult {
  approve_to: string;
  to: string;
  toAmount: string;
  minToAmount: string;
  data: string;
  gasCostUSD: number;
  gas: number | string;
  custom_slippage: number;
  toUsd: number;
  provider: string;
}

/**
 * Enhanced Swap Service that replicates rebalance_backend functionality
 * Provides unified interface for all DEX aggregators with enhanced features
 */
export class EnhancedSwapService {
  private readonly logger = logger.child({ service: 'EnhancedSwapService' });
  
  // Circuit breakers for each provider
  private readonly circuitBreakers = {
    '1inch': new CircuitBreaker(3, 30000),
    'paraswap': new CircuitBreaker(3, 30000),
    '0x': new CircuitBreaker(3, 30000),
  };

  /**
   * Get swap data from specified provider (matches rebalance_backend get_the_best_swap_data)
   */
  async getSwapData(request: EnhancedSwapRequest): Promise<UnifiedSwapResult> {
    return monitoring.timeOperation(
      'enhanced_swap',
      request.provider,
      async () => {
        this.logger.info('Getting enhanced swap data', {
          provider: request.provider,
          chainId: request.chainId,
          fromToken: request.fromTokenAddress,
          toToken: request.toTokenAddress,
          amount: request.amount,
        });

        try {
          // Validate the swap request
          this.validateSwapRequest(request);

          let result: UnifiedSwapResult;

          switch (request.provider) {
            case '1inch':
              result = await this.get1inchSwapData(request);
              break;

            case 'paraswap':
              result = await this.getParaswapSwapData(request);
              break;

            case '0x':
              result = await this.get0xSwapData(request);
              break;

            default:
              throw errorHandler.handleValidationError(
                `Provider ${request.provider} is not supported`,
                'provider'
              );
          }

          this.logger.info('Enhanced swap data retrieved successfully', {
            provider: request.provider,
            toAmount: result.toAmount,
            gasCostUSD: result.gasCostUSD,
            toUsd: result.toUsd,
          });

          return result;
        } catch (error) {
          if (error instanceof Error && error.name === 'IntentEngineError') {
            throw error;
          }
          throw errorHandler.handleInternalError(error, 'getSwapData');
        }
      },
      {
        chainId: request.chainId,
        fromToken: request.fromTokenAddress,
        toToken: request.toTokenAddress,
      }
    );
  }

  /**
   * Get best swap data by comparing all providers
   */
  async getBestSwapData(
    request: Omit<EnhancedSwapRequest, 'provider'>
  ): Promise<UnifiedSwapResult> {
    const providers: Array<'1inch' | 'paraswap' | '0x'> = ['1inch', 'paraswap', '0x'];
    const results: Array<{ provider: string; result: UnifiedSwapResult; error?: string }> = [];

    // Try all providers in parallel
    const promises = providers.map(async provider => {
      try {
        const result = await this.getSwapData({ ...request, provider });
        return { provider, result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Provider ${provider} failed`, { error: errorMessage });
        return { provider, result: null as any, error: errorMessage };
      }
    });

    const responses = await Promise.allSettled(promises);

    // Collect successful results
    responses.forEach(response => {
      if (response.status === 'fulfilled' && response.value.result) {
        results.push(response.value);
      }
    });

    if (results.length === 0) {
      throw new Error('All providers failed to provide swap data');
    }

    // Find the best result (highest USD output)
    const bestResult = results.reduce((best, current) => {
      return current.result.toUsd > best.result.toUsd ? current : best;
    });

    this.logger.info('Best swap provider selected', {
      bestProvider: bestResult.provider,
      bestUsdOutput: bestResult.result.toUsd,
      totalProviders: results.length,
    });

    return bestResult.result;
  }

  /**
   * 1inch provider integration with circuit breaker and retry logic
   */
  private async get1inchSwapData(request: EnhancedSwapRequest): Promise<UnifiedSwapResult> {
    const params: EnhancedOneInchSwapParams = {
      chainId: request.chainId,
      fromTokenAddress: request.fromTokenAddress,
      fromTokenDecimals: request.fromTokenDecimals,
      toTokenAddress: request.toTokenAddress,
      toTokenDecimals: request.toTokenDecimals,
      amount: request.amount,
      fromAddress: request.fromAddress,
      slippage: request.slippage,
      ethPrice: request.ethPrice,
      toTokenPrice: request.toTokenPrice,
    };

    const result = await this.circuitBreakers['1inch'].execute(
      () => withRetry(
        () => oneInchProvider.getEnhancedSwapData(params),
        {
          maxRetries: 2,
          operation: 'getEnhancedSwapData',
          provider: '1inch',
        }
      )
    );

    return {
      ...result,
      provider: '1inch',
    };
  }

  /**
   * Paraswap provider integration with circuit breaker and retry logic
   */
  private async getParaswapSwapData(request: EnhancedSwapRequest): Promise<UnifiedSwapResult> {
    const params: EnhancedParaswapParams = {
      chainId: request.chainId,
      fromTokenAddress: request.fromTokenAddress,
      fromTokenDecimals: request.fromTokenDecimals,
      toTokenAddress: request.toTokenAddress,
      toTokenDecimals: request.toTokenDecimals,
      amount: request.amount,
      fromAddress: request.fromAddress,
      slippage: request.slippage,
      ethPrice: request.ethPrice,
      toTokenPrice: request.toTokenPrice,
    };

    const result = await this.circuitBreakers['paraswap'].execute(
      () => withRetry(
        () => paraswapProvider.getEnhancedSwapData(params),
        {
          maxRetries: 2,
          operation: 'getEnhancedSwapData',
          provider: 'paraswap',
        }
      )
    );

    return {
      ...result,
      gas: typeof result.gas === 'string' ? parseInt(result.gas) : result.gas,
      provider: 'paraswap',
    };
  }

  /**
   * 0x provider integration with circuit breaker and retry logic
   */
  private async get0xSwapData(request: EnhancedSwapRequest): Promise<UnifiedSwapResult> {
    const params: EnhancedZeroXParams = {
      chainId: request.chainId,
      fromTokenAddress: request.fromTokenAddress,
      fromTokenDecimals: request.fromTokenDecimals,
      toTokenAddress: request.toTokenAddress,
      toTokenDecimals: request.toTokenDecimals,
      amount: request.amount,
      fromAddress: request.fromAddress,
      slippage: request.slippage,
      ethPrice: request.ethPrice,
      toTokenPrice: request.toTokenPrice,
    };

    const result = await this.circuitBreakers['0x'].execute(
      () => withRetry(
        () => zeroXProvider.getEnhancedSwapData(params),
        {
          maxRetries: 2,
          operation: 'getEnhancedSwapData',
          provider: '0x',
        }
      )
    );

    return {
      ...result,
      provider: '0x',
    };
  }

  /**
   * Validate swap request parameters with enhanced error handling
   */
  private validateSwapRequest(request: EnhancedSwapRequest): void {
    if (!request.chainId) {
      throw errorHandler.handleValidationError('Chain ID is required', 'chainId');
    }

    if (!request.fromTokenAddress || !request.toTokenAddress) {
      throw errorHandler.handleValidationError('Token addresses are required', 'tokenAddresses');
    }

    if (request.fromTokenAddress.toLowerCase() === request.toTokenAddress.toLowerCase()) {
      throw errorHandler.handleValidationError('Cannot swap token to itself', 'tokenAddresses');
    }

    if (request.fromTokenDecimals < 0 || request.toTokenDecimals < 0) {
      throw errorHandler.handleValidationError('Token decimals must be non-negative', 'tokenDecimals');
    }

    if (request.slippage < 0 || request.slippage > 100) {
      throw errorHandler.handleValidationError('Slippage must be between 0 and 100', 'slippage');
    }

    if (request.ethPrice <= 0 || request.toTokenPrice <= 0) {
      throw errorHandler.handleValidationError('Token prices must be positive', 'tokenPrices');
    }

    if (!request.amount || parseFloat(request.amount) <= 0) {
      throw errorHandler.handleValidationError('Amount must be positive', 'amount');
    }

    if (
      !request.fromAddress ||
      request.fromAddress === '0x0000000000000000000000000000000000000000'
    ) {
      throw errorHandler.handleValidationError('Valid from address is required', 'fromAddress');
    }
  }
}

export const enhancedSwapService = new EnhancedSwapService();
