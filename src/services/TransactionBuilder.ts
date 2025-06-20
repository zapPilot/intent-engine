import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { IntentRequest, Transaction, RouteInfo } from '../types';

export interface TransactionBuilderOptions {
  gasOptimization: 'speed' | 'cost' | 'balanced';
  slippageTolerance: number;
  deadline: number;
}

export interface BuildTransactionParams {
  intent: IntentRequest;
  routes: RouteInfo[];
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export class TransactionBuilder {
  private readonly logger = logger.child({ service: 'TransactionBuilder' });

  /**
   * Builds transactions for a given intent request
   */
  async buildTransactions(params: BuildTransactionParams): Promise<Transaction[]> {
    const { intent, routes } = params;

    this.logger.info('Building transactions for intent', {
      action: intent.action,
      userAddress: intent.userAddress,
      chainId: intent.params.chainId,
      routeCount: routes.length,
    });

    try {
      switch (intent.action) {
        case 'swap':
          return await this.buildSwapTransactions(params);
        case 'zapIn':
          return await this.buildZapInTransactions(params);
        case 'zapOut':
          return await this.buildZapOutTransactions(params);
        case 'rebalance':
          return await this.buildRebalanceTransactions(params);
        case 'bridge':
          return await this.buildBridgeTransactions(params);
        default:
          throw new Error(`Unsupported action: ${intent.action}`);
      }
    } catch (error) {
      this.logger.error('Failed to build transactions', {
        error: error.message,
        intent: intent.action,
        userAddress: intent.userAddress,
      });
      throw error;
    }
  }

  /**
   * Build swap transactions
   */
  private async buildSwapTransactions(params: BuildTransactionParams): Promise<Transaction[]> {
    const { intent, routes } = params;
    const bestRoute = routes[0]; // Use the best route

    if (!bestRoute) {
      throw new Error('No route available for swap');
    }

    const transactions: Transaction[] = [];

    // Check if token approval is needed
    const approvalTx = await this.buildApprovalTransaction(
      intent.params.fromToken,
      bestRoute.provider,
      intent.params.amount,
      intent.params.chainId,
      intent.userAddress
    );

    if (approvalTx) {
      transactions.push(approvalTx);
    }

    // Build the actual swap transaction
    const swapTx = await this.buildSwapTransaction(intent, bestRoute, params);
    transactions.push(swapTx);

    return transactions;
  }

  /**
   * Build zap-in transactions (convert tokens to LP tokens)
   */
  private async buildZapInTransactions(params: BuildTransactionParams): Promise<Transaction[]> {
    const { intent } = params;

    // For now, this is a placeholder implementation
    // In a real implementation, this would involve:
    // 1. Calculating optimal token distribution
    // 2. Building swap transactions to get the right token ratios
    // 3. Building add liquidity transaction

    this.logger.info('Building zap-in transactions', {
      fromToken: intent.params.fromToken,
      toToken: intent.params.toToken,
      amount: intent.params.amount,
    });

    return [
      {
        to: intent.params.toToken, // Protocol contract address
        data: '0x', // Encoded function call
        value: intent.params.fromToken === 'ETH' ? intent.params.amount : '0',
        gasLimit: '300000',
        chainId: intent.params.chainId,
        metadata: {
          description: `Zap ${intent.params.amount} ${intent.params.fromToken} into ${intent.params.toToken}`,
          action: 'zapIn',
          tokenSymbol: intent.params.fromToken,
          amount: intent.params.amount,
          protocol: 'all-weather',
        },
      },
    ];
  }

  /**
   * Build zap-out transactions (convert LP tokens to single token)
   */
  private async buildZapOutTransactions(params: BuildTransactionParams): Promise<Transaction[]> {
    const { intent } = params;

    this.logger.info('Building zap-out transactions', {
      fromToken: intent.params.fromToken,
      toToken: intent.params.toToken,
      amount: intent.params.amount,
    });

    return [
      {
        to: intent.params.fromToken, // Protocol contract address
        data: '0x', // Encoded function call
        value: '0',
        gasLimit: '400000',
        chainId: intent.params.chainId,
        metadata: {
          description: `Zap out ${intent.params.amount} ${intent.params.fromToken} to ${intent.params.toToken}`,
          action: 'zapOut',
          tokenSymbol: intent.params.fromToken,
          amount: intent.params.amount,
          protocol: 'all-weather',
        },
      },
    ];
  }

  /**
   * Build rebalance transactions
   */
  private async buildRebalanceTransactions(params: BuildTransactionParams): Promise<Transaction[]> {
    const { intent } = params;

    this.logger.info('Building rebalance transactions', {
      userAddress: intent.userAddress,
      chainId: intent.params.chainId,
    });

    // This would integrate with the rebalance backend to get portfolio actions
    // For now, return placeholder transaction
    return [
      {
        to: '0x0000000000000000000000000000000000000000', // Rebalance contract
        data: '0x', // Encoded rebalance call
        value: '0',
        gasLimit: '500000',
        chainId: intent.params.chainId,
        metadata: {
          description: 'Rebalance portfolio to target allocation',
          action: 'rebalance',
          protocol: 'all-weather',
        },
      },
    ];
  }

  /**
   * Build bridge transactions
   */
  private async buildBridgeTransactions(params: BuildTransactionParams): Promise<Transaction[]> {
    const { intent } = params;

    this.logger.info('Building bridge transactions', {
      fromToken: intent.params.fromToken,
      toToken: intent.params.toToken,
      amount: intent.params.amount,
      chainId: intent.params.chainId,
    });

    return [
      {
        to: '0x0000000000000000000000000000000000000000', // Bridge contract
        data: '0x', // Encoded bridge call
        value: intent.params.fromToken === 'ETH' ? intent.params.amount : '0',
        gasLimit: '200000',
        chainId: intent.params.chainId,
        metadata: {
          description: `Bridge ${intent.params.amount} ${intent.params.fromToken} to destination chain`,
          action: 'bridge',
          tokenSymbol: intent.params.fromToken,
          amount: intent.params.amount,
        },
      },
    ];
  }

  /**
   * Build token approval transaction if needed
   */
  private async buildApprovalTransaction(
    tokenAddress: string,
    spender: string,
    amount: string,
    chainId: number,
    _userAddress: string
  ): Promise<Transaction | null> {
    // Skip approval for native ETH
    if (tokenAddress === 'ETH' || tokenAddress === ethers.constants.AddressZero) {
      return null;
    }

    // In a real implementation, we would:
    // 1. Check current allowance
    // 2. Only create approval tx if allowance is insufficient

    const erc20Interface = new ethers.utils.Interface([
      'function approve(address spender, uint256 amount) returns (bool)',
    ]);

    return {
      to: tokenAddress,
      data: erc20Interface.encodeFunctionData('approve', [spender, amount]),
      value: '0',
      gasLimit: '60000',
      chainId,
      metadata: {
        description: `Approve ${tokenAddress} spending`,
        action: 'approval',
        tokenSymbol: tokenAddress,
      },
    };
  }

  /**
   * Build individual swap transaction
   */
  private async buildSwapTransaction(
    intent: IntentRequest,
    route: RouteInfo,
    params: BuildTransactionParams
  ): Promise<Transaction> {
    const { gasPrice, maxFeePerGas, maxPriorityFeePerGas } = params;

    // This is a placeholder - in reality, this would call the specific DEX contract
    // based on the route provider (1inch, 0x, Paraswap, etc.)

    const transaction: Transaction = {
      to: '0x0000000000000000000000000000000000000000', // DEX router address
      data: '0x', // Encoded swap call
      value: intent.params.fromToken === 'ETH' ? intent.params.amount : '0',
      gasLimit: route.gasEstimate,
      chainId: intent.params.chainId,
      metadata: {
        description: `Swap ${intent.params.amount} ${intent.params.fromToken} for ${intent.params.toToken}`,
        action: 'swap',
        tokenSymbol: intent.params.fromToken,
        amount: intent.params.amount,
        protocol: route.provider,
      },
    };

    // Add gas pricing based on preferences
    if (maxFeePerGas && maxPriorityFeePerGas) {
      // EIP-1559 transaction
      transaction.type = 2;
      transaction.maxFeePerGas = maxFeePerGas;
      transaction.maxPriorityFeePerGas = maxPriorityFeePerGas;
    } else if (gasPrice) {
      // Legacy transaction
      transaction.gasPrice = gasPrice;
    }

    return transaction;
  }

  /**
   * Estimate gas for transactions
   */
  async estimateGas(transactions: Transaction[]): Promise<string> {
    let totalGas = ethers.BigNumber.from('0');

    for (const tx of transactions) {
      totalGas = totalGas.add(tx.gasLimit);
    }

    return totalGas.toString();
  }

  /**
   * Validate transaction structure
   */
  validateTransaction(transaction: Transaction): boolean {
    try {
      // Basic validation
      if (!ethers.utils.isAddress(transaction.to)) {
        throw new Error('Invalid to address');
      }

      if (!ethers.utils.isHexString(transaction.data)) {
        throw new Error('Invalid data field');
      }

      if (!ethers.BigNumber.from(transaction.value).gte(0)) {
        throw new Error('Invalid value field');
      }

      if (!ethers.BigNumber.from(transaction.gasLimit).gt(0)) {
        throw new Error('Invalid gas limit');
      }

      return true;
    } catch (error) {
      this.logger.error('Transaction validation failed', {
        error: error.message,
        transaction: {
          to: transaction.to,
          value: transaction.value,
          gasLimit: transaction.gasLimit,
        },
      });
      return false;
    }
  }

  /**
   * Batch compatible transactions together
   */
  optimizeForBatching(transactions: Transaction[]): Transaction[] {
    // For now, return transactions as-is
    // Future optimization: group compatible transactions
    return transactions;
  }
}

export const transactionBuilder = new TransactionBuilder();
