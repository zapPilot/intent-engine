/**
 * UnifiedZapExecutor - Core business logic for multi-strategy allocation
 * Handles strategy parsing, token swaps, transaction generation, and gas estimation
 */

const { protocolFactory } = require('../protocols');
const UNIFIED_ZAP_CONFIG = require('../config/unifiedZapConfig');
const { ethers } = require('ethers');

class UnifiedZapExecutor {
  constructor(swapService, priceService, rebalanceClient) {
    this.swapService = swapService;
    this.priceService = priceService;
    this.rebalanceClient = rebalanceClient;
    this.protocolFactory = protocolFactory;
  }

  /**
   * Prepare execution context with strategy-to-protocol allocation calculation
   * @param {Object} request - Intent request
   * @returns {Promise<Object>} - Execution context object
   */
  async prepareExecutionContext(request) {
    const { userAddress, chainId, params } = request;
    const {
      strategyAllocations,
      inputToken,
      inputAmount,
      slippage = UNIFIED_ZAP_CONFIG.DEFAULT_SLIPPAGE,
    } = params;

    // Convert input amount to BigNumber
    const totalAmount = ethers.BigNumber.from(inputAmount);

    // Phase 1: Parse strategies into protocol allocations
    const protocolAllocations = await this._parseStrategyAllocations(
      strategyAllocations,
      totalAmount,
      chainId
    );

    // Phase 2: Get current prices for calculations
    const tokenPrices = await this._getTokenPrices(
      inputToken,
      protocolAllocations
    );

    // Phase 3: Calculate token requirements for each protocol
    const protocolsWithRequirements = await this._analyzeTokenRequirements(
      protocolAllocations,
      inputToken,
      tokenPrices
    );

    return {
      userAddress,
      chainId,
      inputToken,
      inputAmount: totalAmount,
      slippage,
      strategyAllocations,
      protocolAllocations: protocolsWithRequirements,
      tokenPrices,
      timestamp: Date.now(),
    };
  }

  /**
   * Generate all transactions for multi-strategy allocation
   * @param {Object} executionContext - Execution context
   * @param {Function} streamWriter - SSE stream writer function
   * @returns {Promise<Array>} - Array of transactions
   */
  async generateTransactions(executionContext, streamWriter = null) {
    const {
      userAddress,
      inputToken,
      protocolAllocations,
      slippage,
      tokenPrices,
    } = executionContext;

    let allTransactions = [];
    let processedCount = 0;

    // Process each protocol allocation
    for (const protocolAllocation of protocolAllocations) {
      try {
        // Update progress
        if (streamWriter) {
          streamWriter({
            event: 'protocol_processing',
            data: {
              phase: 'transaction_building',
              progress: 60 + (processedCount / protocolAllocations.length) * 20,
              message: `Processing ${protocolAllocation.name}`,
              protocol: protocolAllocation.name,
              chain: protocolAllocation.chain,
            },
          });
        }

        // Generate protocol-specific transactions
        const protocolTransactions = await this._generateProtocolTransactions(
          protocolAllocation,
          userAddress,
          inputToken,
          slippage,
          tokenPrices
        );

        // Add protocol context to transactions
        protocolTransactions.forEach(tx => {
          tx.protocolId = protocolAllocation.id;
          tx.protocolName = protocolAllocation.name;
          tx.strategyId = protocolAllocation.strategyId;
          tx.chain = protocolAllocation.chain;
        });

        allTransactions = allTransactions.concat(protocolTransactions);
        processedCount++;
      } catch (error) {
        console.error(
          `Error processing protocol ${protocolAllocation.id}:`,
          error
        );

        if (streamWriter) {
          streamWriter({
            event: 'protocol_error',
            data: {
              phase: 'transaction_building',
              message: `Error processing ${protocolAllocation.name}: ${error.message}`,
              protocol: protocolAllocation.name,
              error: error.message,
            },
          });
        }

        // For now, continue with other protocols instead of failing entirely
        // In production, you might want to implement retry logic or fail gracefully
      }
    }

    return allTransactions;
  }

