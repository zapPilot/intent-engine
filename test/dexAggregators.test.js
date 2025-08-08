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

    beforeEach(() => {
      service = new OneInchService();
      process.env.ONE_INCH_API_KEY = 'test-api-key';
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
              gasPrice: '20000000000'
            },
          },
        };

        axios.get.mockResolvedValueOnce(mockResponse);

        const result = await service.getSwapData(params);

        expect(axios.get).toHaveBeenCalledWith(
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
              'liquidity-sources': 'ONE_INCH_LIMIT_ORDER_V3,ONE_INCH_LIMIT_ORDER_V4',
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

        axios.get.mockResolvedValueOnce({ 
          data: {
            toAmount: '1000000000000000000',
            tx: {
              to: '0x1111111254fb6c44bac0bed2854e76f90643097d',
              data: '0x...',
              gas: '150000',
              gasPrice: '20000000000'
            }
          } 
        });

        await service.getSwapData(params);

        expect(axios.get).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            params: expect.objectContaining({
              'liquidity-sources': 'ARBITRUM_ONE_INCH_LIMIT_ORDER_V3,ARBITRUM_ONE_INCH_LIMIT_ORDER_V4',
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
        axios.get.mockRejectedValueOnce(error);

        await expect(service.getSwapData(params)).rejects.toThrow('API Error');
      });
    });
  });

  describe('ParaSwapService', () => {
    let service;

    beforeEach(() => {
      service = new ParaSwapService();
    });

    describe('getSwapData', () => {
      it('should make correct API calls for price and transaction', async () => {
        const params = {
          chainId: 1,
          fromTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amount: '1000000000',
          fromAddress: '0x123...',
          slippage: 100, // 1% in basis points
          ethPrice: 3000,
          toTokenPrice: 3000,
          toTokenDecimals: 18,
        };

        const priceResponse = {
          data: {
            priceRoute: {
              srcToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              destToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
              destAmount: '333333333333333333',
            },
          },
        };

        const txResponse = {
          data: {
            txParams: {
              from: '0x123...',
              to: '0x456...',
              data: '0x...',
              value: '0',
            },
            priceRoute: priceResponse.data.priceRoute,
          },
        };

        axios.get.mockResolvedValueOnce(priceResponse);
        axios.post.mockResolvedValueOnce(txResponse);

        const result = await service.getSwapData(params);

        // Check price call
        expect(axios.get).toHaveBeenCalledWith(
          'https://apiv5.paraswap.io/prices',
          expect.objectContaining({
            params: expect.objectContaining({
              network: 1,
              srcToken: params.fromTokenAddress,
              destToken: params.toTokenAddress,
              amount: params.amount,
              side: 'SELL',
            }),
          })
        );

        // Check transaction call
        expect(axios.post).toHaveBeenCalledWith(
          'https://apiv5.paraswap.io/transactions/1',
          expect.objectContaining({
            priceRoute: priceResponse.data.priceRoute,
            srcToken: params.fromTokenAddress,
            destToken: params.toTokenAddress,
            srcAmount: params.amount,
            userAddress: params.fromAddress,
            slippage: params.slippage,
          })
        );

        expect(result).toBeDefined();
        expect(result.toAmount).toBe('333333333333333333');
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

        axios.get.mockRejectedValueOnce(new Error('Price API Error'));

        await expect(service.getSwapData(params)).rejects.toThrow('Price API Error');
      });
    });
  });

  describe('ZeroXService', () => {
    let service;

    beforeEach(() => {
      service = new ZeroXService();
      process.env.ZERO_X_API_KEY = 'test-0x-key';
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
              gasPrice: '20000000000'
            },
          },
        };

        axios.get.mockResolvedValueOnce(mockResponse);

        const result = await service.getSwapData(params);

        expect(axios.get).toHaveBeenCalledWith(
          'https://api.0x.org/swap/v1/quote',
          expect.objectContaining({
            headers: {
              '0x-api-key': 'test-0x-key',
            },
            params: expect.objectContaining({
              buyToken: params.toTokenAddress,
              sellToken: params.fromTokenAddress,
              sellAmount: params.amount,
              takerAddress: params.fromAddress,
              slippagePercentage: params.slippage,
              skipValidation: true,
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
        axios.get.mockRejectedValueOnce(error);

        await expect(service.getSwapData(params)).rejects.toThrow('0x API Error');
      });
    });
  });
});