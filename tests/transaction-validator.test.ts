import { transactionValidator } from '../src/utils/TransactionValidator';
import { Transaction, IntentRequest } from '../src/types';

describe('TransactionValidator', () => {
  const validTransaction: Transaction = {
    to: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
    data: '0x',
    value: '1000000000000000000',
    gasLimit: '21000',
    chainId: 1
  };

  const validationContext = {
    userAddress: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
    chainId: 1
  };

  const validIntentRequest: IntentRequest = {
    action: 'swap',
    params: {
      amount: '1000000000000000000',
      fromToken: 'ETH',
      toToken: '0xA0b86a33E6417C83b20B44eb26a3f1b1B3b02b7B', // Fixed: proper checksum address
      chainId: 1,
      slippageTolerance: 1,
      deadline: Math.floor(Date.now() / 1000) + 3600
    },
    userAddress: '0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571',
    preferences: {
      gasOptimization: 'balanced'
    }
  };

  describe('validateTransaction', () => {
    it('should validate a correct transaction', async () => {
      const result = await transactionValidator.validateTransaction(validTransaction, validationContext);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toEqual(expect.any(Array));
    });

    it('should reject transaction with invalid to address', async () => {
      const invalidTransaction = {
        ...validTransaction,
        to: 'invalid-address'
      };

      const result = await transactionValidator.validateTransaction(invalidTransaction, validationContext);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_TO_ADDRESS');
      expect(result.errors[0]?.severity).toBe('critical');
    });

    it('should reject transaction with missing required fields', async () => {
      const invalidTransaction = {
        ...validTransaction,
        to: '',
        data: undefined as any,
        gasLimit: '',
        chainId: 0
      };

      const result = await transactionValidator.validateTransaction(invalidTransaction, validationContext);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      
      // The validator checks for empty string, not missing field
      expect(result.errors.some(e => e.code === 'MISSING_TO_ADDRESS' || e.code === 'INVALID_TO_ADDRESS')).toBe(true);
      expect(result.errors.some(e => e.code === 'MISSING_DATA')).toBe(true);
      expect(result.errors.some(e => e.code === 'MISSING_GAS_LIMIT')).toBe(true);
    });

    it('should reject transaction with invalid gas parameters', async () => {
      const invalidTransaction = {
        ...validTransaction,
        gasLimit: '0' // Invalid gas limit
      };

      const result = await transactionValidator.validateTransaction(invalidTransaction, validationContext);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'GAS_LIMIT_TOO_LOW')).toBe(true);
    });

    it('should reject transaction with extremely high gas limit', async () => {
      const invalidTransaction = {
        ...validTransaction,
        gasLimit: '20000000' // 20M gas - too high
      };

      const result = await transactionValidator.validateTransaction(invalidTransaction, validationContext);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'GAS_LIMIT_TOO_HIGH')).toBe(true);
    });

    it('should reject transaction with negative value', async () => {
      const invalidTransaction = {
        ...validTransaction,
        value: '-1'
      };

      const result = await transactionValidator.validateTransaction(invalidTransaction, validationContext);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'NEGATIVE_VALUE')).toBe(true);
    });

    it('should reject transaction with invalid data format', async () => {
      const invalidTransaction = {
        ...validTransaction,
        data: 'not-hex-data'
      };

      const result = await transactionValidator.validateTransaction(invalidTransaction, validationContext);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_DATA_FORMAT')).toBe(true);
    });

    it('should reject transaction with chain ID mismatch', async () => {
      const invalidTransaction = {
        ...validTransaction,
        chainId: 137 // Different from context chain ID
      };

      const result = await transactionValidator.validateTransaction(invalidTransaction, validationContext);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'CHAIN_ID_MISMATCH')).toBe(true);
    });

    it('should warn about very high transaction value', async () => {
      const highValueTransaction = {
        ...validTransaction,
        value: '2000000000000000000000000' // 2M ETH
      };

      const result = await transactionValidator.validateTransaction(highValueTransaction, validationContext);

      expect(result.warnings.some(w => w.code === 'VERY_HIGH_VALUE')).toBe(true);
    });

    it('should warn about zero address', async () => {
      const zeroAddressTransaction = {
        ...validTransaction,
        to: '0x0000000000000000000000000000000000000000'
      };

      const result = await transactionValidator.validateTransaction(zeroAddressTransaction, validationContext);

      expect(result.warnings.some(w => w.code === 'ZERO_ADDRESS_WARNING')).toBe(true);
    });

    it('should warn about self transaction', async () => {
      const selfTransaction = {
        ...validTransaction,
        to: validationContext.userAddress
      };

      const result = await transactionValidator.validateTransaction(selfTransaction, validationContext);

      expect(result.warnings.some(w => w.code === 'SELF_TRANSACTION')).toBe(true);
    });

    it('should warn about large transaction data', async () => {
      const largeDataTransaction = {
        ...validTransaction,
        data: '0x' + 'a'.repeat(150000) // Large data
      };

      const result = await transactionValidator.validateTransaction(largeDataTransaction, validationContext);

      expect(result.warnings.some(w => w.code === 'LARGE_DATA_SIZE')).toBe(true);
    });

    it('should validate EIP-1559 transactions correctly', async () => {
      const eip1559Transaction: Transaction = {
        ...validTransaction,
        type: 2,
        maxFeePerGas: '30000000000', // 30 Gwei
        maxPriorityFeePerGas: '2000000000' // 2 Gwei
      };
      delete eip1559Transaction.gasPrice;

      const result = await transactionValidator.validateTransaction(eip1559Transaction, validationContext);

      expect(result.isValid).toBe(true);
    });

    it('should reject EIP-1559 transaction with invalid fee structure', async () => {
      const invalidEIP1559Transaction: Transaction = {
        ...validTransaction,
        type: 2,
        maxFeePerGas: '20000000000', // 20 Gwei
        maxPriorityFeePerGas: '30000000000' // 30 Gwei - higher than max fee
      };
      delete invalidEIP1559Transaction.gasPrice;

      const result = await transactionValidator.validateTransaction(invalidEIP1559Transaction, validationContext);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_EIP1559_FEES')).toBe(true);
    });

    it('should warn about high gas fees', async () => {
      const highFeeTransaction = {
        ...validTransaction,
        maxFeePerGas: '150000000000', // 150 Gwei - very high
        maxPriorityFeePerGas: '10000000000' // 10 Gwei
      };

      const result = await transactionValidator.validateTransaction(highFeeTransaction, validationContext);

      expect(result.warnings.some(w => w.code === 'HIGH_GAS_FEE')).toBe(true);
    });
  });

  describe('validateTransactionBatch', () => {
    it('should validate multiple transactions', async () => {
      const transactions = [
        validTransaction,
        { ...validTransaction, gasLimit: '50000' }
      ];

      const results = await transactionValidator.validateTransactionBatch(transactions, validationContext);

      expect(results).toHaveLength(2);
      expect(results[0]?.isValid).toBe(true);
      expect(results[1]?.isValid).toBe(true);
    });

    it('should validate nonce ordering in batch', async () => {
      const transactions = [
        { ...validTransaction, nonce: 1 },
        { ...validTransaction, nonce: 0 } // Wrong order
      ];

      const results = await transactionValidator.validateTransactionBatch(transactions, validationContext);

      expect(results[1]?.errors.some(e => e.code === 'INVALID_NONCE_SEQUENCE')).toBe(true);
    });
  });

  describe('validateIntentRequest', () => {
    it('should validate a correct intent request', () => {
      const result = transactionValidator.validateIntentRequest(validIntentRequest);

      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject intent with invalid action', () => {
      const invalidIntent = {
        ...validIntentRequest,
        action: 'invalid-action' as any
      };

      const result = transactionValidator.validateIntentRequest(invalidIntent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_ACTION')).toBe(true);
    });

    it('should reject intent with invalid user address', () => {
      const invalidIntent = {
        ...validIntentRequest,
        userAddress: 'invalid-address'
      };

      const result = transactionValidator.validateIntentRequest(invalidIntent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_USER_ADDRESS')).toBe(true);
    });

    it('should reject intent with invalid amount', () => {
      const invalidIntent = {
        ...validIntentRequest,
        params: {
          ...validIntentRequest.params,
          amount: '0' // Invalid amount
        }
      };

      const result = transactionValidator.validateIntentRequest(invalidIntent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_AMOUNT')).toBe(true);
    });

    it('should reject intent with invalid amount format', () => {
      const invalidIntent = {
        ...validIntentRequest,
        params: {
          ...validIntentRequest.params,
          amount: 'not-a-number'
        }
      };

      const result = transactionValidator.validateIntentRequest(invalidIntent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_AMOUNT_FORMAT')).toBe(true);
    });

    it('should reject intent with invalid token addresses', () => {
      const invalidIntent = {
        ...validIntentRequest,
        params: {
          ...validIntentRequest.params,
          fromToken: 'invalid-token',
          toToken: 'invalid-token'
        }
      };

      const result = transactionValidator.validateIntentRequest(invalidIntent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_FROM_TOKEN')).toBe(true);
      expect(result.errors.some(e => e.code === 'INVALID_TO_TOKEN')).toBe(true);
    });

    it('should reject intent with invalid slippage tolerance', () => {
      const invalidIntent = {
        ...validIntentRequest,
        params: {
          ...validIntentRequest.params,
          slippageTolerance: 100 // Too high
        }
      };

      const result = transactionValidator.validateIntentRequest(invalidIntent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_SLIPPAGE')).toBe(true);
    });

    it('should warn about high slippage tolerance', () => {
      const highSlippageIntent = {
        ...validIntentRequest,
        params: {
          ...validIntentRequest.params,
          slippageTolerance: 10 // High but valid
        }
      };

      const result = transactionValidator.validateIntentRequest(highSlippageIntent);

      expect(result.warnings.some(w => w.code === 'HIGH_SLIPPAGE')).toBe(true);
    });

    it('should reject intent with expired deadline', () => {
      const expiredIntent = {
        ...validIntentRequest,
        params: {
          ...validIntentRequest.params,
          deadline: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
        }
      };

      const result = transactionValidator.validateIntentRequest(expiredIntent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'EXPIRED_DEADLINE')).toBe(true);
    });

    it('should reject intent with invalid gas optimization strategy', () => {
      const invalidIntent: IntentRequest = {
        ...validIntentRequest,
        preferences: {
          gasOptimization: 'invalid-strategy' as any
        }
      };

      const result = transactionValidator.validateIntentRequest(invalidIntent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_GAS_STRATEGY')).toBe(true);
    });

    it('should reject intent with invalid bridge provider', () => {
      const invalidIntent: IntentRequest = {
        ...validIntentRequest,
        preferences: {
          gasOptimization: 'balanced',
          bridgeProvider: 'invalid-bridge' as any
        }
      };

      const result = transactionValidator.validateIntentRequest(invalidIntent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_BRIDGE_PROVIDER')).toBe(true);
    });

    it('should accept intent without preferences', () => {
      const intentWithoutPreferences: IntentRequest = {
        action: validIntentRequest.action,
        params: validIntentRequest.params,
        userAddress: validIntentRequest.userAddress
      };

      const result = transactionValidator.validateIntentRequest(intentWithoutPreferences);

      expect(result.isValid).toBe(true);
    });
  });
});