  /**
   * Estimate gas for all transactions
   * @param {Object} executionContext - Execution context
   * @param {Array} transactions - Generated transactions
   * @returns {Promise<Object>} - Gas estimates
   */
  async estimateGas(executionContext, transactions) {
    const { userAddress, protocolAllocations } = executionContext;

    let totalGas = ethers.BigNumber.from(0);
    const protocolGasEstimates = {};

    // Group transactions by protocol for estimation
    const txsByProtocol = this._groupTransactionsByProtocol(transactions);

    for (const [protocolId, protocolTxs] of Object.entries(txsByProtocol)) {
      try {
        const protocolAllocation = protocolAllocations.find(
          p => p.id === protocolId
        );

        if (protocolAllocation && protocolAllocation.instance) {
          const gasEstimate = await protocolAllocation.instance.estimateGas(
            userAddress,
            executionContext.inputToken,
            protocolAllocation.amount
          );

          protocolGasEstimates[protocolId] = gasEstimate;
          totalGas = totalGas.add(gasEstimate.total.gasLimit);
        }
      } catch (error) {
        console.warn(
          `Failed to estimate gas for protocol ${protocolId}:`,
          error
        );

        // Fallback estimation based on transaction count
        const fallbackGas = ethers.BigNumber.from(150000).mul(
          protocolTxs.length
        );
        protocolGasEstimates[protocolId] = {
          total: { gasLimit: fallbackGas },
          estimated: true,
        };
        totalGas = totalGas.add(fallbackGas);
      }
    }

    return {
      total: totalGas,
      byProtocol: protocolGasEstimates,
      transactionCount: transactions.length,
      estimatedAt: new Date().toISOString(),
    };
  }

  /**
   * Assemble final transaction array with fee insertion
   * @param {Array} transactions - Raw transactions
   * @param {Object} gasEstimates - Gas estimates
   * @param {Object} executionContext - Execution context
   * @returns {Promise<Array>} - Final transaction array
   */
  assembleFinalTransactions(transactions, gasEstimates, _executionContext) {
    // For now, return transactions as-is
    // In a full implementation, this would:
    // 1. Insert fee transactions between protocol groups
    // 2. Optimize transaction order for gas efficiency
    // 3. Add transaction metadata and descriptions

    return transactions.map((tx, index) => ({
      ...tx,
      transactionIndex: index,
      estimatedGas: this._getTransactionGasEstimate(tx, gasEstimates),
      timestamp: Date.now(),
    }));
  }

  /**
   * Estimate processing duration based on protocol count and complexity
   * @param {number} protocolCount - Number of protocols to process
   * @returns {string} - Estimated duration range
   */
  estimateProcessingDuration(protocolCount) {
    // More complex than DustZap due to protocol interactions
    const baseTime = 3; // 3 seconds base time
    const timePerProtocol = 2; // 2 seconds per protocol

    const minSeconds = baseTime + protocolCount * timePerProtocol;
    const maxSeconds = minSeconds * 1.5; // Add 50% buffer

    if (maxSeconds < 60) {
      return `${Math.floor(minSeconds)}-${Math.ceil(maxSeconds)} seconds`;
    } else {
      const minMinutes = Math.floor(minSeconds / 60);
      const maxMinutes = Math.ceil(maxSeconds / 60);
      return `${minMinutes}-${maxMinutes} minutes`;
    }
  }

