import { ethers } from 'ethers';
import { logger } from './logger';
import { Transaction } from '../types';

export interface GasEstimation {
  gasLimit: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  estimatedCostWei: string;
  estimatedCostUsd?: string;
}

export interface GasOptimizationOptions {
  strategy: 'speed' | 'cost' | 'balanced';
  maxGasPriceGwei?: number;
  maxPriorityFeeGwei?: number;
  gasLimitMultiplier?: number;
  ethPriceUsd?: number;
}

export interface NetworkGasInfo {
  chainId: number;
  baseFee: string;
  priorityFee: string;
  gasPrice: string;
  fast: GasEstimation;
  standard: GasEstimation;
  safe: GasEstimation;
  supportsEIP1559: boolean;
}

export class GasOptimizer {
  private readonly logger = logger.child({ service: 'GasOptimizer' });
  private readonly gasOracles: Map<number, string> = new Map();
  private readonly gasCache: Map<string, { data: NetworkGasInfo; timestamp: number }> = new Map();
  private readonly cacheTimeout = 30000; // 30 seconds

  constructor() {
    this.setupGasOracles();
  }

  /**
   * Optimize gas settings for a transaction
   */
  async optimizeGas(
    transaction: Transaction,
    options: GasOptimizationOptions
  ): Promise<GasEstimation> {
    const { strategy, maxGasPriceGwei, maxPriorityFeeGwei, gasLimitMultiplier = 1.1 } = options;

    try {
      const networkInfo = await this.getNetworkGasInfo(transaction.chainId);

      let gasEstimation: GasEstimation;

      if (networkInfo.supportsEIP1559) {
        const eip1559Options: { maxPriorityFeeGwei?: number; gasLimitMultiplier: number } = {
          gasLimitMultiplier,
        };
        if (maxPriorityFeeGwei !== undefined) {
          eip1559Options.maxPriorityFeeGwei = maxPriorityFeeGwei;
        }
        gasEstimation = this.optimizeEIP1559Gas(networkInfo, strategy, eip1559Options);
      } else {
        const legacyOptions: { maxGasPriceGwei?: number; gasLimitMultiplier: number } = {
          gasLimitMultiplier,
        };
        if (maxGasPriceGwei !== undefined) {
          legacyOptions.maxGasPriceGwei = maxGasPriceGwei;
        }
        gasEstimation = this.optimizeLegacyGas(networkInfo, strategy, legacyOptions);
      }

      // Apply gas limit from transaction with multiplier
      const originalGasLimit = ethers.BigNumber.from(transaction.gasLimit);
      const optimizedGasLimit = originalGasLimit.mul(Math.floor(gasLimitMultiplier * 100)).div(100);
      gasEstimation.gasLimit = optimizedGasLimit.toString();

      // Recalculate estimated cost with new gas limit
      gasEstimation.estimatedCostWei = this.calculateTransactionCost(gasEstimation);

      if (options.ethPriceUsd) {
        gasEstimation.estimatedCostUsd = this.calculateUsdCost(
          gasEstimation.estimatedCostWei,
          options.ethPriceUsd
        );
      }

      this.logger.info('Gas optimization completed', {
        chainId: transaction.chainId,
        strategy,
        gasLimit: gasEstimation.gasLimit,
        estimatedCost: gasEstimation.estimatedCostWei,
      });

      return gasEstimation;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Gas optimization failed', {
        error: errorMessage,
        chainId: transaction.chainId,
        strategy,
      });

