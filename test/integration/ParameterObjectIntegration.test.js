/**
 * Parameter Object Integration Test Suite
 * Ensures new parameter objects work seamlessly with existing services
 * and maintain 100% backward compatibility
 */

const FeeCalculationService = require('../../src/services/FeeCalculationService');
const SmartFeeInsertionService = require('../../src/services/SmartFeeInsertionService');
const TransactionBuilder = require('../../src/transactions/TransactionBuilder');
const FeeCalculationParams = require('../../src/valueObjects/FeeCalculationParams');
const InsertionStrategyParams = require('../../src/valueObjects/InsertionStrategyParams');

describe('Parameter Object Integration', () => {
  let feeCalculationService;
  let smartFeeInsertionService;

  beforeEach(() => {
    feeCalculationService = new FeeCalculationService();
    smartFeeInsertionService = new SmartFeeInsertionService();
  });

  describe('FeeCalculationService Integration', () => {
    const baseParams = {
      totalValueUSD: 150.75,
      ethPrice: 2100.5,
      chainId: 1,
      referralAddress: '0x742D35Cc6545c65c3c3Ad53bA9d8e8ff8e5f3D17',
    };

    describe('backward compatibility', () => {
      it('should maintain existing method signatures', () => {
        // Test original method still works
        const legacyResult = feeCalculationService.createFeeTransactions(
          baseParams.totalValueUSD,
          baseParams.ethPrice,
          baseParams.chainId,
          baseParams.referralAddress
        );

        expect(legacyResult).toHaveProperty('feeAmounts');
        expect(legacyResult).toHaveProperty('txBuilder');
        expect(legacyResult.feeAmounts.hasReferral).toBe(true);
        expect(legacyResult.txBuilder.getTransactionCount()).toBeGreaterThan(0);
      });

      it('should produce identical results between old and new methods', () => {
        // Test with WETH pattern
        const legacyResult = feeCalculationService.createFeeTransactions(
          baseParams.totalValueUSD,
          baseParams.ethPrice,
          baseParams.chainId,
          baseParams.referralAddress
        );

        const params = FeeCalculationParams.forWETHFees(baseParams);
        const newResult =
          feeCalculationService.createFeeTransactionsWithParams(params);

        // Should have identical fee amounts
        expect(newResult.feeAmounts.totalFeeUSD).toBe(
          legacyResult.feeAmounts.totalFeeUSD
        );
        expect(newResult.feeAmounts.referrerFeeUSD).toBe(
          legacyResult.feeAmounts.referrerFeeUSD
        );
        expect(newResult.feeAmounts.treasuryFeeUSD).toBe(
          legacyResult.feeAmounts.treasuryFeeUSD
        );

        // Should have same number of transactions
        expect(newResult.txBuilder.getTransactionCount()).toBe(
          legacyResult.txBuilder.getTransactionCount()
        );
      });

      it('should handle ETH fees correctly with parameter object', () => {
        const legacyResult = feeCalculationService.createETHFeeTransactions(
          baseParams.totalValueUSD,
          baseParams.ethPrice,
          baseParams.referralAddress
        );

        const params = FeeCalculationParams.forETHFees({
          totalValueUSD: baseParams.totalValueUSD,
          ethPrice: baseParams.ethPrice,
          referralAddress: baseParams.referralAddress,
        });
        const newResult =
          feeCalculationService.createFeeTransactionsWithParams(params);

        // Should produce identical results
        expect(newResult.feeAmounts.totalFeeUSD).toBe(
          legacyResult.feeAmounts.totalFeeUSD
        );
        expect(newResult.txBuilder.getTransactionCount()).toBe(
          legacyResult.txBuilder.getTransactionCount()
        );
      });
    });

    describe('enhanced functionality with parameter objects', () => {
      it('should work with custom TransactionBuilder', () => {
        const customTxBuilder = new TransactionBuilder();
        customTxBuilder.addETHTransfer(
          '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
          '1000000000000000000',
          'Pre-existing transaction'
        );

        const params = new FeeCalculationParams({
          ...baseParams,
          txBuilder: customTxBuilder,
        });

        const result =
          feeCalculationService.createFeeTransactionsWithParams(params);

        // Should reuse the provided builder
        expect(result.txBuilder).toBe(customTxBuilder);
        expect(result.txBuilder.getTransactionCount()).toBeGreaterThan(1); // Pre-existing + fee transactions
      });

      it('should handle factory methods correctly', () => {
        const withReferralParams =
          FeeCalculationParams.withReferral(baseParams);
        const result =
          feeCalculationService.createFeeTransactionsWithParams(
            withReferralParams
          );

        expect(result.feeAmounts.hasReferral).toBe(true);
        expect(result.feeAmounts.referrerFeeUSD).toBeGreaterThan(0);
        expect(result.feeAmounts.treasuryFeeUSD).toBeGreaterThan(0);
      });

      it('should validate parameters properly', () => {
        const invalidParams = new FeeCalculationParams({
          totalValueUSD: 100,
          ethPrice: 2000,
          chainId: 1,
          // Missing referralAddress but calling withReferral
        });

        // This should work (no referral)
        const result =
          feeCalculationService.createFeeTransactionsWithParams(invalidParams);
        expect(result.feeAmounts.hasReferral).toBe(false);
      });
    });
  });

  describe('SmartFeeInsertionService Integration', () => {
    const baseParams = {
      batches: [
        ['token1', 'token2'],
        ['token3', 'token4', 'token5'],
      ],
      totalFeeETH: 0.05,
      totalTransactionCount: 10,
      feeTransactionCount: 2,
    };

    describe('backward compatibility', () => {
      it('should maintain existing method signatures', () => {
        // Test original method still works
        const legacyResult =
          smartFeeInsertionService.calculateInsertionStrategy(
            baseParams.batches,
            baseParams.totalFeeETH,
            baseParams.totalTransactionCount,
            baseParams.feeTransactionCount
          );

        expect(legacyResult).toHaveProperty('minimumThreshold');
        expect(legacyResult).toHaveProperty('insertionPoints');
        expect(legacyResult).toHaveProperty('strategy');
        expect(legacyResult).toHaveProperty('metadata');
      });

      it('should produce identical results between old and new methods', () => {
        const legacyResult =
          smartFeeInsertionService.calculateInsertionStrategy(
            baseParams.batches,
            baseParams.totalFeeETH,
            baseParams.totalTransactionCount,
            baseParams.feeTransactionCount,
            { minimumThresholdPercentage: 0.4, safetyBuffer: 0.1 }
          );

        const params = InsertionStrategyParams.forBalancedStrategy(baseParams);
        const newResult =
          smartFeeInsertionService.calculateInsertionStrategyWithParams(params);

        // Should have identical strategy parameters
        expect(newResult.minimumThreshold).toBe(legacyResult.minimumThreshold);
        expect(newResult.strategy).toBe(legacyResult.strategy);
        expect(newResult.metadata.totalTokens).toBe(
          legacyResult.metadata.totalTokens
        );
        expect(newResult.metadata.totalTransactions).toBe(
          legacyResult.metadata.totalTransactions
        );
      });

      it('should handle different strategy types correctly', () => {
        // Conservative strategy
        const conservativeParams =
          InsertionStrategyParams.forConservativeStrategy(baseParams);
        const conservativeResult =
          smartFeeInsertionService.calculateInsertionStrategyWithParams(
            conservativeParams
          );

        // Aggressive strategy
        const aggressiveParams =
          InsertionStrategyParams.forAggressiveStrategy(baseParams);
        const aggressiveResult =
          smartFeeInsertionService.calculateInsertionStrategyWithParams(
            aggressiveParams
          );

        // Conservative should have higher minimum threshold than aggressive
        expect(conservativeResult.minimumThreshold).toBeGreaterThan(
          aggressiveResult.minimumThreshold
        );
      });
    });

    describe('enhanced functionality with parameter objects', () => {
      it('should work with custom strategy parameters', () => {
        const customParams = new InsertionStrategyParams({
          ...baseParams,
          minimumThresholdPercentage: 0.7,
          safetyBuffer: 0.25,
          spreadFactor: 0.15,
        });

        const result =
          smartFeeInsertionService.calculateInsertionStrategyWithParams(
            customParams
          );

        expect(result.strategy).toBeDefined();
        expect(result.insertionPoints).toBeDefined();
        expect(Array.isArray(result.insertionPoints)).toBe(true);
      });

      it('should provide consistent metadata across strategies', () => {
        const strategies = [
          InsertionStrategyParams.forConservativeStrategy(baseParams),
          InsertionStrategyParams.forBalancedStrategy(baseParams),
          InsertionStrategyParams.forAggressiveStrategy(baseParams),
        ];

        const results = strategies.map(params =>
          smartFeeInsertionService.calculateInsertionStrategyWithParams(params)
        );

        // All should have same metadata structure
        results.forEach(result => {
          expect(result.metadata).toHaveProperty('totalTokens');
          expect(result.metadata).toHaveProperty('totalTransactions');
          expect(result.metadata).toHaveProperty('feeTransactionCount');
          expect(result.metadata.totalTokens).toBe(5); // 2 + 3 tokens
        });
      });
    });
  });

  describe('cross-service integration', () => {
    it('should work seamlessly when services are used together', () => {
      // Create fee calculation parameters
      const feeParams = FeeCalculationParams.forWETHFees({
        totalValueUSD: 200,
        ethPrice: 2500,
        chainId: 1,
        referralAddress: '0x742D35Cc6545c65c3c3Ad53bA9d8e8ff8e5f3D17',
      });

      // Calculate fee transactions
      const feeResult =
        feeCalculationService.createFeeTransactionsWithParams(feeParams);

      // Create insertion strategy parameters
      const insertionParams = InsertionStrategyParams.forBalancedStrategy({
        batches: [['token1'], ['token2', 'token3']],
        totalFeeETH: feeResult.feeAmounts.totalFeeETH,
        totalTransactionCount: 6, // 3 tokens * 2 transactions each
        feeTransactionCount: feeResult.txBuilder.getTransactionCount(),
      });

      // Calculate insertion strategy
      const insertionResult =
        smartFeeInsertionService.calculateInsertionStrategyWithParams(
          insertionParams
        );

      // Verify integration works
      expect(insertionResult).toHaveProperty('insertionPoints');
      expect(insertionResult.metadata.feeTransactionCount).toBe(
        feeResult.txBuilder.getTransactionCount()
      );
    });
  });

  describe('error handling and validation', () => {
    it('should throw appropriate errors for invalid parameter objects', () => {
      // Invalid FeeCalculationParams
      expect(() => {
        feeCalculationService.createFeeTransactionsWithParams({});
      }).toThrow('Expected FeeCalculationParams instance');

      // Invalid InsertionStrategyParams
      expect(() => {
        smartFeeInsertionService.calculateInsertionStrategyWithParams({});
      }).toThrow('Expected InsertionStrategyParams instance');
    });

    it('should validate parameter object contents', () => {
      // Test FeeCalculationParams validation
      expect(() => {
        new FeeCalculationParams({
          totalValueUSD: -100, // Invalid negative value
          ethPrice: 2000,
        });
      }).toThrow('totalValueUSD must be a non-negative number');

      // Test InsertionStrategyParams validation
      expect(() => {
        new InsertionStrategyParams({
          batches: [], // Invalid empty array
          totalFeeETH: 0.05,
          totalTransactionCount: 10,
          feeTransactionCount: 2,
        });
      }).toThrow('batches must be a non-empty array');
    });
  });
});
