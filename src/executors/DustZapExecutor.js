const FeeCalculationService = require('../services/FeeCalculationService');
const SmartFeeInsertionService = require('../services/SmartFeeInsertionService');
const SwapProcessingService = require('../services/SwapProcessingService');
const SSEEventFactory = require('../services/SSEEventFactory');
const { groupIntoBatches } = require('../utils/dustFilters');
const DUST_ZAP_CONFIG = require('../config/dustZapConfig');

/**
 * DustZap Executor - Core business logic for DustZap intent processing
 */
class DustZapExecutor {
  constructor(swapService, priceService, rebalanceClient) {
    this.swapService = swapService;
    this.priceService = priceService;
    this.rebalanceClient = rebalanceClient;

    // Initialize dependent services
    this.feeCalculationService = new FeeCalculationService();
    this.smartFeeInsertionService = new SmartFeeInsertionService();
    this.swapProcessingService = new SwapProcessingService(
      swapService,
      priceService
    );
  }

  /**
   * Prepare execution context with all required data
   * @param {Object} request - Intent request
   * @returns {Promise<Object>} - Execution context object
   */
  async prepareExecutionContext(request) {
    const { userAddress, chainId, params } = request;
    const {
      dustTokens: filteredDustTokens,
      referralAddress,
      toTokenAddress,
      toTokenDecimals,
      slippage,
    } = params;

    // 1. Use frontend-filtered tokens directly
    const dustTokens = filteredDustTokens;

    // 2. Get ETH price for fee calculations
    const ethPrice = await this.getETHPrice();

    // 3. Group tokens into batches
    const batches = groupIntoBatches(
      dustTokens,
      DUST_ZAP_CONFIG.DEFAULT_BATCH_SIZE
    );

    return {
      userAddress,
      chainId,
      params: {
        referralAddress,
        toTokenAddress,
        toTokenDecimals,
        slippage,
      },
      dustTokens,
      ethPrice,
      batches,
    };
  }

  /**
   * Get current ETH price
   * @returns {Promise<number>} - ETH price in USD
   */
  async getETHPrice() {
    const priceObj = await this.priceService.getPrice('eth');
    return priceObj.price;
  }

  /**
   * Process tokens with SSE streaming (token-level granularity) with dynamic fee insertion
   * @param {Object} executionContext - Execution context
   * @param {Function} streamWriter - Function to write SSE events
   * @returns {Promise<Object>} - Final processing results
   */
  async processTokensWithSSEStreaming(executionContext, streamWriter) {
    const { dustTokens, params, batches } = executionContext;
    const { referralAddress } = params;

    try {
      // Calculate estimated total value for fee calculations (pre-processing estimation)
      let estimatedTotalValueUSD = 0;
      for (const token of dustTokens) {
        estimatedTotalValueUSD += token.amount * token.price || 0;
      }

      // Validate estimated total value
      if (estimatedTotalValueUSD <= 0) {
        const errorMessage = `Invalid estimated totalValueUSD: ${estimatedTotalValueUSD}. All tokens appear to have zero value.`;
        console.error(errorMessage, {
          dustTokensLength: dustTokens.length,
          estimatedTotalValueUSD,
        });

        throw new Error(errorMessage);
      }

      // Pre-calculate fee transactions using estimated value
      const { txBuilder: feeTxBuilder, feeAmounts } =
        this.feeCalculationService.createFeeTransactions(
          estimatedTotalValueUSD,
          executionContext.ethPrice,
          executionContext.chainId,
          referralAddress
        );

      // Get fee transactions from builder
      const feeTransactions = feeTxBuilder.getTransactions();

      // Calculate insertion strategy using SmartFeeInsertionService
      // Create batches if not provided (for backward compatibility with tests)
      const tokenBatches = batches || [dustTokens];
      const totalExpectedTransactions = dustTokens.length * 2; // Approve + Swap per token
      const insertionStrategy =
        this.smartFeeInsertionService.calculateInsertionStrategy(
          tokenBatches,
          feeAmounts.totalFeeETH, // Actual calculated fee amount in ETH
          totalExpectedTransactions,
          feeTransactions.length
        );

      // Create processing context for swap service
      const processingContext =
        SwapProcessingService.createProcessingContext(executionContext);

      // Use SwapProcessingService to process tokens with unified error handling and dynamic fee insertion
      const batchResults =
        await this.swapProcessingService.processTokenBatchWithSSE({
          tokens: dustTokens,
          context: processingContext,
          streamWriter: streamWriter,
          feeTransactions: feeTransactions,
          insertionStrategy: insertionStrategy,
          onProgress: _progressData => {
            // Optional: Add any custom progress handling here
          },
        });

      // Calculate actual total value from successful swaps
      let actualTotalValueUSD = 0;
      for (const result of batchResults.successful) {
        actualTotalValueUSD += result.inputValueUSD || 0;
      }

      // All transactions are now returned from SwapProcessingService (including fees)
      const allTransactions = [...batchResults.transactions];

      // Stream completion with all transactions (now includes dynamically inserted fees)
      const finalResult = SSEEventFactory.createCompletionEvent({
        transactions: allTransactions,
        metadata: {
          totalTokens: dustTokens.length,
          processedTokens:
            batchResults.successful.length + batchResults.failed.length,
          successfulTokens: batchResults.successful.length,
          failedTokens: batchResults.failed.length,
          totalValueUSD: actualTotalValueUSD,
          feeInfo: this.feeCalculationService.buildFeeInfo(
            actualTotalValueUSD,
            referralAddress,
            true // useWETHPattern
          ),
          feeInsertionStrategy: {
            strategy: insertionStrategy.strategy,
            insertionPoints: insertionStrategy.insertionPoints,
            totalFeeTransactions: feeTransactions.length,
          },
          estimatedTotalGas: allTransactions
            .reduce(
              (sum, tx) => sum + BigInt(tx.gasLimit || '21000'),
              BigInt(0)
            )
            .toString(),
        },
      });

      streamWriter(finalResult);

      return {
        allTransactions,
        totalValueUSD: actualTotalValueUSD,
        processedTokens:
          batchResults.successful.length + batchResults.failed.length,
        successfulTokens: batchResults.successful.length,
        failedTokens: batchResults.failed.length,
        feeInsertionStrategy: insertionStrategy,
      };
    } catch (error) {
      console.error('Token processing error:', error);

      const errorEvent = SSEEventFactory.createErrorEvent(error, {
        processedTokens: 0,
        totalTokens: dustTokens.length,
      });

      streamWriter(errorEvent);
      throw error;
    }
  }

  /**
   * Estimate processing duration based on token count
   * @param {number} tokenCount - Number of tokens to process
   * @returns {string} - Estimated duration range
   */
  estimateProcessingDuration(tokenCount) {
    // Rough estimate: 1-2 seconds per token (includes API calls, gas estimation, etc.)
    const minSeconds = Math.max(5, tokenCount * 1);
    const maxSeconds = Math.max(10, tokenCount * 2);

    if (maxSeconds < 60) {
      return `${minSeconds}-${maxSeconds} seconds`;
    } else {
      const minMinutes = Math.floor(minSeconds / 60);
      const maxMinutes = Math.ceil(maxSeconds / 60);
      return `${minMinutes}-${maxMinutes} minutes`;
    }
  }
}

module.exports = DustZapExecutor;