      // Return fallback gas estimation
      return this.getFallbackGasEstimation(transaction, options);
    }
  }

  /**
   * Batch optimize gas for multiple transactions
   */
  async optimizeBatchGas(
    transactions: Transaction[],
    options: GasOptimizationOptions
  ): Promise<GasEstimation[]> {
    const estimations: GasEstimation[] = [];

    for (const transaction of transactions) {
      const estimation = await this.optimizeGas(transaction, options);
      estimations.push(estimation);
    }

    return estimations;
  }

  /**
   * Get current network gas information
   */
  async getNetworkGasInfo(chainId: number): Promise<NetworkGasInfo> {
    const cacheKey = `gas-info-${chainId}`;
    const cached = this.gasCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const gasInfo = await this.fetchNetworkGasInfo(chainId);

      this.gasCache.set(cacheKey, {
        data: gasInfo,
        timestamp: Date.now(),
      });

      return gasInfo;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to fetch network gas info', {
        error: errorMessage,
        chainId,
      });

      // Return cached data if available, even if expired
      if (cached) {
        this.logger.warn('Using expired gas info cache', { chainId });
        return cached.data;
      }

      throw error;
    }
  }

  /**
   * Estimate gas for a specific transaction
   */
  async estimateTransactionGas(
    transaction: Omit<Transaction, 'gasLimit'>,
    rpcUrl?: string
  ): Promise<string> {
    try {
      if (rpcUrl) {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

        const gasEstimate = await provider.estimateGas({
          to: transaction.to,
          data: transaction.data,
          value: transaction.value,
          from: '0x0000000000000000000000000000000000000000', // Use zero address for estimation
        });

        // Add 10% buffer to estimated gas
        return gasEstimate.mul(110).div(100).toString();
      }

      // Fallback gas estimates based on transaction type
      return this.getFallbackGasEstimate(transaction);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Gas estimation failed', {
        error: errorMessage,
        transaction: {
          to: transaction.to,
          dataLength: transaction.data.length,
        },
      });

      return this.getFallbackGasEstimate(transaction);
    }
  }

  /**
   * Calculate total cost for multiple transactions
   */
  calculateBatchCost(estimations: GasEstimation[]): {
    totalCostWei: string;
    totalCostUsd?: string;
    avgGasPrice: string;
  } {
    let totalCostWei = ethers.BigNumber.from('0');
    let totalGasUsed = ethers.BigNumber.from('0');
    let hasUsdPricing = estimations.length > 0; // Only true if we have estimations
    let totalCostUsd = 0;

    for (const estimation of estimations) {
      totalCostWei = totalCostWei.add(estimation.estimatedCostWei);
      totalGasUsed = totalGasUsed.add(estimation.gasLimit);

      if (estimation.estimatedCostUsd) {
        totalCostUsd += parseFloat(estimation.estimatedCostUsd);
      } else {
        hasUsdPricing = false;
      }
    }

    const avgGasPrice = totalGasUsed.gt(0) ? totalCostWei.div(totalGasUsed).toString() : '0';

    const result: {
      totalCostWei: string;
      totalCostUsd?: string;
      avgGasPrice: string;
    } = {
      totalCostWei: totalCostWei.toString(),
      avgGasPrice,
    };
    
    if (hasUsdPricing && estimations.length > 0) {
      result.totalCostUsd = totalCostUsd.toFixed(2);
    }
    
    return result;
  }

  /**
   * Setup gas oracles for different networks
   */
  private setupGasOracles(): void {
    // Gas oracle endpoints for different networks
    this.gasOracles.set(1, 'https://api.etherscan.io/api?module=gastracker&action=gasoracle');
    this.gasOracles.set(137, 'https://api.polygonscan.com/api?module=gastracker&action=gasoracle');
    this.gasOracles.set(42161, 'https://api.arbiscan.io/api?module=gastracker&action=gasoracle');
    this.gasOracles.set(
      10,
      'https://api-optimistic.etherscan.io/api?module=gastracker&action=gasoracle'
    );
    this.gasOracles.set(8453, 'https://api.basescan.org/api?module=gastracker&action=gasoracle');
  }

  /**
   * Fetch network gas information from oracles or RPC
   */
  private async fetchNetworkGasInfo(chainId: number): Promise<NetworkGasInfo> {
    // Check if we have a gas oracle for this network
    const oracleUrl = this.gasOracles.get(chainId);

    if (oracleUrl) {
      try {
        const response = await fetch(oracleUrl);
        const data: any = await response.json();

        if (data.status === '1' && data.result) {
          return this.parseOracleResponse(chainId, data.result);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn('Gas oracle request failed', {
          error: errorMessage,
          chainId,
          oracleUrl,
        });
      }
    }

    // Fallback to default gas info
    return this.getDefaultGasInfo(chainId);
  }

  /**
   * Parse gas oracle response
   */
  private parseOracleResponse(chainId: number, result: any): NetworkGasInfo {
    const supportsEIP1559 = this.chainSupportsEIP1559(chainId);

    const safeGwei = result.SafeGasPrice || '20';
    const standardGwei = result.ProposeGasPrice || '25';
    const fastGwei = result.FastGasPrice || '30';

    return {
      chainId,
      baseFee: ethers.utils.parseUnits(safeGwei, 'gwei').toString(),
      priorityFee: ethers.utils.parseUnits('2', 'gwei').toString(),
      gasPrice: ethers.utils.parseUnits(standardGwei, 'gwei').toString(),
      supportsEIP1559,
      safe: this.createGasEstimation(safeGwei, supportsEIP1559),
      standard: this.createGasEstimation(standardGwei, supportsEIP1559),
      fast: this.createGasEstimation(fastGwei, supportsEIP1559),
    };
  }

  /**
   * Create gas estimation from gwei price
   */
  private createGasEstimation(gasPriceGwei: string, supportsEIP1559: boolean): GasEstimation {
    const gasPrice = ethers.utils.parseUnits(gasPriceGwei, 'gwei').toString();
    const defaultGasLimit = '21000'; // Standard transfer

    if (supportsEIP1559) {
      const priorityFee = ethers.utils.parseUnits('2', 'gwei').toString();

      return {
        gasLimit: defaultGasLimit,
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: priorityFee,
        estimatedCostWei: ethers.BigNumber.from(gasPrice).mul(defaultGasLimit).toString(),
      };
    } else {
      return {
        gasLimit: defaultGasLimit,
        gasPrice,
        estimatedCostWei: ethers.BigNumber.from(gasPrice).mul(defaultGasLimit).toString(),
      };
    }
  }

  /**
   * Optimize EIP-1559 gas settings
   */
  private optimizeEIP1559Gas(
    networkInfo: NetworkGasInfo,
    strategy: 'speed' | 'cost' | 'balanced',
    options: { maxPriorityFeeGwei?: number; gasLimitMultiplier: number }
  ): GasEstimation {
    let targetEstimation: GasEstimation;

    switch (strategy) {
      case 'speed':
        targetEstimation = networkInfo.fast;
        break;
      case 'cost':
        targetEstimation = networkInfo.safe;
        break;
      case 'balanced':
      default:
        targetEstimation = networkInfo.standard;
        break;
    }

    // Apply maximum priority fee limit if specified
    if (options.maxPriorityFeeGwei && targetEstimation.maxPriorityFeePerGas) {
      const maxPriorityFeeWei = ethers.utils.parseUnits(
        options.maxPriorityFeeGwei.toString(),
        'gwei'
      );
      const currentPriorityFee = ethers.BigNumber.from(targetEstimation.maxPriorityFeePerGas);

      if (currentPriorityFee.gt(maxPriorityFeeWei)) {
        targetEstimation.maxPriorityFeePerGas = maxPriorityFeeWei.toString();
      }
    }

    return targetEstimation;
  }

  /**
   * Optimize legacy gas settings
   */
  private optimizeLegacyGas(
    networkInfo: NetworkGasInfo,
    strategy: 'speed' | 'cost' | 'balanced',
    options: { maxGasPriceGwei?: number; gasLimitMultiplier: number }
  ): GasEstimation {
    let targetEstimation: GasEstimation;

    switch (strategy) {
      case 'speed':
        targetEstimation = networkInfo.fast;
        break;
      case 'cost':
        targetEstimation = networkInfo.safe;
        break;
      case 'balanced':
      default:
        targetEstimation = networkInfo.standard;
        break;
    }

    // Apply maximum gas price limit if specified
    if (options.maxGasPriceGwei && targetEstimation.gasPrice) {
      const maxGasPriceWei = ethers.utils.parseUnits(options.maxGasPriceGwei.toString(), 'gwei');
      const currentGasPrice = ethers.BigNumber.from(targetEstimation.gasPrice);

      if (currentGasPrice.gt(maxGasPriceWei)) {
        targetEstimation.gasPrice = maxGasPriceWei.toString();
      }
    }

    return targetEstimation;
  }

  /**
   * Calculate transaction cost in wei
   */
  private calculateTransactionCost(estimation: GasEstimation): string {
    const gasLimit = ethers.BigNumber.from(estimation.gasLimit);

    if (estimation.maxFeePerGas) {
      // EIP-1559 transaction
      return gasLimit.mul(estimation.maxFeePerGas).toString();
    } else if (estimation.gasPrice) {
      // Legacy transaction
      return gasLimit.mul(estimation.gasPrice).toString();
    }

    return '0';
  }

  /**
   * Calculate USD cost
   */
  private calculateUsdCost(costWei: string, ethPriceUsd: number): string {
    const costEth = parseFloat(ethers.utils.formatEther(costWei));
    return (costEth * ethPriceUsd).toFixed(2);
  }

  /**
   * Check if chain supports EIP-1559
   */
  private chainSupportsEIP1559(chainId: number): boolean {
    const eip1559Chains = [1, 3, 4, 5, 42, 137, 42161, 10, 43114, 250, 8453];
    return eip1559Chains.includes(chainId);
  }

  /**
   * Get default gas info for unsupported networks
   */
  private getDefaultGasInfo(chainId: number): NetworkGasInfo {
    const supportsEIP1559 = this.chainSupportsEIP1559(chainId);

    return {
      chainId,
      baseFee: ethers.utils.parseUnits('20', 'gwei').toString(),
      priorityFee: ethers.utils.parseUnits('2', 'gwei').toString(),
      gasPrice: ethers.utils.parseUnits('25', 'gwei').toString(),
      supportsEIP1559,
      safe: this.createGasEstimation('20', supportsEIP1559),
      standard: this.createGasEstimation('25', supportsEIP1559),
      fast: this.createGasEstimation('30', supportsEIP1559),
    };
  }

  /**
   * Get fallback gas estimation when optimization fails
   */
  private getFallbackGasEstimation(
    transaction: Transaction,
    _options: GasOptimizationOptions
  ): GasEstimation {
    const defaultGasPrice = ethers.utils.parseUnits('25', 'gwei').toString();
    const gasLimit = transaction.gasLimit;

    return {
      gasLimit,
      gasPrice: defaultGasPrice,
      estimatedCostWei: ethers.BigNumber.from(defaultGasPrice).mul(gasLimit).toString(),
    };
  }

  /**
   * Get fallback gas estimate based on transaction type
   */
  private getFallbackGasEstimate(transaction: Omit<Transaction, 'gasLimit'>): string {
    // Basic gas estimates based on transaction complexity
    if (transaction.data === '0x' || transaction.data === '') {
      return '21000'; // Simple transfer
    }

    const dataLength = transaction.data.length;
    if (dataLength < 100) {
      return '50000'; // Simple contract call
    } else if (dataLength < 1000) {
      return '150000'; // Complex contract call
    } else {
      return '300000'; // Very complex contract call
    }
  }
}

export const gasOptimizer = new GasOptimizer();
