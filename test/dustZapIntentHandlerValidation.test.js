const DustZapIntentHandler = require('../src/intents/DustZapIntentHandler');

describe('DustZapIntentHandler Validation', () => {
  let handler;
  let mockSwapService;
  let mockPriceService;
  let mockRebalanceClient;

  beforeEach(() => {
    mockSwapService = {
      getSecondBestSwapQuote: jest.fn(),
    };
    mockPriceService = {
      getPrice: jest.fn(),
    };
    mockRebalanceClient = {
      getUserTokenBalances: jest.fn(),
    };

    handler = new DustZapIntentHandler(
      mockSwapService,
      mockPriceService,
      mockRebalanceClient
    );
  });

  describe('Constructor', () => {
    it('should initialize with correct services', () => {
      expect(handler.swapService).toBe(mockSwapService);
      expect(handler.priceService).toBe(mockPriceService);
      expect(handler.rebalanceClient).toBe(mockRebalanceClient);
    });
  });

  describe('validate', () => {
    const mockFilteredTokens = [
      {
        address: '0xa0b86a33e6441a8c8c5d56aa14e4e66e8e6b9e2',
        symbol: 'USDC',
        decimals: 6,
        raw_amount: '1000000',
        price: 1.0,
        amount: 1.0,
      },
      {
        address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        symbol: 'USDT',
        decimals: 6,
        raw_amount: '2000000',
        price: 1.0,
        amount: 2.0,
      },
    ];

    it('should validate valid request successfully', () => {
      const validRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustTokens: mockFilteredTokens,
          targetToken: 'ETH',
          referralAddress: '0x1234567890123456789012345678901234567890',
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      expect(() => handler.validate(validRequest)).not.toThrow();
    });

    it('should throw error for missing params object', () => {
      const invalidRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
      };

      expect(() => handler.validate(invalidRequest)).toThrow(
        'Missing params object'
      );
    });

    it('should throw error for missing dustTokens', () => {
      const invalidRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          targetToken: 'ETH',
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      expect(() => handler.validate(invalidRequest)).toThrow(
        'filteredDustTokens must be provided as an array'
      );
    });

    it('should throw error for invalid dustTokens type', () => {
      const invalidRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustTokens: 'invalid',
          targetToken: 'ETH',
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      expect(() => handler.validate(invalidRequest)).toThrow(
        'filteredDustTokens must be provided as an array'
      );
    });

    it('should validate dustTokens with proper token structure', () => {
      const validRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustTokens: mockFilteredTokens,
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      expect(() => handler.validate(validRequest)).not.toThrow();
    });

    it('should throw error for empty dustTokens array', () => {
      const invalidRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustTokens: [],
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      expect(() => handler.validate(invalidRequest)).toThrow(
        'No dust tokens found'
      );
    });

    it('should throw error for non-ETH target token', () => {
      const invalidRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustTokens: mockFilteredTokens,
          targetToken: 'USDC',
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      expect(() => handler.validate(invalidRequest)).toThrow(
        'Only ETH target token is currently supported'
      );
    });

    it('should accept ETH target token', () => {
      const validRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustTokens: mockFilteredTokens,
          targetToken: 'ETH',
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      expect(() => handler.validate(validRequest)).not.toThrow();
    });

    it('should accept undefined target token', () => {
      const validRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustTokens: mockFilteredTokens,
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      expect(() => handler.validate(validRequest)).not.toThrow();
    });

    it('should throw error for invalid referral address format', () => {
      const invalidRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustTokens: mockFilteredTokens,
          referralAddress: 'invalid-address',
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      expect(() => handler.validate(invalidRequest)).toThrow(
        'Invalid referralAddress: must be a valid Ethereum address'
      );
    });

    it('should throw error for referral address with wrong length', () => {
      const invalidRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustTokens: mockFilteredTokens,
          referralAddress: '0x123', // Too short
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      expect(() => handler.validate(invalidRequest)).toThrow(
        'Invalid referralAddress: must be a valid Ethereum address'
      );
    });

    it('should throw error for referral address without 0x prefix', () => {
      const invalidRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustTokens: mockFilteredTokens,
          referralAddress: '1234567890123456789012345678901234567890', // No 0x
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      expect(() => handler.validate(invalidRequest)).toThrow(
        'Invalid referralAddress: must be a valid Ethereum address'
      );
    });

    it('should accept valid referral address', () => {
      const validRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustTokens: mockFilteredTokens,
          referralAddress: '0x1234567890123456789012345678901234567890',
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      expect(() => handler.validate(validRequest)).not.toThrow();
    });

    it('should accept undefined referral address', () => {
      const validRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustTokens: mockFilteredTokens,
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      expect(() => handler.validate(validRequest)).not.toThrow();
    });

    it('should throw error for invalid token structure in dustTokens', () => {
      const invalidRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustTokens: [
            {
              address: '0xa0b86a33e6441a8c8c5d56aa14e4e66e8e6b9e2',
              symbol: 'USDC',
              // Missing decimals, raw_amount, and price
            },
          ],
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      expect(() => handler.validate(invalidRequest)).toThrow(
        'Each token must have address, symbol, decimals, raw_amount, and price'
      );
    });

    it('should validate all parameters together', () => {
      const validRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustTokens: mockFilteredTokens,
          targetToken: 'ETH',
          referralAddress: '0x1234567890123456789012345678901234567890',
          toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          toTokenDecimals: 18,
        },
      };

      expect(() => handler.validate(validRequest)).not.toThrow();
    });
  });

  describe('getETHPrice', () => {
    it('should return price from service', async () => {
      const mockPriceObj = { price: 3500 };
      mockPriceService.getPrice.mockResolvedValue(mockPriceObj);

      const price = await handler.getETHPrice();

      expect(price).toBe(3500);
      expect(mockPriceService.getPrice).toHaveBeenCalledWith('eth');
    });

    it('should handle price service returning undefined price', async () => {
      const mockPriceObj = {};
      mockPriceService.getPrice.mockResolvedValue(mockPriceObj);

      const price = await handler.getETHPrice();

      expect(price).toBeUndefined();
    });
  });

  describe('buildFeeInfo (via service)', () => {
    it('should build fee info without referral address', () => {
      const totalValueUSD = 1000;
      const referralAddress = undefined;

      const feeInfo = handler.feeCalculationService.buildFeeInfo(
        totalValueUSD,
        referralAddress
      );

      // SECURITY: Verify that startIndex/endIndex are NOT exposed
      expect(feeInfo.startIndex).toBeUndefined();
      expect(feeInfo.endIndex).toBeUndefined();

      // Verify fee amounts are still present for transparency
      expect(feeInfo.totalFeeUsd).toBeCloseTo(0.1, 10);
      expect(feeInfo.referrerFeeUSD).toBeCloseTo(0.07, 10);
      expect(feeInfo.treasuryFee).toBeCloseTo(0.03, 10);
      expect(feeInfo.feeTransactionCount).toBe(2); // WETH pattern: deposit + transfer
    });

    it('should build fee info with referral address', () => {
      const totalValueUSD = 1000;
      const referralAddress = '0x1234567890123456789012345678901234567890';

      const feeInfo = handler.feeCalculationService.buildFeeInfo(
        totalValueUSD,
        referralAddress
      );

      const totalFeeUSD = 0.1; // 1000 * 0.0001
      const referrerFeeUSD = totalFeeUSD * 0.7; // 70%
      const treasuryFeeUSD = totalFeeUSD * 0.3; // 30%

      // SECURITY: Verify that startIndex/endIndex are NOT exposed
      expect(feeInfo.startIndex).toBeUndefined();
      expect(feeInfo.endIndex).toBeUndefined();

      // Verify fee amounts and count are present
      expect(feeInfo.totalFeeUsd).toBeCloseTo(totalFeeUSD, 10);
      expect(feeInfo.referrerFeeUSD).toBeCloseTo(referrerFeeUSD, 10);
      expect(feeInfo.treasuryFee).toBeCloseTo(treasuryFeeUSD, 10);
      expect(feeInfo.feeTransactionCount).toBe(3); // WETH pattern: deposit + 2 transfers
    });
  });
});
