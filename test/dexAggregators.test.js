const axios = require('axios');
const OneInchService = require('../src/services/dexAggregators/oneinch');
const ParaSwapService = require('../src/services/dexAggregators/paraswap');
const ZeroXService = require('../src/services/dexAggregators/zerox');

jest.mock('axios');

describe('DEX Aggregator Services', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('OneInchService', () => {
    let service;

    let http;
    beforeEach(() => {
      process.env.ONE_INCH_API_KEY = 'test-api-key';
      http = { get: jest.fn() };
      axios.create = jest.fn(() => http);
      service = new OneInchService();
    });

    describe('getSwapData', () => {
      it('should make correct API call for Ethereum mainnet', async () => {
        const params = {
          chainId: 1,
          fromTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amount: '1000000000',
          fromAddress: '0x123...',
          slippage: 1,
          ethPrice: 3000,
          toTokenPrice: 3000,
          toTokenDecimals: 18,
        };

        const mockResponse = {
          data: {
            fromToken: { symbol: 'USDC' },
            toToken: { symbol: 'WETH' },
            toAmount: '333333333333333333',
            tx: {
              data: '0x...',
              to: '0x1111111254fb6c44bac0bed2854e76f90643097d',
              gas: '150000',
              gasPrice: '20000000000',
            },
          },
        };

        http.get.mockResolvedValueOnce(mockResponse);

        const result = await service.getSwapData(params);

        expect(http.get).toHaveBeenCalledWith(
          'https://api.1inch.dev/swap/v5.2/1/swap',
          expect.objectContaining({
            headers: {
              Authorization: 'Bearer test-api-key',
            },
            params: expect.objectContaining({
              src: params.fromTokenAddress,
              dst: params.toTokenAddress,
              amount: params.amount,
              from: params.fromAddress,
              slippage: params.slippage,
              disableEstimate: 'true',
              'liquidity-sources':
                'ONE_INCH_LIMIT_ORDER_V3,ONE_INCH_LIMIT_ORDER_V4',
            }),
          })
        );

        expect(result).toBeDefined();
        expect(result.toAmount).toBe('333333333333333333');
        expect(result.to).toBe('0x1111111254fb6c44bac0bed2854e76f90643097d');
      });

      it('should handle Arbitrum chain with correct prefix', async () => {
        const params = {
          chainId: 42161,
          fromTokenAddress: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
          toTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
          amount: '1000000',
          fromAddress: '0x456...',
          slippage: 0.5,
        };

        http.get.mockResolvedValueOnce({
          data: {
            toAmount: '1000000000000000000',
            tx: {
              to: '0x1111111254fb6c44bac0bed2854e76f90643097d',
              data: '0x...',
              gas: '150000',
              gasPrice: '20000000000',
            },
          },
        });

        await service.getSwapData(params);

        expect(http.get).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            params: expect.objectContaining({
              'liquidity-sources':
                'ARBITRUM_ONE_INCH_LIMIT_ORDER_V3,ARBITRUM_ONE_INCH_LIMIT_ORDER_V4',
            }),
          })
        );
      });

      it('should handle API errors gracefully', async () => {
        const params = {
          chainId: 1,
          fromTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amount: '1000000000',
          fromAddress: '0x123...',
          slippage: 1,
        };

        const error = new Error('API Error');
        error.response = { status: 400, data: { error: 'Bad Request' } };
        http.get.mockRejectedValueOnce(error);

        await expect(service.getSwapData(params)).rejects.toThrow('API Error');
      });
    });
  });

  describe('ParaSwapService', () => {
    let service;

    beforeEach(() => {
      const instance = { get: jest.fn() };
      axios.create = jest.fn(() => instance);
      service = new ParaSwapService();
      // expose for tests below
      service.__http = instance;
    });

    describe('getSwapData', () => {
      it('should make correct API call for price', async () => {
        const params = {
          chainId: 1,
          fromTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          fromTokenDecimals: 6,
          toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          toTokenDecimals: 18,
          amount: '1000000000',
          fromAddress: '0x123...',
          slippage: 1, // 1%
          toTokenPrice: 3000,
        };

        const mockResponse = {
          data: {
            priceRoute: {
              srcToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              destToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
              destAmount: '333333333333333333',
              gasCostUSD: '10.5',
              gasCost: '150000',
            },
            txParams: {
              from: '0x123...',
              to: '0x216b4b4ba9f3e719726886d34a177484278bfcae',
              data: '0x...',
              value: '0',
            },
          },
        };

        service.__http.get.mockResolvedValueOnce(mockResponse);

        const result = await service.getSwapData(params);

        // Check API call
        expect(service.__http.get).toHaveBeenCalledWith(
          'https://api.paraswap.io/swap',
          expect.objectContaining({
            headers: {
              'Content-Type': 'application/json',
            },
            params: expect.objectContaining({
              srcToken: params.fromTokenAddress,
              srcDecimals: params.fromTokenDecimals,
              destToken: params.toTokenAddress,
              destDecimals: params.toTokenDecimals,
              amount: params.amount,
              side: 'SELL',
              network: params.chainId,
              slippage: 100, // 1% * 100
              userAddress: params.fromAddress,
              excludeDEXS: 'AugustusRFQ',
            }),
          })
        );

        expect(result).toBeDefined();
        expect(result.toAmount).toBe('333333333333333333');
        expect(result.to).toBe('0x216b4b4ba9f3e719726886d34a177484278bfcae');
      });

      it('should handle errors in price fetching', async () => {
        const params = {
          chainId: 1,
          fromTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amount: '1000000000',
          fromAddress: '0x123...',
          slippage: 100,
        };

        service.__http.get.mockRejectedValueOnce(new Error('Price API Error'));

        await expect(service.getSwapData(params)).rejects.toThrow(
          'Price API Error'
        );
      });
    });
  });

  describe('ZeroXService', () => {
    let service;

    beforeEach(() => {
      process.env.ZEROX_API_KEY = 'test-0x-key';
      const instance = { get: jest.fn() };
      axios.create = jest.fn(() => instance);
      service = new ZeroXService();
      service.__http = instance;
    });

    describe('getSwapData', () => {
      it('should make correct API call', async () => {
        const params = {
          chainId: 1,
          fromTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amount: '1000000000',
          fromAddress: '0x123...',
          slippage: 0.01,
          ethPrice: 3000,
          toTokenPrice: 3000,
          toTokenDecimals: 18,
        };

        const mockResponse = {
          data: {
            buyToken: { symbol: 'WETH', address: params.toTokenAddress },
            sellToken: { symbol: 'USDC', address: params.fromTokenAddress },
            buyAmount: '333333333333333333',
            transaction: {
              data: '0x...',
              to: '0x456...',
              value: '0',
              gas: '150000',
              gasPrice: '20000000000',
            },
          },
        };

        service.__http.get.mockResolvedValueOnce(mockResponse);

        const result = await service.getSwapData(params);

        expect(service.__http.get).toHaveBeenCalledWith(
          'https://api.0x.org/swap/allowance-holder/quote',
          expect.objectContaining({
            headers: {
              '0x-api-key': 'test-0x-key',
              '0x-version': 'v2',
            },
            params: expect.objectContaining({
              chainId: params.chainId,
              buyToken: params.toTokenAddress,
              sellToken: params.fromTokenAddress,
              sellAmount: params.amount,
              taker: params.fromAddress,
              slippageBps: 1, // 0.01 * 100
            }),
          })
        );

        expect(result).toBeDefined();
        expect(result.toAmount).toBe(mockResponse.data.buyAmount);
      });

      it('should handle API errors', async () => {
        const params = {
          chainId: 1,
          fromTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amount: '1000000000',
          fromAddress: '0x123...',
          slippage: 0.01,
        };

        const error = new Error('0x API Error');
        error.response = { status: 429, data: { reason: 'Rate limited' } };
        service.__http.get.mockRejectedValueOnce(error);

        await expect(service.getSwapData(params)).rejects.toThrow(
          '0x API Error'
        );
      });

      it('should treat liquidityAvailable=false as no-liquidity error', async () => {
        const params = {
          chainId: 1,
          fromTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amount: '1000000000',
          fromAddress: '0x123...',
          slippage: 1,
          ethPrice: 3000,
          toTokenPrice: 3000,
          toTokenDecimals: 18,
        };

        // 0x sometimes returns liquidityAvailable=false to indicate no routes
        service.__http.get.mockResolvedValueOnce({
          data: { liquidityAvailable: false },
        });

        await expect(service.getSwapData(params)).rejects.toMatchObject({
          provider: '0x',
          code: 'NO_LIQUIDITY',
          liquidityAvailable: false,
        });
      });
    });
  });
});
