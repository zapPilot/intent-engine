/**
 * UnifiedZapExecutor - Core business logic for multi-strategy allocation
 * Handles strategy parsing, token swaps, transaction generation, and gas estimation
 */

const { protocolFactory } = require('../protocols');
const UNIFIED_ZAP_CONFIG = require('../config/unifiedZapConfig');
const { TokenConfigService, CHAIN_METADATA } = require('../config/tokenConfig');
const SSEEventFactory = require('../services/SSEEventFactory');
const TransactionBuilder = require('../transactions/TransactionBuilder');
const PhasedExecutionStore = require('./PhasedExecutionStore');

class UnifiedZapExecutor {
  constructor(
    swapService,
    priceService,
    rebalanceClient,
    balanceService = null
  ) {
    this.swapService = swapService;
    this.priceService = priceService;
    this.rebalanceClient = rebalanceClient;
    this.protocolFactory = protocolFactory;

    // Phased execution support
    this.balanceService = balanceService;
    this.phasedStore = new PhasedExecutionStore(30); // 30-minute TTL
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
      inputTokenDecimals,
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
          inputTokenDecimals,
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
    inputTokenDecimals,
    slippage,
    tokenPrices
  ) {
    const { instance, amount, tokenRequirements } = protocolAllocation;
    const transactions = [];

    if (amount === 0n) {
      return transactions;
    }

    try {
      if (tokenRequirements.mode === 'single') {
        let swapOutcome = null;

        if (tokenRequirements.requiresSwap) {
          swapOutcome = await this._prepareSingleTokenSwap({
            protocolAllocation,
            userAddress,
            inputToken,
            inputTokenDecimals,
            amount,
            slippage,
            tokenPrices,
          });

          if (swapOutcome.swapTransactions.length > 0) {
            transactions.push(...swapOutcome.swapTransactions);
          }
        }

        const protocolTokenAddress =
          tokenRequirements.protocolSpecific?.underlyingToken ||
          tokenRequirements.outputToken ||
          inputToken;

        const approvalSpender =
          tokenRequirements.protocolSpecific?.protocolAddress ||
          tokenRequirements.protocolSpecific?.poolAddress ||
          tokenRequirements.protocolSpecific?.routerAddress ||
          tokenRequirements.protocolSpecific?.spenderAddress;

        const approvalTokenAddress =
          swapOutcome?.depositTokenAddress || protocolTokenAddress;

        const approvalAmount =
          swapOutcome?.depositAmount !== undefined
            ? swapOutcome.depositAmount
            : amount;

        if (
          approvalSpender &&
          approvalTokenAddress &&
          !this._isNativeTokenAddress(approvalTokenAddress)
        ) {
          const approvalTx = await instance.getApprovalTransaction(
            userAddress,
            approvalTokenAddress,
            approvalSpender,
            approvalAmount
          );
          transactions.push(approvalTx);
        }

        const depositTokenAddress =
          swapOutcome?.depositTokenAddress || protocolTokenAddress;
        const depositAmount =
          swapOutcome?.depositAmount !== undefined
            ? swapOutcome.depositAmount
            : amount;

        const depositTx = await instance.getDepositTransaction(
          userAddress,
          depositTokenAddress,
          depositAmount,
          { slippage }
        );
        console.log('depositTx', depositTx);
        transactions.push(depositTx);
      } else if (tokenRequirements.mode === 'LP') {
        const lpContext = tokenRequirements.protocolSpecific || {};
        const { token0, token1, routerAddress } = lpContext;

        let lpSwapOutcome = null;
        if (tokenRequirements.requiresSwap) {
          lpSwapOutcome = await this._prepareLPTokenSwaps({
            protocolAllocation,
            tokenRequirements,
            userAddress,
            inputToken,
            inputTokenDecimals,
            amount,
            slippage,
            tokenPrices,
          });

          if (lpSwapOutcome.swapTransactions.length > 0) {
            transactions.push(...lpSwapOutcome.swapTransactions);
          }
        }

        const token0Amount =
          lpSwapOutcome?.depositParams?.token0Amount ?? amount / 2n;
        const token1Amount =
          lpSwapOutcome?.depositParams?.token1Amount ?? amount / 2n;

        if (
          token0?.address &&
          !this._isNativeTokenAddress(token0.address) &&
          routerAddress
        ) {
          const approvalTx0 = await instance.getApprovalTransaction(
            userAddress,
            token0.address,
            routerAddress,
            token0Amount
          );
          transactions.push(approvalTx0);
        }

        if (
          token1?.address &&
          !this._isNativeTokenAddress(token1.address) &&
          routerAddress
        ) {
          const approvalTx1 = await instance.getApprovalTransaction(
            userAddress,
            token1.address,
            routerAddress,
            token1Amount
          );
          transactions.push(approvalTx1);
        }

        const depositTx = await instance.getDepositTransaction(
          userAddress,
          inputToken,
          amount,
          {
            token0Amount,
            token1Amount,
            slippage,
          }
        );
        transactions.push(depositTx);
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

  async _prepareSingleTokenSwap({
    protocolAllocation,
    userAddress,
    inputToken,
    inputTokenDecimals,
    amount,
    slippage,
    tokenPrices,
  }) {
    const { tokenRequirements } = protocolAllocation;

    const targetTokenAddress =
      tokenRequirements.protocolSpecific?.underlyingToken ||
      tokenRequirements.outputToken;

    if (!targetTokenAddress) {
      throw new Error(
        `Protocol ${protocolAllocation.id} requires swap but no target token address was provided`
      );
    }

    const targetDecimals = this._resolveTokenDecimals(
      protocolAllocation.chainId,
      targetTokenAddress
    );

    const symbolHint = this._resolveTokenSymbol(
      protocolAllocation.chainId,
      targetTokenAddress,
      protocolAllocation.config?.config?.symbolOfBestTokenToZapInOut
    );

    const swapResult = await this._executeSwap({
      chainId: protocolAllocation.chainId,
      userAddress,
      fromTokenAddress: inputToken,
      fromTokenDecimals: inputTokenDecimals,
      toTokenAddress: targetTokenAddress,
      toTokenDecimals: targetDecimals,
      amount,
      slippage,
      tokenPrices,
      toTokenSymbol: symbolHint,
    });

    if (swapResult.depositAmount <= 0n) {
      throw new Error(
        `Swap produced zero output for protocol ${protocolAllocation.id}`
      );
    }

    return {
      swapTransactions: swapResult.transactions,
      depositAmount: swapResult.depositAmount,
      depositTokenAddress: targetTokenAddress,
      swapQuote: swapResult.swapQuote,
    };
  }

  async _prepareLPTokenSwaps({
    protocolAllocation,
    tokenRequirements,
    userAddress,
    inputToken,
    inputTokenDecimals,
    amount,
    slippage,
    tokenPrices,
  }) {
    const lpContext = tokenRequirements?.protocolSpecific || {};
    const token0 = lpContext.token0;
    const token1 = lpContext.token1;

    if (!token0 || !token1) {
      throw new Error(
        `LP protocol ${protocolAllocation.id} is missing token metadata`
      );
    }

    const swapAmount0 = amount / 2n;
    const swapAmount1 = amount - swapAmount0;

    if (swapAmount0 <= 0n || swapAmount1 <= 0n) {
      throw new Error(
        `Input amount too small to split for LP provisioning in protocol ${protocolAllocation.id}`
      );
    }

    const symbol0 = this._resolveTokenSymbol(
      protocolAllocation.chainId,
      token0.address,
      token0.symbol
    );
    const symbol1 = this._resolveTokenSymbol(
      protocolAllocation.chainId,
      token1.address,
      token1.symbol
    );

    // Normalize addresses for comparison
    const normalizedInput =
      this._normalizeSwapAddress(inputToken).toLowerCase();
    const normalizedToken0 = this._normalizeSwapAddress(
      token0.address
    ).toLowerCase();
    const normalizedToken1 = this._normalizeSwapAddress(
      token1.address
    ).toLowerCase();

    // Execute swaps only for tokens that don't match input token
    const swap0 =
      normalizedInput === normalizedToken0
        ? {
            transactions: [],
            swapQuote: null,
            depositAmount: swapAmount0,
            depositTokenAddress: token0.address,
          }
        : await this._executeSwap({
            chainId: protocolAllocation.chainId,
            userAddress,
            fromTokenAddress: inputToken,
            fromTokenDecimals: inputTokenDecimals,
            toTokenAddress: token0.address,
            toTokenDecimals: token0.decimals,
            amount: swapAmount0,
            slippage,
            tokenPrices,
            toTokenSymbol: symbol0,
          });

    const swap1 =
      normalizedInput === normalizedToken1
        ? {
            transactions: [],
            swapQuote: null,
            depositAmount: swapAmount1,
            depositTokenAddress: token1.address,
          }
        : await this._executeSwap({
            chainId: protocolAllocation.chainId,
            userAddress,
            fromTokenAddress: inputToken,
            fromTokenDecimals: inputTokenDecimals,
            toTokenAddress: token1.address,
            toTokenDecimals: token1.decimals,
            amount: swapAmount1,
            slippage,
            tokenPrices,
            toTokenSymbol: symbol1,
          });

    if (swap0.depositAmount <= 0n || swap1.depositAmount <= 0n) {
      throw new Error(
        `Swap outputs zero amount for LP provisioning in protocol ${protocolAllocation.id}`
      );
    }

    return {
      swapTransactions: [...swap0.transactions, ...swap1.transactions],
      depositParams: {
        token0Amount: swap0.depositAmount,
        token1Amount: swap1.depositAmount,
      },
    };
  }

  async _executeSwap({
    chainId,
    userAddress,
    fromTokenAddress,
    fromTokenDecimals,
    toTokenAddress,
    toTokenDecimals,
    amount,
    slippage,
    tokenPrices,
    toTokenSymbol,
  }) {
    if (amount <= 0n) {
      throw new Error('Swap amount must be greater than zero');
    }

    const normalizedFrom = this._normalizeSwapAddress(fromTokenAddress);
    const normalizedTo = this._normalizeSwapAddress(toTokenAddress);

    // Skip swap if from and to tokens are identical (case-insensitive)
    if (normalizedFrom.toLowerCase() === normalizedTo.toLowerCase()) {
      return {
        transactions: [],
        swapQuote: null,
        depositAmount: amount,
        depositTokenAddress: toTokenAddress,
      };
    }

    const ethPrice =
      this._resolveTokenPrice('eth', tokenPrices) ??
      this._resolveTokenPrice('weth', tokenPrices) ??
      3000;

    const toTokenPrice =
      this._resolveTokenPrice(toTokenSymbol, tokenPrices) ??
      this._resolveTokenPrice('usdc', tokenPrices) ??
      ethPrice;

    const swapQuote = await this.swapService.getSecondBestSwapQuote({
      chainId,
      fromTokenAddress: normalizedFrom,
      fromTokenDecimals,
      toTokenAddress: normalizedTo,
      toTokenDecimals,
      amount: amount.toString(),
      fromAddress: userAddress,
      slippage,
      eth_price: ethPrice,
      toTokenPrice,
    });

    const txBuilder = new TransactionBuilder();

    if (!this._isNativeTokenAddress(fromTokenAddress)) {
      txBuilder.addApprove(fromTokenAddress, swapQuote.approve_to, amount);
    }

    const swapDescription = `Swap ${amount.toString()} units from ${fromTokenAddress} to ${toTokenAddress}`;
    txBuilder.addSwap(swapQuote, swapDescription);

    return {
      transactions: txBuilder.getTransactions(),
      swapQuote,
      depositAmount: this._selectDepositAmount(swapQuote),
      depositTokenAddress: toTokenAddress,
    };
  }

  _normalizeSwapAddress(address) {
    if (!address) {
      return address;
    }

    const normalized = address.toLowerCase();

    if (this._isNativeTokenAddress(normalized)) {
      return '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    }

    return address;
  }

  _resolveTokenSymbol(chainId, tokenAddress, fallbackSymbol) {
    if (!tokenAddress) {
      return fallbackSymbol || null;
    }

    const tokenMeta = TokenConfigService.getTokenByAddress(
      chainId,
      tokenAddress
    );
    if (tokenMeta?.symbol) {
      return tokenMeta.symbol;
    }

    return fallbackSymbol || null;
  }

  _resolveTokenPrice(symbol, tokenPrices) {
    if (!symbol || !tokenPrices) {
      return null;
    }

    const key = symbol.toLowerCase();

    if (Object.prototype.hasOwnProperty.call(tokenPrices, key)) {
      return tokenPrices[key];
    }

    return null;
  }

  _selectDepositAmount(swapQuote) {
    if (!swapQuote) {
      return 0n;
    }

    const candidate =
      swapQuote.minToAmount !== undefined && swapQuote.minToAmount !== null
        ? swapQuote.minToAmount
        : swapQuote.toAmount;

    if (candidate === undefined || candidate === null) {
      return 0n;
    }

    if (typeof candidate === 'bigint') {
      return candidate;
    }

    if (typeof candidate === 'number') {
      return BigInt(Math.max(Math.floor(candidate), 0));
    }

    if (typeof candidate === 'string') {
      const sanitized = candidate.split('.')[0];
      if (sanitized) {
        return BigInt(sanitized);
      }
    }

    try {
      return BigInt(candidate.toString());
    } catch (error) {
      console.warn(
        'Failed to parse swap output amount, defaulting to 0:',
        error
      );
      return 0n;
    }
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

  // ============================================================================
  // PHASED EXECUTION METHODS
  // ============================================================================

  /**
   * PHASE 1: Initialize phased execution with swap transactions only
   * @param {Object} request - Original zap request
   * @returns {Promise<Object>} - { executionId, phase, transactions, metadata }
   */
  async initializePhasedExecution(request) {
    if (!this.balanceService) {
      throw new Error(
        'BalanceService is required for phased execution. Please inject it in constructor.'
      );
    }

    const executionId = this._generateExecutionId();

    try {
      // Reuse existing validation and context preparation
      const executionContext = await this.prepareExecutionContext(request);

      // Generate ONLY swap transactions (Phase 1)
      const swapTransactions =
        await this._generateSwapTransactionsOnly(executionContext);

      // Determine which token addresses to query after swaps
      const swapTokenAddresses =
        this._extractSwapOutputTokens(executionContext);

      // Store state for Phase 2
      this.phasedStore.set(executionId, {
        phase: 1,
        status: 'pending',
        executionContext: this._serializeContext(executionContext),
        swapTokenAddresses,
        actualBalances: null,
        userAddress: request.userAddress,
        chainId: request.chainId.toString(),
      });

      // Retrieve stored state to get createdAt/expiresAt timestamps
      const storedState = this.phasedStore.get(executionId);

      return {
        executionId,
        phase: 1,
        transactions: swapTransactions,
        estimatedDuration: this.estimateProcessingDuration(
          executionContext.protocolAllocations.length
        ),
        metadata: {
          swapCount: swapTransactions.length,
          tokensToQuery: swapTokenAddresses,
          protocolCount: executionContext.protocolAllocations.length,
          userAddress: request.userAddress,
          chainId: request.chainId.toString(),
          totalStrategies: request.params.strategyAllocations.length,
          totalProtocols: executionContext.protocolAllocations.length,
          expiresAt: storedState.expiresAt,
          createdAt: storedState.createdAt,
        },
      };
    } catch (error) {
      // Clean up state on error
      this.phasedStore.delete(executionId);
      throw new Error(`Phase 1 initialization failed: ${error.message}`);
    }
  }

  /**
   * PHASE 2: Generate deposit transactions with actual on-chain balances
   * @param {string} executionId - Execution identifier from Phase 1
   * @returns {Promise<Object>} - { phase, transactions, actualBalances, metadata }
   */
  async continueToNextPhase(executionId) {
    // 1. Retrieve and validate state
    const state = this.phasedStore.get(executionId);

    if (!state) {
      throw new Error(
        `Execution ${executionId} not found or expired (TTL: 30 minutes)`
      );
    }

    if (state.phase !== 1) {
      throw new Error(
        `Invalid phase transition. Current phase: ${state.phase}, expected: 1`
      );
    }

    if (state.status !== 'pending') {
      throw new Error(
        `Execution ${executionId} is not in pending status (current: ${state.status})`
      );
    }

    try {
      // 2. Query actual balances from blockchain via Moralis
      const actualBalances = await this._queryActualBalances(
        state.userAddress,
        state.chainId,
        state.swapTokenAddresses
      );

      // 3. Validate we have non-zero balances
      this._validateActualBalances(actualBalances, state.swapTokenAddresses);

      // 4. Deserialize execution context
      const executionContext = this._deserializeContext(state.executionContext);

      // 5. Generate deposit transactions with ACTUAL balances
      const depositTransactions =
        await this._generateDepositTransactionsWithBalances(
          executionContext,
          actualBalances
        );

      // 6. Update state to completed
      this.phasedStore.update(executionId, {
        phase: 2,
        status: 'completed',
        actualBalances: this._serializeBalances(actualBalances),
      });

      // Get updated state for metadata
      const _updatedState = this.phasedStore.get(executionId);

      return {
        executionId,
        phase: 2,
        transactions: depositTransactions,
        actualBalances: this._formatBalancesForResponse(actualBalances),
        metadata: {
          depositCount: depositTransactions.length,
          balancesUsed: Array.from(actualBalances.keys()),
          totalProtocols: executionContext.protocolAllocations.length,
          balanceQueryTime: Date.now(),
        },
      };
    } catch (error) {
      // Mark as failed but keep in store for debugging
      this.phasedStore.update(executionId, { status: 'failed' });
      throw new Error(`Phase 2 continuation failed: ${error.message}`);
    }
  }

  /**
   * Generate ONLY swap transactions (Phase 1)
   * Extracted from _generateProtocolTransactions
   * @private
   */
  async _generateSwapTransactionsOnly(executionContext) {
    const {
      protocolAllocations,
      userAddress,
      inputToken,
      inputTokenDecimals,
      slippage,
      tokenPrices,
    } = executionContext;
    const transactions = [];

    for (const protocolAllocation of protocolAllocations) {
      const { tokenRequirements, amount } = protocolAllocation;

      // Skip if no swap needed
      if (!tokenRequirements.requiresSwap) {
        continue;
      }

      try {
        if (tokenRequirements.mode === 'single') {
          // Single token swap
          const swapResult = await this._prepareSingleTokenSwap({
            protocolAllocation,
            userAddress,
            inputToken,
            inputTokenDecimals,
            amount,
            slippage,
            tokenPrices,
          });

          if (
            swapResult.swapTransactions &&
            swapResult.swapTransactions.length > 0
          ) {
            transactions.push(...swapResult.swapTransactions);
          }
        } else if (tokenRequirements.mode === 'LP') {
          // LP token swaps (dual swaps)
          const lpSwapResult = await this._prepareLPTokenSwaps({
            protocolAllocation,
            tokenRequirements,
            userAddress,
            inputToken,
            inputTokenDecimals,
            amount,
            slippage,
            tokenPrices,
          });

          if (
            lpSwapResult.swapTransactions &&
            lpSwapResult.swapTransactions.length > 0
          ) {
            transactions.push(...lpSwapResult.swapTransactions);
          }
        }
      } catch (error) {
        console.error(
          `Error generating swap for protocol ${protocolAllocation.id}:`,
          error
        );
        throw error;
      }
    }

    return transactions;
  }

  /**
   * Generate deposit transactions using ACTUAL on-chain balances (Phase 2)
   * @private
   */
  async _generateDepositTransactionsWithBalances(
    executionContext,
    actualBalances
  ) {
    const { protocolAllocations, userAddress, slippage } = executionContext;
    const transactions = [];

    for (const protocolAllocation of protocolAllocations) {
      const { instance, tokenRequirements } = protocolAllocation;

      try {
        if (tokenRequirements.mode === 'single') {
          // Single token deposit
          const targetToken =
            tokenRequirements.protocolSpecific?.underlyingToken ||
            tokenRequirements.outputToken;

          if (!targetToken) {
            throw new Error(
              `No target token found for protocol ${protocolAllocation.id}`
            );
          }

          const actualAmount = actualBalances.get(targetToken.toLowerCase());

          if (!actualAmount || actualAmount === 0n) {
            console.warn(
              `No balance for ${targetToken} after swap - skipping deposit for ${protocolAllocation.id}`
            );
            continue;
          }

          // Approval transaction (if not native token)
          const spender =
            tokenRequirements.protocolSpecific?.protocolAddress ||
            tokenRequirements.protocolSpecific?.poolAddress;

          if (spender && !this._isNativeTokenAddress(targetToken)) {
            const approvalTx = await instance.getApprovalTransaction(
              userAddress,
              targetToken,
              spender,
              actualAmount
            );
            transactions.push(approvalTx);
          }

          // Deposit transaction
          const depositTx = await instance.getDepositTransaction(
            userAddress,
            targetToken,
            actualAmount,
            { slippage }
          );
          transactions.push(depositTx);
        } else if (tokenRequirements.mode === 'LP') {
          // LP deposit
          const { token0, token1, routerAddress } =
            tokenRequirements.protocolSpecific || {};

          if (!token0 || !token1) {
            throw new Error(
              `Missing LP token metadata for protocol ${protocolAllocation.id}`
            );
          }

          const actualToken0Amount = actualBalances.get(
            token0.address.toLowerCase()
          );
          const actualToken1Amount = actualBalances.get(
            token1.address.toLowerCase()
          );

          if (!actualToken0Amount || !actualToken1Amount) {
            console.warn(
              `Missing LP token balances for ${protocolAllocation.id} - skipping`
            );
            continue;
          }

          // Approvals for both tokens
          if (!this._isNativeTokenAddress(token0.address) && routerAddress) {
            const approvalTx0 = await instance.getApprovalTransaction(
              userAddress,
              token0.address,
              routerAddress,
              actualToken0Amount
            );
            transactions.push(approvalTx0);
          }

          if (!this._isNativeTokenAddress(token1.address) && routerAddress) {
            const approvalTx1 = await instance.getApprovalTransaction(
              userAddress,
              token1.address,
              routerAddress,
              actualToken1Amount
            );
            transactions.push(approvalTx1);
          }

          // LP deposit with actual amounts
          const depositTx = await instance.getDepositTransaction(
            userAddress,
            null,
            0n,
            {
              token0Amount: actualToken0Amount,
              token1Amount: actualToken1Amount,
              slippage,
            }
          );
          transactions.push(depositTx);
        }
      } catch (error) {
        console.error(
          `Error generating deposit for protocol ${protocolAllocation.id}:`,
          error
        );
        throw error;
      }
    }

    return transactions;
  }

  /**
   * Query actual token balances from blockchain via Moralis
   * @private
   */
  async _queryActualBalances(userAddress, chainId, tokenAddresses) {
    if (!this.balanceService) {
      throw new Error('BalanceService is not configured');
    }

    try {
      const result = await this.balanceService.getBalances(userAddress, {
        chainId,
        tokenAddresses,
        skipCache: true, // Always get fresh balances for phase transitions
      });

      // Convert to Map<address, BigInt>
      const balanceMap = new Map();

      if (result.balances && Array.isArray(result.balances)) {
        for (const balance of result.balances) {
          balanceMap.set(
            balance.tokenAddress.toLowerCase(),
            BigInt(balance.balance)
          );
        }
      }

      return balanceMap;
    } catch (error) {
      throw new Error(`Moralis balance query failed: ${error.message}`);
    }
  }

  /**
   * Extract token addresses that will have balances after swaps
   * @private
   */
  _extractSwapOutputTokens(executionContext) {
    const { protocolAllocations } = executionContext;
    const addresses = new Set();

    for (const protocol of protocolAllocations) {
      const { tokenRequirements } = protocol;

      if (tokenRequirements.mode === 'single') {
        const targetToken =
          tokenRequirements.protocolSpecific?.underlyingToken ||
          tokenRequirements.outputToken;

        if (targetToken) {
          addresses.add(targetToken.toLowerCase());
        }
      } else if (tokenRequirements.mode === 'LP') {
        const { token0, token1 } = tokenRequirements.protocolSpecific || {};

        if (token0?.address) {
          addresses.add(token0.address.toLowerCase());
        }
        if (token1?.address) {
          addresses.add(token1.address.toLowerCase());
        }
      }
    }

    return Array.from(addresses);
  }

  /**
   * Validate actual balances are non-zero
   * @private
   */
  _validateActualBalances(actualBalances, expectedTokens) {
    const missing = [];
    const zero = [];

    for (const tokenAddr of expectedTokens) {
      const balance = actualBalances.get(tokenAddr.toLowerCase());

      if (!balance) {
        missing.push(tokenAddr);
      } else if (balance === 0n) {
        zero.push(tokenAddr);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Missing balances for tokens: ${missing.join(', ')}. Ensure swap transactions completed successfully.`
      );
    }

    if (zero.length > 0) {
      throw new Error(
        `Zero balances detected for tokens: ${zero.join(', ')}. Swap transactions may have failed or not yet confirmed.`
      );
    }
  }

  /**
   * Serialize execution context (BigInt-safe)
   * @private
   */
  _serializeContext(context) {
    return JSON.stringify(context, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
  }

  /**
   * Deserialize execution context (restore BigInt and protocol instances)
   * @private
   */
  _deserializeContext(contextString) {
    const parsed = JSON.parse(contextString);

    // Restore BigInt fields
    if (parsed.inputAmount && typeof parsed.inputAmount === 'string') {
      parsed.inputAmount = BigInt(parsed.inputAmount);
    }

    // Restore BigInt and protocol instances in protocol allocations
    if (parsed.protocolAllocations) {
      const chainName = this._getChainName(parsed.chainId);

      parsed.protocolAllocations = parsed.protocolAllocations.map(proto => {
        // Restore amount BigInt
        const restoredProto = {
          ...proto,
          amount:
            typeof proto.amount === 'string'
              ? BigInt(proto.amount)
              : proto.amount,
        };

        // Restore protocol instance from factory
        // Always recreate the instance from factory, even if instance exists (it may be serialized empty object)
        if (proto.config) {
          try {
            restoredProto.instance = this.protocolFactory.createProtocol(
              proto.config,
              chainName,
              proto.chainId
            );
          } catch (error) {
            console.warn(
              `Failed to restore protocol instance for ${proto.id}: ${error.message}`
            );
          }
        } else if (proto.instance) {
          // Instance exists but no config - use it as-is (shouldn't happen)
          restoredProto.instance = proto.instance;
        }

        return restoredProto;
      });
    }

    return parsed;
  }

  /**
   * Serialize balances Map to object (BigInt-safe)
   * @private
   */
  _serializeBalances(balanceMap) {
    const obj = {};
    for (const [addr, balance] of balanceMap.entries()) {
      obj[addr] = balance.toString();
    }
    return obj;
  }

  /**
   * Format balances for API response
   * @private
   */
  _formatBalancesForResponse(balanceMap) {
    const formatted = {};
    for (const [addr, balance] of balanceMap.entries()) {
      formatted[addr] = {
        raw: balance.toString(),
        formatted: this._formatTokenAmount(balance, 18), // Default 18 decimals
      };
    }
    return formatted;
  }

  /**
   * Format token amount for display
   * @private
   */
  _formatTokenAmount(amount, decimals) {
    try {
      const divisor = BigInt(10) ** BigInt(decimals);
      const wholePart = amount / divisor;
      const fractionalPart = amount % divisor;

      if (fractionalPart === 0n) {
        return wholePart.toString();
      }

      const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
      const trimmed = fractionalStr.replace(/0+$/, '');

      return `${wholePart}.${trimmed}`;
    } catch {
      return amount.toString();
    }
  }

  /**
   * Generate unique execution ID
   * @private
   */
  _generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup phased store on shutdown
   */
  destroy() {
    if (this.phasedStore) {
      this.phasedStore.destroy();
    }
  }
}

module.exports = UnifiedZapExecutor;
