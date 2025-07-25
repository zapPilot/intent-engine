const FeeCalculationService = require('../src/services/FeeCalculationService');

describe('FeeCalculationService', () => {
  let feeService;

  beforeEach(() => {
    feeService = new FeeCalculationService();
  });

  describe('calculateFeeAmounts', () => {
    it('should calculate fee amounts without referral', () => {
      const totalValueUSD = 1000;
      const ethPrice = 3000;

      const result = feeService.calculateFeeAmounts(totalValueUSD, ethPrice);

      expect(result.totalFeeUSD).toBeCloseTo(0.1, 10); // 1000 * 0.0001
      expect(result.referrerFeeUSD).toBeCloseTo(0.07, 10); // 0.1 * 0.7
      expect(result.treasuryFeeUSD).toBeCloseTo(0.03, 10); // 0.1 * 0.3
      expect(result.hasReferral).toBe(false);
      expect(result.feeTransactionCount).toBe(1);
      expect(result.referrerFeeWei).toBe('0');
    });

    it('should calculate fee amounts with referral', () => {
      const totalValueUSD = 1000;
      const ethPrice = 3000;
      const referralAddress = '0x1234567890123456789012345678901234567890';

      const result = feeService.calculateFeeAmounts(
        totalValueUSD,
        ethPrice,
        referralAddress
      );

      expect(result.totalFeeUSD).toBeCloseTo(0.1, 10);
      expect(result.referrerFeeUSD).toBeCloseTo(0.07, 10);
      expect(result.treasuryFeeUSD).toBeCloseTo(0.03, 10);
      expect(result.hasReferral).toBe(true);
      expect(result.feeTransactionCount).toBe(2);
      expect(BigInt(result.referrerFeeWei)).toBeGreaterThan(0n);
      expect(BigInt(result.treasuryFeeWei)).toBeGreaterThan(0n);
    });

    it('should calculate precise wei amounts', () => {
      const totalValueUSD = 1000;
      const ethPrice = 3000;
      const referralAddress = '0x1234567890123456789012345678901234567890';

      const result = feeService.calculateFeeAmounts(
        totalValueUSD,
        ethPrice,
        referralAddress
      );

      // Verify that referrer + treasury = total fee
      const totalCalculated =
        BigInt(result.referrerFeeWei) + BigInt(result.treasuryFeeWei);
      expect(totalCalculated.toString()).toBe(result.totalFeeWei);
    });
  });

  describe('buildFeeInfo', () => {
    it('should build fee info metadata without referral', () => {
      const totalValueUSD = 1000;

      const result = feeService.buildFeeInfo(totalValueUSD);

      // SECURITY: Verify that startIndex/endIndex are NOT exposed
      expect(result.startIndex).toBeUndefined();
      expect(result.endIndex).toBeUndefined();

      // Verify fee amounts are still present for transparency
      expect(result.totalFeeUsd).toBeCloseTo(0.1, 10);
      expect(result.referrerFeeUSD).toBeCloseTo(0.07, 10);
      expect(result.treasuryFee).toBeCloseTo(0.03, 10);
      expect(result.feeTransactionCount).toBe(1);
    });

    it('should build fee info metadata with referral', () => {
      const totalValueUSD = 1000;
      const referralAddress = '0x1234567890123456789012345678901234567890';

      const result = feeService.buildFeeInfo(totalValueUSD, referralAddress);

      // SECURITY: Verify that startIndex/endIndex are NOT exposed
      expect(result.startIndex).toBeUndefined();
      expect(result.endIndex).toBeUndefined();

      // Verify fee amounts and count are still present
      expect(result.totalFeeUsd).toBeCloseTo(0.1, 10);
      expect(result.referrerFeeUSD).toBeCloseTo(0.07, 10);
      expect(result.treasuryFee).toBeCloseTo(0.03, 10);
      expect(result.feeTransactionCount).toBe(2);
    });
  });

  describe('createFeeTransactions', () => {
    it('should create fee transactions using TransactionBuilder without referral', () => {
      const totalValueUSD = 1000;
      const ethPrice = 3000;

      const result = feeService.createFeeTransactions(totalValueUSD, ethPrice);

      expect(result.feeAmounts).toBeDefined();
      expect(result.txBuilder).toBeDefined();
      expect(result.feeAmounts.totalFeeUSD).toBeCloseTo(0.1, 10);
      expect(result.feeAmounts.hasReferral).toBe(false);

      const transactions = result.txBuilder.getTransactions();
      expect(transactions).toHaveLength(1);
      expect(transactions[0].description).toBe('Platform fee (100%)');
      expect(transactions[0].gasLimit).toBe('21000');
    });

    it('should create fee transactions using TransactionBuilder with referral', () => {
      const totalValueUSD = 1000;
      const ethPrice = 3000;
      const referralAddress = '0x1234567890123456789012345678901234567890';

      const result = feeService.createFeeTransactions(
        totalValueUSD,
        ethPrice,
        referralAddress
      );

      expect(result.feeAmounts).toBeDefined();
      expect(result.txBuilder).toBeDefined();
      expect(result.feeAmounts.hasReferral).toBe(true);

      const transactions = result.txBuilder.getTransactions();
      expect(transactions).toHaveLength(2);

      // First transaction should be referrer fee
      expect(transactions[0].description).toContain('Referrer fee');
      expect(transactions[0].description).toContain('70');

      // Second transaction should be treasury fee
      expect(transactions[1].description).toContain('Treasury fee');
      expect(transactions[1].description).toContain('30');

      // Both should have proper gas limits
      expect(transactions[0].gasLimit).toBe('21000');
      expect(transactions[1].gasLimit).toBe('21000');
    });

    it('should use provided TransactionBuilder instance', () => {
      const totalValueUSD = 1000;
      const ethPrice = 3000;
      const TransactionBuilder = require('../src/transactions/TransactionBuilder');
      const existingBuilder = new TransactionBuilder();

      // Add a dummy transaction first
      existingBuilder.addTransaction({
        to: '0x1111111111111111111111111111111111111111',
        value: '0',
        description: 'Dummy transaction',
      });

      const result = feeService.createFeeTransactions(
        totalValueUSD,
        ethPrice,
        null,
        existingBuilder
      );

      const transactions = result.txBuilder.getTransactions();
      expect(transactions).toHaveLength(2); // 1 dummy + 1 fee
      expect(transactions[0].description).toBe('Dummy transaction');
      expect(transactions[1].description).toBe('Platform fee (100%)');
    });
  });

  describe('static utility methods', () => {
    describe('splitFeeAmount', () => {
      it('should split fee amount precisely', () => {
        const totalFeeWei = '100000000000000000'; // 0.1 ETH in wei
        const sharePercentage = 0.7; // 70%

        const result = FeeCalculationService.splitFeeAmount(
          totalFeeWei,
          sharePercentage
        );

        expect(BigInt(result.shareWei) + BigInt(result.remainderWei)).toBe(
          BigInt(totalFeeWei)
        );

        // Check that share is approximately 70%
        const sharePercent = Number(
          (BigInt(result.shareWei) * 100n) / BigInt(totalFeeWei)
        );
        expect(sharePercent).toBeCloseTo(70, 0);
      });
    });

    describe('usdToWei', () => {
      it('should convert USD to wei correctly', () => {
        const usdAmount = 300; // $300
        const ethPrice = 3000; // $3000 per ETH

        const result = FeeCalculationService.usdToWei(usdAmount, ethPrice);

        // Should be 0.1 ETH = 100000000000000000 wei
        expect(result).toBe('100000000000000000');
      });
    });

    describe('weiToUsd', () => {
      it('should convert wei to USD correctly', () => {
        const weiAmount = '100000000000000000'; // 0.1 ETH in wei
        const ethPrice = 3000; // $3000 per ETH

        const result = FeeCalculationService.weiToUsd(weiAmount, ethPrice);

        // Should be $300
        expect(result).toBeCloseTo(300, 10);
      });
    });
  });
});
