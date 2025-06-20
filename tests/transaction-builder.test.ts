import { transactionBuilder } from '../src/services/TransactionBuilder';
import { IntentRequest, RouteInfo } from '../src/types';

describe('TransactionBuilder', () => {
  const mockIntentRequest: IntentRequest = {
    action: 'swap',
    params: {
      amount: '1000000000000000000', // 1 ETH in wei
      fromToken: 'ETH',
      toToken: '0xA0b86a33E6441E6b2bDB06C2A4b2d117B5Dc8F85', // Example token
      chainId: 1,
      slippageTolerance: 1,
      deadline: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
    },
    userAddress: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571'
  };

  const mockRoute: RouteInfo = {
    provider: '1inch',
    route: ['ETH', '0xA0b86a33E6441E6b2bDB06C2A4b2d117B5Dc8F85'],
    amountIn: '1000000000000000000',
    amountOut: '2000000000000000000000', // 2000 tokens
    gasEstimate: '150000',
    priceImpact: '0.5'
  };

  describe('buildTransactions', () => {
    it('should build swap transactions successfully', async () => {
      const params = {
        intent: mockIntentRequest,
        routes: [mockRoute]
      };

      const transactions = await transactionBuilder.buildTransactions(params);

      expect(transactions).toBeDefined();
      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions.length).toBeGreaterThan(0);

      // Check first transaction (swap)
      const swapTx = transactions[transactions.length - 1]; // Last transaction should be the swap
      expect(swapTx?.chainId).toBe(1);
      expect(swapTx?.gasLimit).toBe('150000');
      expect(swapTx?.metadata?.action).toBe('swap');
    });

    it('should handle zapIn action', async () => {
      const zapInIntent: IntentRequest = {
        ...mockIntentRequest,
        action: 'zapIn'
      };

      const params = {
        intent: zapInIntent,
        routes: []
      };

      const transactions = await transactionBuilder.buildTransactions(params);

      expect(transactions).toBeDefined();
      expect(transactions.length).toBe(1);
      expect(transactions[0]?.metadata?.action).toBe('zapIn');
      expect(transactions[0]?.gasLimit).toBe('300000');
    });

    it('should handle zapOut action', async () => {
      const zapOutIntent: IntentRequest = {
        ...mockIntentRequest,
        action: 'zapOut'
      };

      const params = {
        intent: zapOutIntent,
        routes: []
      };

      const transactions = await transactionBuilder.buildTransactions(params);

      expect(transactions).toBeDefined();
      expect(transactions.length).toBe(1);
      expect(transactions[0]?.metadata?.action).toBe('zapOut');
      expect(transactions[0]?.gasLimit).toBe('400000');
    });

    it('should handle rebalance action', async () => {
      const rebalanceIntent: IntentRequest = {
        ...mockIntentRequest,
        action: 'rebalance'
      };

      const params = {
        intent: rebalanceIntent,
        routes: []
      };

      const transactions = await transactionBuilder.buildTransactions(params);

      expect(transactions).toBeDefined();
      expect(transactions.length).toBe(1);
      expect(transactions[0]?.metadata?.action).toBe('rebalance');
      expect(transactions[0]?.gasLimit).toBe('500000');
    });

    it('should handle bridge action', async () => {
      const bridgeIntent: IntentRequest = {
        ...mockIntentRequest,
        action: 'bridge'
      };

      const params = {
        intent: bridgeIntent,
        routes: []
      };

      const transactions = await transactionBuilder.buildTransactions(params);

      expect(transactions).toBeDefined();
      expect(transactions.length).toBe(1);
      expect(transactions[0]?.metadata?.action).toBe('bridge');
      expect(transactions[0]?.gasLimit).toBe('200000');
    });

    it('should throw error for unsupported action', async () => {
      const invalidIntent = {
        ...mockIntentRequest,
        action: 'invalid' as any
      };

      const params = {
        intent: invalidIntent,
        routes: []
      };

      await expect(transactionBuilder.buildTransactions(params))
        .rejects.toThrow('Unsupported action: invalid');
    });

    it('should throw error when no route available for swap', async () => {
      const params = {
        intent: mockIntentRequest,
        routes: [] // No routes
      };

      await expect(transactionBuilder.buildTransactions(params))
        .rejects.toThrow('No route available for swap');
    });
  });

  describe('estimateGas', () => {
    it('should calculate total gas for multiple transactions', async () => {
      const transactions = [
        {
          to: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
          data: '0x',
          value: '0',
          gasLimit: '21000',
          chainId: 1
        },
        {
          to: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
          data: '0x',
          value: '0',
          gasLimit: '50000',
          chainId: 1
        }
      ];

      const totalGas = await transactionBuilder.estimateGas(transactions);
      expect(totalGas).toBe('71000'); // 21000 + 50000
    });

    it('should return 0 for empty transaction array', async () => {
      const totalGas = await transactionBuilder.estimateGas([]);
      expect(totalGas).toBe('0');
    });
  });

  describe('validateTransaction', () => {
    const validTransaction = {
      to: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
      data: '0x',
      value: '1000000000000000000',
      gasLimit: '21000',
      chainId: 1
    };

    it('should validate a correct transaction', () => {
      const isValid = transactionBuilder.validateTransaction(validTransaction);
      expect(isValid).toBe(true);
    });

    it('should reject transaction with invalid address', () => {
      const invalidTx = {
        ...validTransaction,
        to: 'invalid-address'
      };

      const isValid = transactionBuilder.validateTransaction(invalidTx);
      expect(isValid).toBe(false);
    });

    it('should reject transaction with invalid data', () => {
      const invalidTx = {
        ...validTransaction,
        data: 'not-hex'
      };

      const isValid = transactionBuilder.validateTransaction(invalidTx);
      expect(isValid).toBe(false);
    });

    it('should reject transaction with negative value', () => {
      const invalidTx = {
        ...validTransaction,
        value: '-1'
      };

      const isValid = transactionBuilder.validateTransaction(invalidTx);
      expect(isValid).toBe(false);
    });

    it('should reject transaction with zero gas limit', () => {
      const invalidTx = {
        ...validTransaction,
        gasLimit: '0'
      };

      const isValid = transactionBuilder.validateTransaction(invalidTx);
      expect(isValid).toBe(false);
    });
  });

  describe('optimizeForBatching', () => {
    it('should return transactions as-is for now', () => {
      const transactions = [
        {
          to: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
          data: '0x',
          value: '0',
          gasLimit: '21000',
          chainId: 1
        }
      ];

      const optimized = transactionBuilder.optimizeForBatching(transactions);
      expect(optimized).toEqual(transactions);
    });
  });
});