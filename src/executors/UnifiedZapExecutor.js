/**
 * UnifiedZapExecutor - Core business logic for multi-strategy allocation
 * Handles strategy parsing, token swaps, transaction generation, and gas estimation
 */

const { protocolFactory } = require('../protocols');
const UNIFIED_ZAP_CONFIG = require('../config/unifiedZapConfig');
const { TokenConfigService, CHAIN_METADATA } = require('../config/tokenConfig');
const SSEEventFactory = require('../services/SSEEventFactory');

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

    const { amount: totalAmount, decimals: inputTokenDecimals } =
      this._normalizeInputAmount(inputAmount, inputToken, chainId);

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
      inputAmountRaw: inputAmount,
      inputTokenDecimals,
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
    const progressBase = 60;
    const progressSpan = 20;

    // Process each protocol allocation
    for (const protocolAllocation of protocolAllocations) {
      try {
        // Update progress
        if (streamWriter) {
          const progressPercent =
            progressBase +
            Math.floor(
              (processedCount / Math.max(protocolAllocations.length, 1)) *
                progressSpan
            );

          streamWriter(
            SSEEventFactory.createProgressEvent({
              processedTokens: progressPercent,
              totalTokens: 100,
              currentOperation: 'transaction_building',
              additionalInfo: {
                phase: 'transaction_building',
                progressPercent,
                protocol: protocolAllocation.name,
                chain: protocolAllocation.chain,
                protocolIndex: processedCount,
                totalProtocols: protocolAllocations.length,
              },
            })
          );
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
          streamWriter(
            SSEEventFactory.createErrorEvent(
              `Error processing ${protocolAllocation.name}: ${error.message}`,
              {
                phase: 'transaction_building',
                protocol: protocolAllocation.name,
                chain: protocolAllocation.chain,
              }
            )
          );
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

    let totalGas = 0n;
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
          totalGas = totalGas + BigInt(gasEstimate.total.gasLimit);
        }
      } catch (error) {
        console.warn(
          `Failed to estimate gas for protocol ${protocolId}:`,
          error
        );

        // Fallback estimation based on transaction count
        const fallbackGas = BigInt(150000) * BigInt(protocolTxs.length);
        protocolGasEstimates[protocolId] = {
          total: { gasLimit: fallbackGas },
          estimated: true,
        };
        totalGas = totalGas + fallbackGas;
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
      estimatedGas: this._serializeBigInt(
        this._getTransactionGasEstimate(tx, gasEstimates)
      ),
      timestamp: Date.now(),
    }));
  }

  /**
   * Normalize input amount string to token units
   * @param {string} amountStr - Human-readable amount
   * @param {string} inputToken - Input token address or native sentinel
   * @param {number} chainId - Chain ID
   * @returns {{amount: bigint, decimals: number}} - Normalized amount and decimals used
   * @private
   */
  _normalizeInputAmount(amountStr, inputToken, chainId) {
    if (typeof amountStr !== 'string') {
      throw new Error('inputAmount must be provided as a string');
    }

    const decimals = this._resolveTokenDecimals(chainId, inputToken);
    const amount = this._parseAmountToUnits(amountStr, decimals);

    return { amount, decimals };
  }

  /**
   * Resolve token decimals from configuration
   * @param {number} chainId - Chain ID
   * @param {string} tokenAddress - Token address or native sentinel
   * @returns {number} - Token decimals (defaults to 18)
   * @private
   */
  _resolveTokenDecimals(chainId, tokenAddress) {
    if (!tokenAddress) {
      return 18;
    }

    const normalized = tokenAddress.toLowerCase();

    if (this._isNativeTokenAddress(normalized)) {
      const nativeSymbol = CHAIN_METADATA[chainId]?.nativeToken;
      const nativeMeta =
        nativeSymbol && TokenConfigService.getToken(chainId, nativeSymbol);
      return nativeMeta?.decimals ?? 18;
    }

    const tokenMeta = TokenConfigService.getTokenByAddress(
      chainId,
      tokenAddress
    );

    if (tokenMeta?.decimals !== undefined) {
      return tokenMeta.decimals;
    }

    return 18;
  }

  /**
   * Convert decimal string to token units BigInt
   * @param {string} amountStr - Human-readable amount (e.g., "2.5")
   * @param {number} decimals - Token decimals
   * @returns {bigint} - Amount in smallest units
   * @private
   */
  _parseAmountToUnits(amountStr, decimals) {
    const normalized = amountStr.trim();

    if (!normalized) {
      throw new Error('inputAmount must be a valid positive number string');
    }

    const parts = normalized.split('.');
    if (parts.length > 2) {
      throw new Error('inputAmount must be a valid positive number string');
    }

    const [wholeRaw, fractionRaw = ''] = parts;

    if (!this._isDigitsOnly(wholeRaw)) {
      throw new Error('inputAmount must contain only numeric characters');
    }

    if (fractionRaw && !this._isDigitsOnly(fractionRaw)) {
      throw new Error('inputAmount must contain only numeric characters');
    }

    const wholePart = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
    const fractionPart = fractionRaw.replace(/0+$/, '');

    if (fractionPart.length > decimals) {
      throw new Error(
        `inputAmount has more than ${decimals} decimal places for the selected token`
      );
    }

    const paddedFraction =
      fractionPart + '0'.repeat(Math.max(decimals - fractionPart.length, 0));

    const unitsString = `${wholePart}${paddedFraction.slice(0, decimals)}`;
    const sanitized = unitsString.replace(/^0+(?=\d)/, '') || '0';

    return BigInt(sanitized);
  }

  /**
   * Determine if address represents native token sentinel
   * @param {string} address - Token address or sentinel
   * @returns {boolean} - True if native token sentinel
   * @private
   */
  _isNativeTokenAddress(address) {
    if (!address) {
      return true;
    }

    const normalized = address.toLowerCase();

    return (
      normalized === 'native' ||
      normalized === '0x0000000000000000000000000000000000000000' ||
      normalized === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    );
  }

  /**
   * Check if string contains only digit characters
   * @param {string} value - String to validate
   * @returns {boolean} - True if all characters are digits
   * @private
   */
  _isDigitsOnly(value) {
    if (value.length === 0) {
      return false;
    }

    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code < 48 || code > 57) {
        return false;
      }
    }

    return true;
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
   * @param {BigInt} totalAmount - Total amount to allocate
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
      const strategyAmount =
        (totalAmount * BigInt(Math.floor(percentage * 100))) / 10000n;

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
        const protocolAmount =
          (strategyAmount * BigInt(protocol.weight)) / BigInt(totalWeight);

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

    if (amount === 0n) {
      return transactions;
    }

    try {
      // For single token protocols
      if (tokenRequirements.mode === 'single') {
        const protocolToken =
          tokenRequirements.protocolSpecific?.underlyingToken ||
          tokenRequirements.outputToken;

        const approvalSpender =
          tokenRequirements.protocolSpecific?.protocolAddress ||
          tokenRequirements.protocolSpecific?.poolAddress ||
          tokenRequirements.protocolSpecific?.routerAddress ||
          tokenRequirements.protocolSpecific?.spenderAddress;

        const approvalToken = protocolToken || inputToken;

        if (
          approvalSpender &&
          approvalToken &&
          !this._isNativeTokenAddress(approvalToken)
        ) {
          const approvalTx = await instance.getApprovalTransaction(
            userAddress,
            approvalToken,
            approvalSpender,
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
          const halfAmount = amount / 2n;

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
   * @returns {BigInt} - Gas estimate for transaction
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
      return BigInt(50000);
    } else {
      return BigInt(200000);
    }
  }

  /**
   * Convert BigInt values to string for safe JSON serialization
   * @param {BigInt|number|string|null} value - Value to serialize
   * @returns {string|number|null} - Serializable value
   * @private
   */
  _serializeBigInt(value) {
    if (typeof value === 'bigint') {
      return value.toString();
    }

    return value;
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
