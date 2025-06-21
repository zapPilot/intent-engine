import { logger } from '../../utils/logger';
import { QuoteRequest, RouteInfo } from '../../types';
import axios, { AxiosInstance } from 'axios';

export interface ParaswapQuoteParams {
  srcToken: string;
  srcDecimals: number;
  destToken: string;
  destDecimals: number;
  amount: string;
  side: 'SELL' | 'BUY';
  network: number;
  slippage: number; // in basis points (100 = 1%)
  userAddress: string;
  excludeDEXS?: string;
}

export interface ParaswapQuoteResponse {
  priceRoute: {
    destAmount: string;
    srcAmount: string;
    gasCostUSD: string;
    gasCost: string;
    side: string;
    tokenTransferProxy: string;
    contractAddress: string;
  };
  txParams: {
    to: string;
    data: string;
    value: string;
    gasPrice: string;
    gas: string;
  };
}

export interface ParaswapTransactionData {
  to: string;
  data: string;
  value: string;
  gasPrice: string;
  gasLimit: string;
}

export interface EnhancedParaswapParams {
  chainId: string;
  fromTokenAddress: string;
  fromTokenDecimals: number;
  toTokenAddress: string;
  toTokenDecimals: number;
  amount: string;
  fromAddress: string;
  slippage: number;
  ethPrice: number;
  toTokenPrice: number;
}

export interface EnhancedParaswapResult {
  approve_to: string;
  to: string;
  toAmount: string;
  minToAmount: string;
  data: string;
  gasCostUSD: number;
  gas: string;
  custom_slippage: number;
  toUsd: number;
}

export class ParaswapProvider {
  private readonly logger = logger.child({ service: 'ParaswapProvider' });
  private readonly client: AxiosInstance;
  private readonly baseUrl = 'https://api.paraswap.io';
  
  // Chain ID to Paraswap proxy contract addresses
  private readonly proxyAddresses: Record<number, string> = {
    1: '0x216b4b4ba9f3e719726886d34a177484278bfcae',    // Ethereum
    10: '0x216b4b4ba9f3e719726886d34a177484278bfcae',   // Optimism
    56: '0x216b4b4ba9f3e719726886d34a177484278bfcae',   // BSC
    137: '0x216b4b4ba9f3e719726886d34a177484278bfcae',  // Polygon
    1101: '0x216b4b4ba9f3e719726886d34a177484278bfcae', // Polygon zkEVM
    8453: '0x93aAAe79a53759cD164340E4C8766E4Db5331cD7', // Base
    42161: '0x216B4B4Ba9F3e719726886d34a177484278Bfcae', // Arbitrum
    43114: '0x216b4b4ba9f3e719726886d34a177484278bfcae', // Avalanche
  };

