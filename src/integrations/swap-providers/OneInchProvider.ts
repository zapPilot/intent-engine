import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger';
import { RouteInfo, QuoteRequest } from '../../types';
import { config } from '../../config';

export interface OneInchQuoteParams {
  src: string;
  dst: string;
  amount: string;
  fee?: number;
  gasPrice?: string;
  protocols?: string;
  connectorTokens?: string;
  gasLimit?: number;
  mainRouteParts?: number;
  parts?: number;
}

export interface OneInchSwapParams extends OneInchQuoteParams {
  from: string;
  slippage: number;
  destReceiver?: string;
  referrer?: string;
  allowPartialFill?: boolean;
  disableEstimate?: boolean;
}

export interface OneInchQuoteResponse {
  toAmount: string;
  fromAmount: string;
  protocols: Array<Array<{
    name: string;
    part: number;
    fromTokenAddress: string;
    toTokenAddress: string;
  }>>;
  estimatedGas: number;
}

export interface OneInchSwapResponse {
  toAmount: string;
  fromAmount: string;
  tx: {
    to: string;
    data: string;
    value: string;
    gas: number;
    gasPrice: string;
  };
}

export class OneInchProvider {
  private readonly client: AxiosInstance;
  private readonly logger = logger.child({ service: 'OneInchProvider' });
  private readonly baseUrl = 'https://api.1inch.dev';
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.apis.oneInchApiKey || '';
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug('1inch API request', {
          method: config.method,
          url: config.url,
          params: config.params
        });
        return config;
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        this.logger.debug('1inch API response', {
          status: response.status,
          url: response.config.url
        });
        return response;
      },
      (error) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('1inch API error', {
          status: error.response?.status,
          message: errorMessage,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get quote for token swap
   */
  async getQuote(params: OneInchQuoteParams, chainId: number): Promise<RouteInfo> {
    try {
      const response = await this.client.get<OneInchQuoteResponse>(
        `/swap/v6.0/${chainId}/quote`,
        { params }
      );

      const { data } = response;
      
      return {
        provider: '1inch',
        route: this.extractRouteFromProtocols(data.protocols),
        amountIn: data.fromAmount,
        amountOut: data.toAmount,
        gasEstimate: data.estimatedGas.toString(),
        priceImpact: this.calculatePriceImpact(data.fromAmount, data.toAmount, params.src, params.dst)
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to get 1inch quote', {
        error: errorMessage,
        params,
        chainId
      });
      throw new Error(`1inch quote failed: ${errorMessage}`);
    }
  }

  /**
   * Get swap transaction data
   */
  async getSwapTransaction(params: OneInchSwapParams, chainId: number): Promise<{
    transaction: {
      to: string;
      data: string;
      value: string;
      gasLimit: string;
      gasPrice: string;
    };
    route: RouteInfo;
  }> {
    try {
      const response = await this.client.get<OneInchSwapResponse>(
        `/swap/v6.0/${chainId}/swap`,
        { params }
      );

      const { data } = response;
      
      const route: RouteInfo = {
        provider: '1inch',
        route: [params.src, params.dst], // Simplified route representation
        amountIn: data.fromAmount,
        amountOut: data.toAmount,
        gasEstimate: data.tx.gas.toString(),
        priceImpact: this.calculatePriceImpact(data.fromAmount, data.toAmount, params.src, params.dst)
      };

      return {
        transaction: {
          to: data.tx.to,
          data: data.tx.data,
          value: data.tx.value,
          gasLimit: data.tx.gas.toString(),
          gasPrice: data.tx.gasPrice
        },
        route
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to get 1inch swap transaction', {
        error: errorMessage,
        params,
        chainId
      });
      throw new Error(`1inch swap transaction failed: ${errorMessage}`);
    }
  }

  /**
   * Get multiple quotes for comparison
   */
  async getQuotes(request: QuoteRequest): Promise<RouteInfo[]> {
    const params: OneInchQuoteParams = {
      src: request.fromToken,
      dst: request.toToken,
      amount: request.amount
    };

    try {
      // Get primary quote
      const primaryQuote = await this.getQuote(params, request.chainId);
      
      // For now, return single quote - in future could get multiple quotes with different parameters
      return [primaryQuote];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn('Failed to get 1inch quotes', {
        error: errorMessage,
        request
      });
      return [];
    }
  }

  /**
   * Check if 1inch supports the given chain
   */
  isChainSupported(chainId: number): boolean {
    const supportedChains = [
      1,    // Ethereum
      10,   // Optimism
      56,   // BSC
      100,  // Gnosis
      137,  // Polygon
      250,  // Fantom
      1101, // Polygon zkEVM
      8453, // Base
      42161,// Arbitrum
      43114,// Avalanche
      59144,// Linea
      324,  // zkSync Era
      1313161554, // Aurora
    ];
    
    return supportedChains.includes(chainId);
  }

  /**
   * Get supported tokens for a chain
   */
  async getSupportedTokens(chainId: number): Promise<Array<{
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
  }>> {
    try {
      const response = await this.client.get(`/swap/v6.0/${chainId}/tokens`);
      return Object.values(response.data.tokens || {});
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to get supported tokens', {
        error: errorMessage,
        chainId
      });
      return [];
    }
  }

  /**
   * Get current gas price for chain
   */
  async getGasPrice(_chainId: number): Promise<string> {
    // 1inch doesn't provide gas price endpoint, so we'll use a default calculation
    // In production, this should integrate with a gas oracle
    return '20000000000'; // 20 Gwei default
  }

  /**
   * Check health of 1inch API
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to get tokens for Ethereum mainnet as health check
      await this.client.get('/swap/v6.0/1/tokens', { timeout: 5000 });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('1inch API health check failed', {
        error: errorMessage
      });
      return false;
    }
  }

  /**
   * Extract route information from 1inch protocols response
   */
  private extractRouteFromProtocols(protocols: OneInchQuoteResponse['protocols']): string[] {
    if (!protocols || protocols.length === 0) {
      return [];
    }

    // Extract unique token addresses from the protocol route
    const tokens = new Set<string>();
    
    protocols.forEach(protocolGroup => {
      protocolGroup.forEach(protocol => {
        tokens.add(protocol.fromTokenAddress);
        tokens.add(protocol.toTokenAddress);
      });
    });

    return Array.from(tokens);
  }

  /**
   * Calculate price impact (simplified calculation)
   */
  private calculatePriceImpact(
    _fromAmount: string,
    _toAmount: string,
    _fromToken: string,
    _toToken: string
  ): string {
    // This is a placeholder implementation
    // Real price impact calculation would require:
    // 1. Current market rates for both tokens
    // 2. Pool liquidity information
    // 3. Comparison with expected rate without slippage
    
    // For now, assume minimal price impact for demonstration
    return '0.1'; // 0.1% price impact
  }


  /**
   * Get spender address for token approvals
   */
  async getSpenderAddress(chainId: number): Promise<string> {
    try {
      const response = await this.client.get(`/swap/v6.0/${chainId}/approve/spender`);
      return response.data.address;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to get spender address', {
        error: errorMessage,
        chainId
      });
      // Fallback to known 1inch router address for Ethereum
      return '0x111111125421ca6dc452d289314280a0f8842a65';
    }
  }

  /**
   * Check if token approval is needed
   */
  async checkApproval(
    tokenAddress: string,
    walletAddress: string,
    amount: string,
    chainId: number
  ): Promise<{
    isApprovalNeeded: boolean;
    currentAllowance: string;
    spenderAddress: string;
  }> {
    try {
      const spenderAddress = await this.getSpenderAddress(chainId);
      
      const response = await this.client.get(
        `/swap/v6.0/${chainId}/approve/allowance`,
        {
          params: {
            tokenAddress,
            walletAddress
          }
        }
      );

      const currentAllowance = response.data.allowance || '0';
      const isApprovalNeeded = BigInt(currentAllowance) < BigInt(amount);

      return {
        isApprovalNeeded,
        currentAllowance,
        spenderAddress
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to check approval', {
        error: errorMessage,
        tokenAddress,
        walletAddress,
        chainId
      });
      
      // Assume approval is needed if we can't check
      return {
        isApprovalNeeded: true,
        currentAllowance: '0',
        spenderAddress: await this.getSpenderAddress(chainId)
      };
    }
  }
}

export const oneInchProvider = new OneInchProvider();