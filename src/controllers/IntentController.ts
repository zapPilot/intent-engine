import { Request, Response } from 'express';
import { IntentRequest, IntentResponse, Transaction, RouteInfo } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { transactionBuilder } from '../services/TransactionBuilder';
import { oneInchProvider } from '../integrations/swap-providers/OneInchProvider';
import { gasOptimizer, GasEstimation } from '../utils/GasOptimizer';
import { transactionValidator } from '../utils/TransactionValidator';

export class IntentController {
  public executeIntent = asyncHandler(async (req: Request, res: Response) => {
    const intentRequest: IntentRequest = req.body;

    logger.info('Executing intent:', {
      action: intentRequest.action,
      userAddress: intentRequest.userAddress,
      chainId: intentRequest.params.chainId,
    });

    // Validate intent request
    const validationResult = transactionValidator.validateIntentRequest(intentRequest);
    if (!validationResult.isValid) {
      return res.status(400).json({
        error: 'Invalid intent request',
        validation: validationResult,
      });
    }

    const intentId = this.generateIntentId();

    try {
      // Get routes for the intent
      const routes = await this.getRoutes(intentRequest);

      // Build raw transaction data compatible with all wallet libraries
      const transactions = await this.buildTransactions(intentRequest, routes);

      // Optimize gas for all transactions
      const gasOptimizations = await this.optimizeGasForTransactions(transactions, intentRequest);

      // Apply gas optimizations to transactions
      this.applyGasOptimizations(transactions, gasOptimizations);

      // Calculate total fees and gas
      const totalGas = await transactionBuilder.estimateGas(transactions);
      const { totalCostWei, totalCostUsd } = gasOptimizer.calculateBatchCost(gasOptimizations);

      const response: IntentResponse = {
        intentId,
        transactions,
        metadata: {
          estimatedGas: totalGas,
          totalFees: totalCostWei,
          priceImpact: routes.length > 0 ? routes[0]?.priceImpact || '0' : '0',
          routes,
          executionTime: new Date().toISOString(),
          walletCompatibility: {
            thirdweb: true,
            zerodev: true,
            metamask: true,
            walletConnect: true,
          },
          batchable: transactions.length > 1,
          requiresApproval: this.checkRequiresApproval(transactions),
        },
      };

      logger.info('Intent execution prepared:', {
        intentId,
        transactionCount: transactions.length,
        totalGas,
        estimatedCostUsd: totalCostUsd,
      });

      return res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Intent execution failed:', {
        error: errorMessage,
        intentId,
        action: intentRequest.action,
      });

      return res.status(500).json({
        error: 'Intent execution failed',
        message: errorMessage,
        intentId,
      });
    }
  });

  private generateIntentId(): string {
    return `intent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private async buildTransactions(
    intentRequest: IntentRequest,
    routes: RouteInfo[]
  ): Promise<Transaction[]> {
    const buildParams = {
      intent: intentRequest,
      routes,
    };

    return await transactionBuilder.buildTransactions(buildParams);
  }

  private async getRoutes(intentRequest: IntentRequest): Promise<RouteInfo[]> {
    if (intentRequest.action === 'swap') {
      // Get quotes from 1inch for swap operations
      if (oneInchProvider.isChainSupported(intentRequest.params.chainId)) {
        const quoteRequest = {
          action: intentRequest.action,
          amount: intentRequest.params.amount,
          fromToken: intentRequest.params.fromToken,
          toToken: intentRequest.params.toToken,
          chainId: intentRequest.params.chainId,
        };

        return await oneInchProvider.getQuotes(quoteRequest);
      }
    }

    // For other actions or unsupported chains, return empty routes
    return [];
  }

  private async optimizeGasForTransactions(
    transactions: Transaction[],
    intentRequest: IntentRequest
  ) {
    const gasStrategy = intentRequest.preferences?.gasOptimization || 'balanced';

    const optimizationOptions = {
      strategy: gasStrategy,
      gasLimitMultiplier: 1.1,
      ethPriceUsd: 3000, // This should come from a price oracle
    };

    return await gasOptimizer.optimizeBatchGas(transactions, optimizationOptions);
  }

  private applyGasOptimizations(transactions: Transaction[], gasOptimizations: GasEstimation[]) {
    for (let i = 0; i < transactions.length && i < gasOptimizations.length; i++) {
      const tx = transactions[i];
      const optimization = gasOptimizations[i];

      if (!tx || !optimization) continue;

      tx.gasLimit = optimization.gasLimit;

      if (optimization.maxFeePerGas && optimization.maxPriorityFeePerGas) {
        tx.type = 2; // EIP-1559
        tx.maxFeePerGas = optimization.maxFeePerGas;
        tx.maxPriorityFeePerGas = optimization.maxPriorityFeePerGas;
        delete tx.gasPrice;
      } else if (optimization.gasPrice) {
        tx.gasPrice = optimization.gasPrice;
        delete tx.maxFeePerGas;
        delete tx.maxPriorityFeePerGas;
      }
    }
  }

  private checkRequiresApproval(transactions: Transaction[]): boolean {
    // Check if any transaction requires token approval
    // This would analyze the transaction data to determine if ERC20 approvals are needed
    return transactions.some(
      tx => tx.metadata?.description?.includes('approve') || tx.data.startsWith('0x095ea7b3') // ERC20 approve method signature
    );
  }
}