  // Supported chain IDs
  private readonly supportedChains = new Set([1, 10, 56, 137, 1101, 8453, 42161, 43114]);

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'All-Weather-Protocol/1.0.0',
      },
    });
  }

  /**
   * Check if chain is supported by Paraswap
   */
  isChainSupported(chainId: number): boolean {
    return this.supportedChains.has(chainId);
  }

  /**
   * Get quote from Paraswap
   */
  async getQuote(params: ParaswapQuoteParams): Promise<RouteInfo> {
    this.logger.info('Getting Paraswap quote', {
      srcToken: params.srcToken,
      destToken: params.destToken,
      amount: params.amount,
      network: params.network,
    });

    try {
      const response = await this.client.get<ParaswapQuoteResponse>('/swap', {
        params: {
          ...params,
          excludeDEXS: params.excludeDEXS || 'AugustusRFQ', // Exclude RFQ by default
        },
      });

      const data = response.data;
      
      return {
        provider: 'paraswap',
        route: [params.srcToken, params.destToken],
        amountIn: data.priceRoute.srcAmount,
        amountOut: data.priceRoute.destAmount,
        gasEstimate: data.priceRoute.gasCost,
        priceImpact: this.calculatePriceImpact(
          data.priceRoute.srcAmount,
          data.priceRoute.destAmount,
          params.srcToken,
          params.destToken
        ),
        metadata: {
          gasCostUSD: data.priceRoute.gasCostUSD,
          contractAddress: data.priceRoute.contractAddress,
          tokenTransferProxy: data.priceRoute.tokenTransferProxy,
        },
      };
    } catch (error) {
      this.logger.error('Paraswap quote failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        params,
      });
      throw new Error(`Paraswap quote failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get swap transaction data from Paraswap
   */
  async getSwapTransaction(params: ParaswapQuoteParams): Promise<ParaswapTransactionData> {
    this.logger.info('Getting Paraswap swap transaction', {
      srcToken: params.srcToken,
      destToken: params.destToken,
      amount: params.amount,
      network: params.network,
    });

    try {
      const response = await this.client.get<ParaswapQuoteResponse>('/swap', {
        params: {
          ...params,
          excludeDEXS: params.excludeDEXS || 'AugustusRFQ',
        },
      });

      const data = response.data;
      
      return {
        to: data.txParams.to,
        data: data.txParams.data,
        value: data.txParams.value,
        gasPrice: data.txParams.gasPrice,
        gasLimit: data.txParams.gas,
      };
    } catch (error) {
      this.logger.error('Paraswap transaction failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        params,
      });
      throw new Error(`Paraswap transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get quotes for QuoteRequest format
   */
  async getQuotes(request: QuoteRequest): Promise<RouteInfo[]> {
    if (!this.isChainSupported(request.chainId)) {
      this.logger.warn('Chain not supported by Paraswap', { chainId: request.chainId });
      return [];
    }

    try {
      const params: ParaswapQuoteParams = {
        srcToken: request.fromToken,
        srcDecimals: 18, // Default, should be provided in request
        destToken: request.toToken,
        destDecimals: 18, // Default, should be provided in request
        amount: request.amount,
        side: 'SELL',
        network: request.chainId,
        slippage: 100, // 1% default slippage in basis points
        userAddress: '0x0000000000000000000000000000000000000000', // Placeholder for quote
        excludeDEXS: 'AugustusRFQ',
      };

      const quote = await this.getQuote(params);
      return [quote];
    } catch (error) {
      this.logger.error('Failed to get Paraswap quotes', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request,
      });
      return [];
    }
  }

  /**
   * Get spender address for token approvals
   */
  getSpenderAddress(chainId: number): string {
    const spender = this.proxyAddresses[chainId];
    if (!spender) {
      throw new Error(`Paraswap proxy not available for chain ${chainId}`);
    }
    return spender;
  }

  /**
   * Health check for Paraswap API
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple health check - try to get supported tokens
      const response = await this.client.get('/tokens/1', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      this.logger.error('Paraswap health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get supported tokens for a chain
   */
  async getSupportedTokens(chainId: number): Promise<string[]> {
    if (!this.isChainSupported(chainId)) {
      return [];
    }

    try {
      const response = await this.client.get(`/tokens/${chainId}`);
      const tokens = response.data.tokens || [];
      return tokens.map((token: any) => token.address);
    } catch (error) {
      this.logger.error('Failed to get Paraswap supported tokens', {
        error: error instanceof Error ? error.message : 'Unknown error',
        chainId,
      });
      return [];
    }
  }

  /**
   * Calculate price impact (placeholder implementation)
   */
  private calculatePriceImpact(
    _amountIn: string,
    _amountOut: string,
    _tokenIn: string,
    _tokenOut: string
  ): string {
    // Simplified price impact calculation
    // In reality, this would require token prices and more complex calculation
    return '0.1'; // Default 0.1% price impact
  }

  /**
   * Enhanced swap method that matches rebalance_backend functionality
   * Includes gas cost calculations, slippage handling, and USD value calculations
   */
  async getEnhancedSwapData(params: EnhancedParaswapParams): Promise<EnhancedParaswapResult> {
    try {
      // Convert slippage to basis points (from rebalance_backend)
      const customSlippage = Math.floor(params.slippage * 100);
      const chainIdNumber = parseInt(params.chainId);

      if (!this.isChainSupported(chainIdNumber)) {
        throw new Error(`Paraswap does not support chain ID ${params.chainId}`);
      }

      const requestParams = {
        srcToken: params.fromTokenAddress,
        srcDecimals: params.fromTokenDecimals,
        destToken: params.toTokenAddress,
        destDecimals: params.toTokenDecimals,
        amount: params.amount,
        side: 'SELL' as const,
        network: params.chainId,
        slippage: customSlippage,
        userAddress: params.fromAddress,
        excludeDEXS: 'AugustusRFQ',
      };

      this.logger.info('Making enhanced Paraswap swap request', {
        chainId: params.chainId,
        customSlippage,
        params: requestParams
      });

      const response = await this.client.get('/swap', { 
        params: requestParams,
        timeout: 30000
      });

      const resp = response.data;
      
      // Extract gas cost USD directly from response (from rebalance_backend logic)
      const gasCostUSD = parseFloat(resp.priceRoute.gasCostUSD);

      // Calculate minimum to amount with slippage
      const minToAmount = this.getMinToAmount(resp.priceRoute.destAmount, params.slippage);

      // Calculate USD value of output minus gas costs
      const toUsd = (
        parseInt(resp.priceRoute.destAmount) * params.toTokenPrice / Math.pow(10, params.toTokenDecimals) - gasCostUSD
      );

      const proxyAddress = this.proxyAddresses[chainIdNumber];
      if (!proxyAddress) {
        throw new Error(`Paraswap proxy address not found for chain ${chainIdNumber}`);
      }

      return {
        approve_to: proxyAddress,
        to: resp.txParams.to,
        toAmount: resp.priceRoute.destAmount,
        minToAmount: minToAmount,
        data: resp.txParams.data,
        gasCostUSD: gasCostUSD,
        gas: resp.priceRoute.gasCost,
        custom_slippage: customSlippage,
        toUsd: toUsd
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Enhanced Paraswap swap failed', {
        error: errorMessage,
        params
      });
      throw new Error(`Paraswap enhanced swap failed: ${errorMessage}`);
    }
  }

  /**
   * Calculate minimum to amount with slippage (from rebalance_backend)
   */
  private getMinToAmount(toAmount: string, slippage: number): string {
    const amount = parseInt(toAmount);
    const minAmount = Math.floor(amount * (100 - slippage) / 100);
    return minAmount.toString();
  }
}

export const paraswapProvider = new ParaswapProvider();