  /**
   * Parse strategy allocations into protocol-level allocations
   * @param {Array} strategyAllocations - Strategy allocations from request
   * @param {BigNumber} totalAmount - Total amount to allocate
   * @param {number} chainId - Chain ID for filtering protocols
   * @returns {Promise<Array>} - Protocol allocations
   * @private
   */
  _parseStrategyAllocations(strategyAllocations, totalAmount, chainId) {
    const protocolAllocations = [];

    for (const allocation of strategyAllocations) {
      const { strategyId, percentage } = allocation;
      const strategyConfig = UNIFIED_ZAP_CONFIG.STRATEGY_CATEGORIES[strategyId];

      if (!strategyConfig) {
        throw new Error(`Unknown strategy: ${strategyId}`);
      }

      // Calculate strategy amount
      const strategyAmount = totalAmount
        .mul(Math.floor(percentage * 100))
        .div(10000);

      // Get protocols for this strategy
      const strategyProtocols = this.protocolFactory.createProtocolsForStrategy(
        strategyConfig,
        this._getChainName(chainId)
      );

      if (strategyProtocols.length === 0) {
        throw new Error(
          `No enabled protocols found for strategy ${strategyId} on chain ${chainId}`
        );
      }

      // Calculate protocol-level allocations based on weights
      const totalWeight = strategyProtocols.reduce(
        (sum, p) => sum + p.weight,
        0
      );

      for (const protocol of strategyProtocols) {
        const protocolAmount = strategyAmount
          .mul(protocol.weight)
          .div(totalWeight);

        protocolAllocations.push({
          ...protocol,
          strategyId,
          strategyName: strategyConfig.displayName,
          amount: protocolAmount,
          percentage: (protocol.weight / totalWeight) * percentage,
        });
      }
    }

    return protocolAllocations;
  }

  /**
   * Get token prices for calculations
   * @param {string} inputToken - Input token address
   * @param {Array} protocolAllocations - Protocol allocations
   * @returns {Promise<Object>} - Token price mapping
   * @private
   */
  async _getTokenPrices(inputToken, protocolAllocations) {
    // Collect all unique tokens we need prices for
    const tokenSymbols = new Set();

    // Add input token (need to resolve symbol)
    tokenSymbols.add('eth'); // Default for gas calculations

    // Add protocol tokens
    protocolAllocations.forEach(protocol => {
      const config = protocol.instance.config;
      if (config.symbolOfBestTokenToZapInOut) {
        tokenSymbols.add(config.symbolOfBestTokenToZapInOut.toLowerCase());
      }

      // Add LP tokens if applicable
      if (config.lpTokens) {
        config.lpTokens.forEach(([symbol]) => {
          tokenSymbols.add(symbol.toLowerCase());
        });
      }
    });

    // Fetch prices for all tokens
    const prices = {};
    const pricePromises = Array.from(tokenSymbols).map(async symbol => {
      try {
        const priceObj = await this.priceService.getPrice(symbol);
        prices[symbol] = priceObj.price;
      } catch (error) {
        console.warn(`Failed to get price for ${symbol}:`, error.message);
        prices[symbol] = 0;
      }
    });

    await Promise.all(pricePromises);
    return prices;
  }

  /**
   * Analyze token requirements for each protocol
   * @param {Array} protocolAllocations - Protocol allocations
   * @param {string} inputToken - Input token address
   * @param {Object} tokenPrices - Token prices
   * @returns {Promise<Array>} - Protocols with token requirements
   * @private
   */
  async _analyzeTokenRequirements(
    protocolAllocations,
    inputToken,
    _tokenPrices
  ) {
    const protocolsWithRequirements = [];

    for (const protocol of protocolAllocations) {
      try {
        const requirements =
          await protocol.instance.getTokenRequirements(inputToken);

        protocolsWithRequirements.push({
          ...protocol,
          tokenRequirements: requirements,
          requiresSwap: requirements.requiresSwap,
        });
      } catch (error) {
        console.error(
          `Failed to analyze requirements for protocol ${protocol.id}:`,
          error
        );
        // Add with fallback requirements
        protocolsWithRequirements.push({
          ...protocol,
          tokenRequirements: { mode: 'single', requiresSwap: true },
          requiresSwap: true,
        });
      }
    }

    return protocolsWithRequirements;
  }

