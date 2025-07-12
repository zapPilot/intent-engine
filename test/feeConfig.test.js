const feeConfig = require('../src/config/feeConfig');

describe('Fee Configuration', () => {
  describe('Default Values', () => {
    it('should have correct default platform fee rate', () => {
      expect(feeConfig.platformFeeRate).toBe(0.0001);
    });

    it('should have correct default referrer fee share', () => {
      expect(feeConfig.referrerFeeShare).toBe(0.7);
    });

    it('should have correct default treasury address', () => {
      expect(feeConfig.treasuryAddress).toBe(
        '0x2eCBC6f229feD06044CDb0dD772437a30190CD50'
      );
    });
  });

  describe('calculateFees', () => {
    it('should calculate fees correctly for $1000 transaction', () => {
      const fees = feeConfig.calculateFees(1000);

      expect(fees.totalFeeUSD).toBeCloseTo(0.1, 10); // 1000 * 0.0001
      expect(fees.referrerFeeUSD).toBeCloseTo(0.07, 10); // 0.1 * 0.7
      expect(fees.treasuryFeeUSD).toBeCloseTo(0.03, 10); // 0.1 * 0.3
      expect(fees.referrerFeePercentage).toBe(70);
      expect(fees.treasuryFeePercentage).toBeCloseTo(30, 10);
    });

    it('should calculate fees correctly for $10000 transaction', () => {
      const fees = feeConfig.calculateFees(10000);

      expect(fees.totalFeeUSD).toBeCloseTo(1, 10); // 10000 * 0.0001
      expect(fees.referrerFeeUSD).toBeCloseTo(0.7, 10); // 1 * 0.7
      expect(fees.treasuryFeeUSD).toBeCloseTo(0.3, 10); // 1 * 0.3
    });

    it('should handle zero value transaction', () => {
      const fees = feeConfig.calculateFees(0);

      expect(fees.totalFeeUSD).toBe(0);
      expect(fees.referrerFeeUSD).toBe(0);
      expect(fees.treasuryFeeUSD).toBe(0);
    });
  });

  describe('Helper Methods', () => {
    it('should return treasury address', () => {
      expect(feeConfig.getTreasuryAddress()).toBe(
        '0x2eCBC6f229feD06044CDb0dD772437a30190CD50'
      );
    });

    it('should return platform fee percentage', () => {
      expect(feeConfig.getPlatformFeePercentage()).toBe(0.01);
    });
  });

  describe('Configuration Structure', () => {
    it('should have all required properties', () => {
      expect(feeConfig).toHaveProperty('platformFeeRate');
      expect(feeConfig).toHaveProperty('referrerFeeShare');
      expect(feeConfig).toHaveProperty('treasuryAddress');
      expect(feeConfig).toHaveProperty('calculateFees');
      expect(feeConfig).toHaveProperty('getTreasuryAddress');
      expect(feeConfig).toHaveProperty('getPlatformFeePercentage');
    });

    it('should have correct property types', () => {
      expect(typeof feeConfig.platformFeeRate).toBe('number');
      expect(typeof feeConfig.referrerFeeShare).toBe('number');
      expect(typeof feeConfig.treasuryAddress).toBe('string');
      expect(typeof feeConfig.calculateFees).toBe('function');
      expect(typeof feeConfig.getTreasuryAddress).toBe('function');
      expect(typeof feeConfig.getPlatformFeePercentage).toBe('function');
    });

    it('should have sensible value ranges', () => {
      expect(feeConfig.platformFeeRate).toBeGreaterThan(0);
      expect(feeConfig.platformFeeRate).toBeLessThan(1);
      expect(feeConfig.referrerFeeShare).toBeGreaterThanOrEqual(0);
      expect(feeConfig.referrerFeeShare).toBeLessThanOrEqual(1);
      expect(feeConfig.treasuryAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });
});
