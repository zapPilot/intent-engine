import { gasOptimizer } from '../src/utils/GasOptimizer';
import { Transaction } from '../src/types';

// Mock fetch for gas oracle requests
global.fetch = jest.fn();

describe('GasOptimizer', () => {
  const mockTransaction: Transaction = {
    to: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
    data: '0x',
    value: '1000000000000000000',
    gasLimit: '21000',
    chainId: 1
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('optimizeGas', () => {
    it('should optimize gas with balanced strategy', async () => {
      // Mock successful gas oracle response
      (fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({
          status: '1',
          result: {
            SafeGasPrice: '20',
            ProposeGasPrice: '25',
            FastGasPrice: '30'
          }
        })
      });

      const options = {
        strategy: 'balanced' as const,
        ethPriceUsd: 3000
      };

      const result = await gasOptimizer.optimizeGas(mockTransaction, options);

      expect(result).toBeDefined();
      expect(result.gasLimit).toBeDefined();
      expect(result.estimatedCostWei).toBeDefined();
      expect(result.estimatedCostUsd).toBeDefined();
    });

    it('should use speed strategy for faster transactions', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({
          status: '1',
          result: {
            SafeGasPrice: '20',
            ProposeGasPrice: '25',
            FastGasPrice: '30'
          }
        })
      });

      const options = {
        strategy: 'speed' as const,
        ethPriceUsd: 3000
      };

      const result = await gasOptimizer.optimizeGas(mockTransaction, options);

      expect(result).toBeDefined();
      expect(result.gasLimit).toBeDefined();
    });

    it('should use cost strategy for cheaper transactions', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({
          status: '1',
          result: {
            SafeGasPrice: '20',
            ProposeGasPrice: '25',
            FastGasPrice: '30'
          }
        })
      });

      const options = {
        strategy: 'cost' as const,
        ethPriceUsd: 3000
      };

      const result = await gasOptimizer.optimizeGas(mockTransaction, options);

      expect(result).toBeDefined();
      expect(result.gasLimit).toBeDefined();
    });

    it('should fallback to default when gas oracle fails', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Oracle Error'));

      const options = {
        strategy: 'balanced' as const,
        ethPriceUsd: 3000
      };

      const result = await gasOptimizer.optimizeGas(mockTransaction, options);

      expect(result).toBeDefined();
      expect(result.gasLimit).toBe('23100'); // 21000 * 1.1 (default multiplier)
      expect(result.gasPrice || result.maxFeePerGas).toBeDefined();
    });

    it('should apply gas limit multiplier', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({
          status: '1',
          result: {
            SafeGasPrice: '20',
            ProposeGasPrice: '25',
            FastGasPrice: '30'
          }
        })
      });

      const options = {
        strategy: 'balanced' as const,
        gasLimitMultiplier: 1.2,
        ethPriceUsd: 3000
      };

      const result = await gasOptimizer.optimizeGas(mockTransaction, options);

      expect(result.gasLimit).toBe('25200'); // 21000 * 1.2
    });

    it('should handle EIP-1559 transactions', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({
          status: '1',
          result: {
            SafeGasPrice: '20',
            ProposeGasPrice: '25',
            FastGasPrice: '30'
          }
        })
      });

      const options = {
        strategy: 'balanced' as const,
        maxPriorityFeeGwei: 3,
        ethPriceUsd: 3000
      };

      const result = await gasOptimizer.optimizeGas(mockTransaction, options);

      expect(result).toBeDefined();
      expect(result.maxFeePerGas || result.gasPrice).toBeDefined();
    });
  });

  describe('optimizeBatchGas', () => {
    it('should optimize gas for multiple transactions', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({
          status: '1',
          result: {
            SafeGasPrice: '20',
            ProposeGasPrice: '25',
            FastGasPrice: '30'
          }
        })
      });

      const transactions = [
        mockTransaction,
        { ...mockTransaction, gasLimit: '50000' }
      ];

      const options = {
        strategy: 'balanced' as const,
        ethPriceUsd: 3000
      };

      const results = await gasOptimizer.optimizeBatchGas(transactions, options);

      expect(results).toBeDefined();
      expect(results.length).toBe(2);
      expect(results[0]?.gasLimit).toBeDefined();
      expect(results[1]?.gasLimit).toBeDefined();
    });
  });

  describe('getNetworkGasInfo', () => {
    it('should get gas info from oracle', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({
          status: '1',
          result: {
            SafeGasPrice: '20',
            ProposeGasPrice: '25',
            FastGasPrice: '30'
          }
        })
      });

      const gasInfo = await gasOptimizer.getNetworkGasInfo(1); // Ethereum

      expect(gasInfo).toBeDefined();
      expect(gasInfo.chainId).toBe(1);
      expect(gasInfo.supportsEIP1559).toBe(true);
      expect(gasInfo.safe).toBeDefined();
      expect(gasInfo.standard).toBeDefined();
      expect(gasInfo.fast).toBeDefined();
    });

    it('should return default gas info for unsupported chains', async () => {
      const gasInfo = await gasOptimizer.getNetworkGasInfo(999); // Unsupported chain

      expect(gasInfo).toBeDefined();
      expect(gasInfo.chainId).toBe(999);
      expect(gasInfo.safe).toBeDefined();
      expect(gasInfo.standard).toBeDefined();
      expect(gasInfo.fast).toBeDefined();
    });

    it('should cache gas info to avoid repeated requests', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({
          status: '1',
          result: {
            SafeGasPrice: '20',
            ProposeGasPrice: '25',
            FastGasPrice: '30'
          }
        })
      } as any);

      // First call - clear any existing cache
      const firstResult = await gasOptimizer.getNetworkGasInfo(1);
      
      // Reset the spy to count only subsequent calls
      fetchSpy.mockClear();
      
      // Second call (should use cache)
      const secondResult = await gasOptimizer.getNetworkGasInfo(1);

      // Should not make additional requests due to caching
      expect(fetchSpy).toHaveBeenCalledTimes(0);
      expect(firstResult).toEqual(secondResult);
      
      fetchSpy.mockRestore();
    });
  });

  describe('estimateTransactionGas', () => {
    const transactionForEstimate = {
      to: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
      data: '0x',
      value: '0',
      chainId: 1
    };

    it('should return fallback gas estimate when no RPC provided', async () => {
      const gasEstimate = await gasOptimizer.estimateTransactionGas(transactionForEstimate);

      expect(gasEstimate).toBe('21000'); // Simple transfer fallback
    });

    it('should estimate gas based on data complexity', async () => {
      const complexTransaction = {
        ...transactionForEstimate,
        data: '0x' + 'a'.repeat(500) // Complex transaction data
      };

      const gasEstimate = await gasOptimizer.estimateTransactionGas(complexTransaction);

      expect(gasEstimate).toBe('150000'); // Complex contract call fallback
    });

    it('should estimate gas for very complex transactions', async () => {
      const veryComplexTransaction = {
        ...transactionForEstimate,
        data: '0x' + 'a'.repeat(2000) // Very complex transaction data
      };

      const gasEstimate = await gasOptimizer.estimateTransactionGas(veryComplexTransaction);

      expect(gasEstimate).toBe('300000'); // Very complex contract call fallback
    });
  });

  describe('calculateBatchCost', () => {
    it('should calculate total cost for multiple estimations', () => {
      const estimations = [
        {
          gasLimit: '21000',
          gasPrice: '25000000000', // 25 Gwei
          estimatedCostWei: '525000000000000', // 21000 * 25 Gwei
          estimatedCostUsd: '1.58'
        },
        {
          gasLimit: '50000',
          gasPrice: '25000000000',
          estimatedCostWei: '1250000000000000', // 50000 * 25 Gwei
          estimatedCostUsd: '3.75'
        }
      ];

      const result = gasOptimizer.calculateBatchCost(estimations);

      expect(result.totalCostWei).toBe('1775000000000000'); // Sum of both
      expect(result.totalCostUsd).toBe('5.33'); // Sum of USD costs
      expect(result.avgGasPrice).toBe('25000000000'); // Average gas price
    });

    it('should handle estimations without USD pricing', () => {
      const estimations = [
        {
          gasLimit: '21000',
          gasPrice: '25000000000',
          estimatedCostWei: '525000000000000'
        }
      ];

      const result = gasOptimizer.calculateBatchCost(estimations);

      expect(result.totalCostWei).toBe('525000000000000');
      expect(result.totalCostUsd).toBeUndefined();
      expect(result.avgGasPrice).toBe('25000000000');
    });

    it('should handle empty estimations array', () => {
      const result = gasOptimizer.calculateBatchCost([]);

      expect(result.totalCostWei).toBe('0');
      expect(result.totalCostUsd).toBeUndefined();
      expect(result.avgGasPrice).toBe('0');
    });
  });
});