  /**
   * Generate transactions for a specific protocol
   * @param {Object} protocolAllocation - Protocol allocation with instance
   * @param {string} userAddress - User address
   * @param {string} inputToken - Input token address
   * @param {number} slippage - Slippage tolerance
   * @param {Object} tokenPrices - Token prices
   * @returns {Promise<Array>} - Protocol transactions
   * @private
   */
  async _generateProtocolTransactions(
    protocolAllocation,
    userAddress,
    inputToken,
    slippage,
    _tokenPrices
  ) {
    const { instance, amount, tokenRequirements } = protocolAllocation;
    const transactions = [];

    try {
      // For single token protocols
      if (tokenRequirements.mode === 'single') {
        const protocolToken =
          tokenRequirements.protocolSpecific?.underlyingToken ||
          tokenRequirements.outputToken;

        // Generate approval transaction
        if (protocolToken && tokenRequirements.requiresSwap) {
          const approvalTx = await instance.getApprovalTransaction(
            userAddress,
            protocolToken,
            tokenRequirements.protocolSpecific?.protocolAddress ||
              tokenRequirements.protocolSpecific?.poolAddress,
            amount
          );
          transactions.push(approvalTx);
        }

        // Generate deposit transaction
        const depositTx = await instance.getDepositTransaction(
          userAddress,
          protocolToken || inputToken,
          amount,
          { slippage }
        );
        transactions.push(depositTx);
      }

      // For LP protocols
      else if (tokenRequirements.mode === 'LP') {
        const lpTokens =
          tokenRequirements.protocolSpecific?.token0 &&
          tokenRequirements.protocolSpecific?.token1
            ? [
                tokenRequirements.protocolSpecific.token0,
                tokenRequirements.protocolSpecific.token1,
              ]
            : [];

        if (lpTokens.length === 2) {
          // Calculate token amounts for LP (50/50 split for simplicity)
          const halfAmount = amount.div(2);

          // Generate approvals for both tokens
          for (const token of lpTokens) {
            const approvalTx = await instance.getApprovalTransaction(
              userAddress,
              token.address,
              tokenRequirements.protocolSpecific?.routerAddress,
              halfAmount
            );
            transactions.push(approvalTx);
          }

          // Generate LP provision transaction
          const depositTx = await instance.getDepositTransaction(
            userAddress,
            inputToken,
            amount,
            {
              token0Amount: halfAmount,
              token1Amount: halfAmount,
              slippage,
            }
          );
          transactions.push(depositTx);
        }
      }
    } catch (error) {
      console.error(
        `Error generating transactions for ${protocolAllocation.id}:`,
        error
      );
      throw new Error(
        `Failed to generate transactions for ${protocolAllocation.name}: ${error.message}`
      );
    }

    return transactions;
  }

  /**
   * Group transactions by protocol ID
   * @param {Array} transactions - All transactions
   * @returns {Object} - Transactions grouped by protocol
   * @private
   */
  _groupTransactionsByProtocol(transactions) {
    const grouped = {};

    transactions.forEach(tx => {
      const protocolId = tx.protocolId;
      if (!grouped[protocolId]) {
        grouped[protocolId] = [];
      }
      grouped[protocolId].push(tx);
    });

    return grouped;
  }

  /**
   * Get gas estimate for specific transaction
   * @param {Object} transaction - Transaction object
   * @param {Object} gasEstimates - Overall gas estimates
   * @returns {BigNumber} - Gas estimate for transaction
   * @private
   */
  _getTransactionGasEstimate(transaction, gasEstimates) {
    const protocolEstimate = gasEstimates.byProtocol[transaction.protocolId];

    if (protocolEstimate && protocolEstimate.total) {
      return protocolEstimate.total.gasLimit;
    }

    // Fallback estimate based on transaction type
    if (
      transaction.description &&
      transaction.description.toLowerCase().includes('approve')
    ) {
      return ethers.BigNumber.from('50000');
    } else {
      return ethers.BigNumber.from('200000');
    }
  }

  /**
   * Get chain name from chain ID
   * @param {number} chainId - Chain ID
   * @returns {string} - Chain name
   * @private
   */
  _getChainName(chainId) {
    const chainMapping = {
      1: 'ethereum',
      42161: 'arbitrum',
      8453: 'base',
      10: 'optimism',
    };

    return chainMapping[chainId] || 'unknown';
  }
}

module.exports = UnifiedZapExecutor;
