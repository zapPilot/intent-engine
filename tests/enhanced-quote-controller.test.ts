import request from 'supertest';
import express from 'express';
import { QuoteController } from '../src/controllers/QuoteController';
import { oneInchProvider } from '../src/integrations/swap-providers/OneInchProvider';
import { paraswapProvider } from '../src/integrations/swap-providers/ParaswapProvider';
import { zeroXProvider } from '../src/integrations/swap-providers/ZeroXProvider';

// Mock all the providers
jest.mock('../src/integrations/swap-providers/OneInchProvider');
jest.mock('../src/integrations/swap-providers/ParaswapProvider');
jest.mock('../src/integrations/swap-providers/ZeroXProvider');
jest.mock('../src/utils/GasOptimizer');

const mockOneInchProvider = oneInchProvider as jest.Mocked<typeof oneInchProvider>;
const mockParaswapProvider = paraswapProvider as jest.Mocked<typeof paraswapProvider>;
const mockZeroXProvider = zeroXProvider as jest.Mocked<typeof zeroXProvider>;

describe('Enhanced QuoteController Integration', () => {
  let app: express.Application;
  let quoteController: QuoteController;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    quoteController = new QuoteController();
    app.get('/quote', quoteController.getQuote);

    // Reset all mocks
    jest.clearAllMocks();

    // Mock gas optimizer
    const { gasOptimizer } = require('../src/utils/GasOptimizer');
    gasOptimizer.getNetworkGasInfo.mockResolvedValue({
      chainId: 1,
      gasPrice: '20000000000',
      supportsEIP1559: true,
    });
  });

  describe('Multi-Aggregator Quote Fetching', () => {
    it('should aggregate quotes from all providers and return the best one', async () => {
      // Mock provider support
      mockOneInchProvider.isChainSupported.mockReturnValue(true);
      mockParaswapProvider.isChainSupported.mockReturnValue(true);
      mockZeroXProvider.isChainSupported.mockReturnValue(true);

      // Mock quotes from different providers with varying output amounts
      mockOneInchProvider.getQuotes.mockResolvedValue([
        {
          provider: '1inch',
          route: ['USDC', 'WETH'],
          amountIn: '1000000000',
          amountOut: '500000000000000000', // 0.5 ETH
          gasEstimate: '150000',
          priceImpact: '0.1',
        },
      ]);

      mockParaswapProvider.getQuotes.mockResolvedValue([
        {
          provider: 'paraswap',
          route: ['USDC', 'WETH'],
          amountIn: '1000000000',
          amountOut: '520000000000000000', // 0.52 ETH (better!)
          gasEstimate: '140000',
          priceImpact: '0.08',
        },
      ]);

      mockZeroXProvider.getQuotes.mockResolvedValue([
        {
          provider: '0x',
          route: ['USDC', 'WETH'],
          amountIn: '1000000000',
          amountOut: '510000000000000000', // 0.51 ETH
          gasEstimate: '160000',
          priceImpact: '0.12',
        },
      ]);

      const response = await request(app)
        .get('/quote')
        .query({
          action: 'swap',
          amount: '1000000000',
          fromToken: 'USDC',
          toToken: 'WETH',
          chainId: '1',
        })
        .expect(200);

      expect(response.body.bestRoute.provider).toBe('paraswap'); // Best output amount
      expect(response.body.bestRoute.amountOut).toBe('520000000000000000');
      expect(response.body.alternatives).toHaveLength(2); // 1inch and 0x
      expect(response.body.metadata.totalAggregatorsCalled).toBe(3);
      expect(response.body.metadata.failedAggregators).toHaveLength(0);
      expect(response.body.metadata.aggregatorResults).toHaveProperty('1inch');
      expect(response.body.metadata.aggregatorResults).toHaveProperty('paraswap');
      expect(response.body.metadata.aggregatorResults).toHaveProperty('0x');
    });

    it('should handle partial failures gracefully', async () => {
      // Mock provider support
      mockOneInchProvider.isChainSupported.mockReturnValue(true);
      mockParaswapProvider.isChainSupported.mockReturnValue(true);
      mockZeroXProvider.isChainSupported.mockReturnValue(false); // Not supported

      // Mock one successful quote and one failure
      mockOneInchProvider.getQuotes.mockResolvedValue([
        {
          provider: '1inch',
          route: ['USDC', 'WETH'],
          amountIn: '1000000000',
          amountOut: '500000000000000000',
          gasEstimate: '150000',
          priceImpact: '0.1',
        },
      ]);

      mockParaswapProvider.getQuotes.mockRejectedValue(new Error('API Error'));

      const response = await request(app)
        .get('/quote')
        .query({
          action: 'swap',
          amount: '1000000000',
          fromToken: 'USDC',
          toToken: 'WETH',
          chainId: '1',
        })
        .expect(200);

      expect(response.body.bestRoute.provider).toBe('1inch'); // Only successful one
      expect(response.body.alternatives).toHaveLength(0);
      expect(response.body.metadata.failedAggregators).toContain('paraswap');
      expect(response.body.metadata.failedAggregators).toContain('0x');
      expect(response.body.metadata.aggregatorResults['1inch']).toBeTruthy();
      expect(response.body.metadata.aggregatorResults.paraswap).toBeNull();
      expect(response.body.metadata.aggregatorResults['0x']).toBeNull();
    });

    it('should calculate savings between best and worst quotes', async () => {
      // Mock provider support
      mockOneInchProvider.isChainSupported.mockReturnValue(true);
      mockParaswapProvider.isChainSupported.mockReturnValue(true);
      mockZeroXProvider.isChainSupported.mockReturnValue(true);

      // Mock quotes with significant difference
      mockOneInchProvider.getQuotes.mockResolvedValue([
        {
          provider: '1inch',
          route: ['USDC', 'WETH'],
          amountIn: '1000000000',
          amountOut: '500000000000000000', // Worst
          gasEstimate: '150000',
          priceImpact: '0.1',
        },
      ]);

      mockParaswapProvider.getQuotes.mockResolvedValue([
        {
          provider: 'paraswap',
          route: ['USDC', 'WETH'],
          amountIn: '1000000000',
          amountOut: '550000000000000000', // Best (10% better)
          gasEstimate: '140000',
          priceImpact: '0.08',
        },
      ]);

      mockZeroXProvider.getQuotes.mockResolvedValue([
        {
          provider: '0x',
          route: ['USDC', 'WETH'],
          amountIn: '1000000000',
          amountOut: '525000000000000000', // Middle
          gasEstimate: '160000',
          priceImpact: '0.12',
        },
      ]);

      const response = await request(app)
        .get('/quote')
        .query({
          action: 'swap',
          amount: '1000000000',
          fromToken: 'USDC',
          toToken: 'WETH',
          chainId: '1',
        })
        .expect(200);

      expect(response.body.bestRoute.provider).toBe('paraswap');
      expect(response.body.bestRoute.metadata.savings).toBe('50000000000000000'); // 0.05 ETH
      expect(parseFloat(response.body.bestRoute.metadata.savingsPercent)).toBe(10); // 10% savings
    });

    it('should return fallback route when all aggregators fail', async () => {
      // Mock provider support
      mockOneInchProvider.isChainSupported.mockReturnValue(true);
      mockParaswapProvider.isChainSupported.mockReturnValue(true);
      mockZeroXProvider.isChainSupported.mockReturnValue(true);

      // Mock all failures
      mockOneInchProvider.getQuotes.mockRejectedValue(new Error('1inch API Error'));
      mockParaswapProvider.getQuotes.mockRejectedValue(new Error('Paraswap API Error'));
      mockZeroXProvider.getQuotes.mockRejectedValue(new Error('0x API Error'));

      const response = await request(app)
        .get('/quote')
        .query({
          action: 'swap',
          amount: '1000000000',
          fromToken: 'USDC',
          toToken: 'WETH',
          chainId: '1',
        })
        .expect(200);

      expect(response.body.bestRoute.provider).toBe('fallback');
      expect(response.body.bestRoute.metadata.warning).toContain('All DEX aggregators failed');
      expect(response.body.alternatives).toHaveLength(0);
      expect(response.body.metadata.failedAggregators).toHaveLength(3);
    });

    it('should include performance metrics in response', async () => {
      // Mock provider support and quick responses
      mockOneInchProvider.isChainSupported.mockReturnValue(true);
      mockParaswapProvider.isChainSupported.mockReturnValue(false);
      mockZeroXProvider.isChainSupported.mockReturnValue(false);

      mockOneInchProvider.getQuotes.mockResolvedValue([
        {
          provider: '1inch',
          route: ['USDC', 'WETH'],
          amountIn: '1000000000',
          amountOut: '500000000000000000',
          gasEstimate: '150000',
          priceImpact: '0.1',
        },
      ]);

      const response = await request(app)
        .get('/quote')
        .query({
          action: 'swap',
          amount: '1000000000',
          fromToken: 'USDC',
          toToken: 'WETH',
          chainId: '1',
        })
        .expect(200);

      expect(response.body.metadata.quoteFetchTime).toMatch(/^\d+ms$/);
      expect(response.body.metadata.totalAggregatorsCalled).toBe(3);
      expect(typeof response.body.metadata.aggregatorResults).toBe('object');
    });
  });

  describe('Error Handling', () => {
    it('should reject non-swap actions', async () => {
      const response = await request(app)
        .get('/quote')
        .query({
          action: 'bridge', // Not supported
          amount: '1000000000',
          fromToken: 'USDC',
          toToken: 'WETH',
          chainId: '1',
        })
        .expect(400);

      expect(response.body.error).toBe('Only swap action is supported for quotes');
      expect(response.body.supportedActions).toEqual(['swap']);
    });

    it('should handle invalid request parameters gracefully', async () => {
      // Mock all providers to return empty results for invalid inputs
      mockOneInchProvider.isChainSupported.mockReturnValue(false);
      mockParaswapProvider.isChainSupported.mockReturnValue(false);
      mockZeroXProvider.isChainSupported.mockReturnValue(false);

      const response = await request(app)
        .get('/quote')
        .query({
          action: 'swap',
          amount: '', // Invalid empty amount
          fromToken: '', // Invalid empty token
          toToken: '', // Invalid empty token
          chainId: 'invalid', // Invalid chain ID
        });

      // API handles gracefully and returns fallback
      expect(response.status).toBe(200);
      expect(response.body.bestRoute).toBeDefined();
      expect(response.body.bestRoute.provider).toBe('fallback');
    });
  });
});