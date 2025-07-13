const DustZapIntentHandler = require('../src/intents/DustZapIntentHandler');

describe('DustZapIntentHandler Validation', () => {
  let handler;
  let mockSwapService;
  let mockPriceService;
  let mockRebalanceClient;

  beforeEach(() => {
    mockSwapService = {
      getBestSwapQuote: jest.fn(),
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
    it('should validate valid request successfully', () => {
      const validRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustThreshold: 0.01,
          targetToken: 'ETH',
          referralAddress: '0x1234567890123456789012345678901234567890',
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

    it('should throw error for invalid dustThreshold type', () => {
      const invalidRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustThreshold: 'invalid',
        },
      };

      expect(() => handler.validate(invalidRequest)).toThrow(
        'dustThreshold must be a non-negative number'
      );
    });

    it('should throw error for negative dustThreshold', () => {
      const invalidRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustThreshold: -1,
        },
      };

      expect(() => handler.validate(invalidRequest)).toThrow(
        'dustThreshold must be a non-negative number'
      );
    });

    it('should accept zero dustThreshold', () => {
      const validRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustThreshold: 0,
        },
      };

      expect(() => handler.validate(validRequest)).not.toThrow();
    });

    it('should accept undefined dustThreshold', () => {
      const validRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {},
      };

      expect(() => handler.validate(validRequest)).not.toThrow();
    });

    it('should throw error for non-ETH target token', () => {
      const invalidRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          targetToken: 'USDC',
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
          targetToken: 'ETH',
        },
      };

      expect(() => handler.validate(validRequest)).not.toThrow();
    });

    it('should accept undefined target token', () => {
      const validRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {},
      };

      expect(() => handler.validate(validRequest)).not.toThrow();
    });

    it('should throw error for invalid referral address format', () => {
      const invalidRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          referralAddress: 'invalid-address',
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
          referralAddress: '0x123', // Too short
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
          referralAddress: '1234567890123456789012345678901234567890', // No 0x
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
          referralAddress: '0x1234567890123456789012345678901234567890',
        },
      };

      expect(() => handler.validate(validRequest)).not.toThrow();
    });

    it('should accept undefined referral address', () => {
      const validRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {},
      };

      expect(() => handler.validate(validRequest)).not.toThrow();
    });

    it('should validate all parameters together', () => {
      const validRequest = {
        userAddress: '0x2eCBC6f229feD06044CDb0dD772437a30190CD50',
        chainId: 1,
        params: {
          dustThreshold: 0.005,
          targetToken: 'ETH',
          referralAddress: '0x1234567890123456789012345678901234567890',
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

  describe('buildBatchInfo', () => {
    it('should build correct batch info for single batch', () => {
      const batches = [[{ symbol: 'TOKEN1' }, { symbol: 'TOKEN2' }]];

      const batchInfo = handler.buildBatchInfo(batches);

      expect(batchInfo).toEqual([
        {
          startIndex: 0,
          endIndex: 3, // 2 tokens * 2 transactions each - 1
          tokenCount: 2,
        },
      ]);
    });

    it('should build correct batch info for multiple batches', () => {
      const batches = [
        [{ symbol: 'TOKEN1' }, { symbol: 'TOKEN2' }], // 2 tokens = 4 transactions
        [{ symbol: 'TOKEN3' }], // 1 token = 2 transactions
        [{ symbol: 'TOKEN4' }, { symbol: 'TOKEN5' }, { symbol: 'TOKEN6' }], // 3 tokens = 6 transactions
      ];

      const batchInfo = handler.buildBatchInfo(batches);

      expect(batchInfo).toEqual([
        {
          startIndex: 0,
          endIndex: 3,
          tokenCount: 2,
        },
        {
          startIndex: 4,
          endIndex: 5,
          tokenCount: 1,
        },
        {
          startIndex: 6,
          endIndex: 11,
          tokenCount: 3,
        },
      ]);
    });

    it('should handle empty batches', () => {
      const batchInfo = handler.buildBatchInfo([]);
      expect(batchInfo).toEqual([]);
    });
  });

  describe('buildFeeInfo', () => {
    it('should build fee info without referral address', () => {
      const transactions = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      const totalValueUSD = 1000;
      const referralAddress = undefined;

      const feeInfo = handler.buildFeeInfo(
        transactions,
        totalValueUSD,
        referralAddress
      );
      expect(feeInfo.startIndex).toBe(9);
      expect(feeInfo.endIndex).toBe(9);
      expect(feeInfo.totalFeeUsd).toBeCloseTo(0.1, 10);
      expect(feeInfo.referrerFeeUSD).toBeCloseTo(0.06999999999999999, 10);
      expect(feeInfo.treasuryFee).toBeCloseTo(0.03, 10);
    });

    it('should build fee info with referral address', () => {
      const transactions = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      const totalValueUSD = 1000;
      const referralAddress = '0x1234567890123456789012345678901234567890';

      const feeInfo = handler.buildFeeInfo(
        transactions,
        totalValueUSD,
        referralAddress
      );

      const totalFeeUSD = 0.1; // 1000 * 0.0001
      const referrerFeeUSD = totalFeeUSD * 0.7; // 70%
      const treasuryFeeUSD = totalFeeUSD * 0.3; // 30%

      expect(feeInfo.startIndex).toBe(8);
      expect(feeInfo.endIndex).toBe(9);
      expect(feeInfo.totalFeeUsd).toBeCloseTo(totalFeeUSD, 10);
      expect(feeInfo.referrerFeeUSD).toBeCloseTo(referrerFeeUSD, 10);
      expect(feeInfo.treasuryFee).toBeCloseTo(treasuryFeeUSD, 10);
    });
  });

  describe('addFeeTransactions', () => {
    let mockTxBuilder;

    beforeEach(() => {
      mockTxBuilder = {
        addETHTransfer: jest.fn(),
      };
    });

    it('should add single fee transaction without referral', () => {
      const totalValueUSD = 1000;
      const ethPrice = 3000;

      handler.addFeeTransactions(mockTxBuilder, totalValueUSD, ethPrice);

      expect(mockTxBuilder.addETHTransfer).toHaveBeenCalledTimes(1);
      expect(mockTxBuilder.addETHTransfer).toHaveBeenCalledWith(
        expect.any(String), // treasury address
        expect.any(String), // fee amount in wei
        'Platform fee (100%)'
      );
    });

    it('should add split fee transactions with referral', () => {
      const totalValueUSD = 1000;
      const ethPrice = 3000;
      const referralAddress = '0x1234567890123456789012345678901234567890';

      handler.addFeeTransactions(
        mockTxBuilder,
        totalValueUSD,
        ethPrice,
        referralAddress
      );

      expect(mockTxBuilder.addETHTransfer).toHaveBeenCalledTimes(2);

      // Check referrer fee call
      expect(mockTxBuilder.addETHTransfer).toHaveBeenCalledWith(
        referralAddress,
        expect.any(String), // referrer fee in wei
        'Referrer fee (70%)'
      );

      // Check treasury fee call (allow for floating point precision in percentage)
      expect(mockTxBuilder.addETHTransfer).toHaveBeenCalledWith(
        expect.any(String), // treasury address
        expect.any(String), // treasury fee in wei
        expect.stringMatching(/^Treasury fee \(30.*%\)$/)
      );
    });
  });
});
