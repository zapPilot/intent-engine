/**
 * FeeCalculationParams Test Suite
 * Tests the parameter object for fee calculations with validation and factory methods
 */

const FeeCalculationParams = require('../../src/valueObjects/FeeCalculationParams');
const TransactionBuilder = require('../../src/transactions/TransactionBuilder');

describe('FeeCalculationParams', () => {
  const validParams = {
    totalValueUSD: 100.5,
    ethPrice: 2000.75,
    chainId: 1,
    referralAddress: '0x742D35Cc6545c65c3c3Ad53bA9d8e8ff8e5f3D17',
  };

  describe('constructor', () => {
    it('should create instance with valid parameters', () => {
      const params = new FeeCalculationParams(validParams);

      expect(params.totalValueUSD).toBe(100.5);
      expect(params.ethPrice).toBe(2000.75);
      expect(params.chainId).toBe(1);
      expect(params.referralAddress).toBe(
        '0x742D35Cc6545c65c3c3Ad53bA9d8e8ff8e5f3D17'
      );
      expect(params.useWETHPattern).toBe(true); // default
      expect(params.timestamp).toBeDefined();
    });

    it('should use default values for optional parameters', () => {
      const params = new FeeCalculationParams({
        totalValueUSD: 100,
        ethPrice: 2000,
      });

      expect(params.chainId).toBeNull();
      expect(params.referralAddress).toBeNull();
      expect(params.useWETHPattern).toBe(true);
      expect(params.txBuilder).toBeNull();
    });

    it('should throw error for missing totalValueUSD', () => {
      expect(() => {
        new FeeCalculationParams({ ethPrice: 2000 });
      }).toThrow('totalValueUSD must be a non-negative number');
    });

    it('should throw error for invalid ethPrice', () => {
      expect(() => {
        new FeeCalculationParams({ totalValueUSD: 100, ethPrice: -1 });
      }).toThrow('ethPrice must be a positive number');
    });

    it('should throw error for invalid referral address', () => {
      expect(() => {
        new FeeCalculationParams({
          totalValueUSD: 100,
          ethPrice: 2000,
          referralAddress: 'invalid-address',
        });
      }).toThrow('referralAddress must be a valid Ethereum address');
    });

    it('should throw error for invalid chainId with WETH pattern', () => {
      expect(() => {
        new FeeCalculationParams({
          totalValueUSD: 100,
          ethPrice: 2000,
          useWETHPattern: true,
          chainId: -1, // Invalid chainId
        });
      }).toThrow('chainId must be provided for WETH-based fee transactions');
    });
  });

  describe('factory methods', () => {
    it('should create WETH fee parameters', () => {
      const params = FeeCalculationParams.forWETHFees(validParams);

      expect(params.useWETHPattern).toBe(true);
      expect(params.totalValueUSD).toBe(validParams.totalValueUSD);
    });

    it('should create ETH fee parameters', () => {
      const params = FeeCalculationParams.forETHFees({
        totalValueUSD: 100,
        ethPrice: 2000,
      });

      expect(params.useWETHPattern).toBe(false);
    });

    it('should create referral parameters', () => {
      const params = FeeCalculationParams.withReferral(validParams);

      expect(params.hasReferral()).toBe(true);
      expect(params.referralAddress).toBe(validParams.referralAddress);
    });

    it('should throw error for referral without address', () => {
      expect(() => {
        FeeCalculationParams.withReferral({
          totalValueUSD: 100,
          ethPrice: 2000,
        });
      }).toThrow('Referral address is required for referral fee calculations');
    });
  });

  describe('utility methods', () => {
    let params;

    beforeEach(() => {
      params = new FeeCalculationParams(validParams);
    });

    it('should detect referral correctly', () => {
      expect(params.hasReferral()).toBe(true);

      const noReferralParams = new FeeCalculationParams({
        totalValueUSD: 100,
        ethPrice: 2000,
      });
      expect(noReferralParams.hasReferral()).toBe(false);
    });

    it('should return correct fee method', () => {
      expect(params.getFeeMethod()).toBe('WETH');

      const ethParams = FeeCalculationParams.forETHFees({
        totalValueUSD: 100,
        ethPrice: 2000,
      });
      expect(ethParams.getFeeMethod()).toBe('ETH');
    });

    it('should convert to service parameters', () => {
      const serviceParams = params.toServiceParams();

      expect(serviceParams).toEqual({
        totalValueUSD: validParams.totalValueUSD,
        ethPrice: validParams.ethPrice,
        chainId: validParams.chainId,
        referralAddress: validParams.referralAddress,
        txBuilder: null,
      });
    });

    it('should provide meaningful summary', () => {
      const summary = params.getSummary();

      expect(summary).toEqual({
        totalValueUSD: validParams.totalValueUSD,
        feeMethod: 'WETH',
        hasReferral: true,
        chainId: validParams.chainId,
        timestamp: params.timestamp,
      });
    });

    it('should clone with updates', () => {
      const cloned = params.clone({ totalValueUSD: 200 });

      expect(cloned.totalValueUSD).toBe(200);
      expect(cloned.ethPrice).toBe(validParams.ethPrice);
      expect(cloned !== params).toBe(true); // Different instances
    });
  });

  describe('integration with TransactionBuilder', () => {
    it('should work with TransactionBuilder instance', () => {
      const txBuilder = new TransactionBuilder();
      const params = new FeeCalculationParams({
        ...validParams,
        txBuilder,
      });

      expect(params.txBuilder).toBe(txBuilder);

      const serviceParams = params.toServiceParams();
      expect(serviceParams.txBuilder).toBe(txBuilder);
    });
  });

  describe('edge cases', () => {
    it('should handle zero fee amount', () => {
      const params = new FeeCalculationParams({
        totalValueUSD: 0,
        ethPrice: 2000,
      });

      expect(params.totalValueUSD).toBe(0);
    });

    it('should handle very large fee amounts', () => {
      const params = new FeeCalculationParams({
        totalValueUSD: 999999.99,
        ethPrice: 5000.123,
        chainId: 137,
      });

      expect(params.totalValueUSD).toBe(999999.99);
      expect(params.ethPrice).toBe(5000.123);
    });

    it('should handle metadata correctly', () => {
      const metadata = { source: 'test', version: '1.0' };
      const params = new FeeCalculationParams({
        ...validParams,
        metadata,
      });

      expect(params.metadata).toEqual(metadata);

      const cloned = params.clone();
      expect(cloned.metadata).toEqual(metadata);
      expect(cloned.metadata !== params.metadata).toBe(true); // Shallow copy
    });
  });
});
