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

  describe('addFeeTransactions', () => {
    let mockTxBuilder;

    beforeEach(() => {
      mockTxBuilder = {
        addETHTransfer: jest.fn(),
      };
    });

    it('should add single transaction without referral', () => {
      const totalValueUSD = 1000;
      const ethPrice = 3000;

      const result = feeService.addFeeTransactions(
        mockTxBuilder,
        totalValueUSD,
        ethPrice
      );

      expect(mockTxBuilder.addETHTransfer).toHaveBeenCalledTimes(1);
      expect(mockTxBuilder.addETHTransfer).toHaveBeenCalledWith(
        expect.any(String), // treasury address
        result.totalFeeWei,
        'Platform fee (100%)'
      );
      expect(result.hasReferral).toBe(false);
    });

    it('should add split transactions with referral', () => {
      const totalValueUSD = 1000;
      const ethPrice = 3000;
      const referralAddress = '0x1234567890123456789012345678901234567890';

      const result = feeService.addFeeTransactions(
        mockTxBuilder,
        totalValueUSD,
        ethPrice,
        referralAddress
      );

      expect(mockTxBuilder.addETHTransfer).toHaveBeenCalledTimes(2);

      // Check referrer transaction
      expect(mockTxBuilder.addETHTransfer).toHaveBeenCalledWith(
        referralAddress,
        result.referrerFeeWei,
        'Referrer fee (70%)'
      );

      // Check treasury transaction (allow for floating point precision in percentage)
      expect(mockTxBuilder.addETHTransfer).toHaveBeenCalledWith(
        expect.any(String), // treasury address
        result.treasuryFeeWei,
        expect.stringMatching(/^Treasury fee \(30.*%\)$/)
      );
      expect(result.hasReferral).toBe(true);
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
