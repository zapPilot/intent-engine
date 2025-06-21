import { logger } from '../../utils/logger';
import { QuoteRequest, RouteInfo } from '../../types';
import { config } from '../../config';
import axios, { AxiosInstance } from 'axios';

export interface ZeroXQuoteParams {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  slippageBps: number; // in basis points (100 = 1%)
  taker: string;
}

export interface ZeroXQuoteResponse {
  buyAmount: string;
  sellAmount: string;
  allowanceTarget: string;
  to: string;
  data: string;
  value: string;
  gasPrice: string;
  gas: string;
  estimatedGas: string;
  protocolFee: string;
  minimumProtocolFee: string;
  buyTokenToEthRate: string;
  sellTokenToEthRate: string;
  estimatedPriceImpact: string;
  sources: Array<{
    name: string;
    proportion: string;
  }>;
  transaction: {
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
  };
}

export interface ZeroXTransactionData {
  to: string;
  data: string;
  value: string;
  gasPrice: string;
  gasLimit: string;
}

export class ZeroXProvider {
  private readonly logger = logger.child({ service: 'ZeroXProvider' });
  private readonly client: AxiosInstance;
  private readonly baseUrl = 'https://api.0x.org';
  
  // Supported chain IDs for 0x
  private readonly supportedChains = new Set([
    1,     // Ethereum
    10,    // Optimism
    56,    // BSC
    137,   // Polygon
    42161, // Arbitrum
    43114, // Avalanche
    8453,  // Base
  ]);

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        '0x-api-key': config.apis.zeroxApiKey || '',
        '0x-version': 'v2',
        'Content-Type': 'application/json',
        'User-Agent': 'All-Weather-Protocol/1.0.0',
      },
    });
  }

  /**
   * Check if chain is supported by 0x
   */
  isChainSupported(chainId: number): boolean {
    return this.supportedChains.has(chainId);
  }

  /**
   * Get quote from 0x
   */
  async getQuote(params: ZeroXQuoteParams): Promise<RouteInfo> {
    this.logger.info('Getting 0x quote', {
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmount: params.sellAmount,
      chainId: params.chainId,
    });

    try {
      const response = await this.client.get<ZeroXQuoteResponse>('/swap/allowance-holder/quote', {
        params: {
          chainId: params.chainId,
          sellToken: params.sellToken,
          buyToken: params.buyToken,
          sellAmount: params.sellAmount,
          slippageBps: params.slippageBps,
          taker: params.taker,
        },
      });

      const data = response.data;
      
      return {
        provider: '0x',
        route: this.extractRouteFromSources(data.sources),
        amountIn: data.sellAmount,
        amountOut: data.buyAmount,
        gasEstimate: data.estimatedGas,
        priceImpact: data.estimatedPriceImpact || '0',
        metadata: {
          protocolFee: data.protocolFee,
          minimumProtocolFee: data.minimumProtocolFee,
          allowanceTarget: data.allowanceTarget,
          buyTokenToEthRate: data.buyTokenToEthRate,
          sellTokenToEthRate: data.sellTokenToEthRate,
          sources: data.sources,
        },
      };
    } catch (error) {
      this.logger.error('0x quote failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        params,
      });
      throw new Error(`0x quote failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get swap transaction data from 0x
   */
  async getSwapTransaction(params: ZeroXQuoteParams): Promise<ZeroXTransactionData> {
    this.logger.info('Getting 0x swap transaction', {
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmount: params.sellAmount,
      chainId: params.chainId,
    });

    try {
      const response = await this.client.get<ZeroXQuoteResponse>('/swap/allowance-holder/quote', {
        params: {
          chainId: params.chainId,
          sellToken: params.sellToken,
          buyToken: params.buyToken,
          sellAmount: params.sellAmount,
          slippageBps: params.slippageBps,
          taker: params.taker,
        },
      });

      const data = response.data;
      
      return {
        to: data.transaction.to,
        data: data.transaction.data,
        value: data.transaction.value,
        gasPrice: data.transaction.gasPrice,
        gasLimit: data.transaction.gas,
      };
    } catch (error) {
      this.logger.error('0x transaction failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        params,
      });
      throw new Error(`0x transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get quotes for QuoteRequest format
   */
  async getQuotes(request: QuoteRequest): Promise<RouteInfo[]> {
    if (!this.isChainSupported(request.chainId)) {
      this.logger.warn('Chain not supported by 0x', { chainId: request.chainId });
      return [];
    }

    try {
      const params: ZeroXQuoteParams = {
        chainId: request.chainId,
        sellToken: request.fromToken,
        buyToken: request.toToken,
        sellAmount: request.amount,
        slippageBps: 100, // 1% default slippage in basis points
        taker: '0x0000000000000000000000000000000000000000', // Placeholder for quote
      };

      const quote = await this.getQuote(params);
      return [quote];
    } catch (error) {
      this.logger.error('Failed to get 0x quotes', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request,
      });
      return [];
    }
  }

  /**
   * Get allowance target (spender address) for token approvals
   */
  async getAllowanceTarget(chainId: number): Promise<string> {
    try {
      // Get a sample quote to extract allowance target
      const response = await this.client.get('/swap/allowance-holder/quote', {
        params: {
          chainId,
          sellToken: 'ETH',
          buyToken: '0xA0b86a33E6417C83b20B44eb26a3f1b1B3b02b7B', // USDC placeholder
          sellAmount: '1000000000000000000', // 1 ETH
          taker: '0x0000000000000000000000000000000000000000',
        },
      });

      return response.data.allowanceTarget;
    } catch (error) {
      this.logger.error('Failed to get 0x allowance target', {
        error: error instanceof Error ? error.message : 'Unknown error',
        chainId,
      });
      // Fallback to a known address (this should be updated based on 0x documentation)
      return '0x0000000000000000000000000000000000000000';
    }
  }

  /**
   * Health check for 0x API
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple health check - try to get supported sources
      const response = await this.client.get('/swap/sources', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      this.logger.error('0x health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get gas price from 0x
   */
  async getGasPrice(chainId: number): Promise<string> {
    try {
      const response = await this.client.get('/swap/gas-price', {
        params: { chainId },
      });
      return response.data.gasPrice || '20000000000'; // 20 Gwei fallback
    } catch (error) {
      this.logger.error('Failed to get 0x gas price', {
        error: error instanceof Error ? error.message : 'Unknown error',
        chainId,
      });
      return '20000000000'; // 20 Gwei fallback
    }
  }

  /**
   * Get supported sources/DEXes
   */
  async getSupportedSources(): Promise<string[]> {
    try {
      const response = await this.client.get('/swap/sources');
      const sources = response.data.sources || [];
      return sources.map((source: any) => source.name);
    } catch (error) {
      this.logger.error('Failed to get 0x supported sources', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Extract route information from sources
   */
  private extractRouteFromSources(sources: Array<{ name: string; proportion: string }>): string[] {
    // Return the top sources that contribute to the route
    const significantSources = sources
      .filter(source => parseFloat(source.proportion) > 0.01) // >1% contribution
      .map(source => source.name);
    
    return significantSources.length > 0 ? significantSources : ['0x'];
  }
}

export const zeroXProvider = new ZeroXProvider();