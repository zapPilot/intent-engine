const TransactionBuilder = require('../src/transactions/TransactionBuilder');
const { ethers } = require('ethers');

jest.mock('../src/config/tokenConfig');

describe('TransactionBuilder', () => {
  let builder;

  beforeEach(() => {
    builder = new TransactionBuilder();
  });

  describe('addTransaction', () => {
    it('should add a valid transaction', () => {
      const tx = {
        to: '0x1234567890123456789012345678901234567890',
        value: '1000000000000000000',
        data: '0x123456',
        description: 'Test transaction',
        gasLimit: '100000',
      };

      builder.addTransaction(tx);

      expect(builder.transactions).toHaveLength(1);
      expect(builder.transactions[0]).toEqual({
        to: tx.to,
        value: tx.value,
        data: tx.data,
        description: tx.description,
        gasLimit: tx.gasLimit,
      });
    });

    it('should add transaction with default values', () => {
      const tx = {
        to: '0x1234567890123456789012345678901234567890',
      };

      builder.addTransaction(tx);

      expect(builder.transactions[0]).toEqual({
        to: tx.to,
        value: '0',
        description: 'Transaction',
        gasLimit: '21000',
      });
    });

    it('should throw error for invalid address', () => {
      const tx = {
        to: 'invalid-address',
      };

      expect(() => builder.addTransaction(tx)).toThrow(
        'Invalid transaction: to address must be valid Ethereum address'
      );
    });

    it('should throw error for missing address', () => {
      const tx = {
        value: '1000',
      };

      expect(() => builder.addTransaction(tx)).toThrow(
        'Invalid transaction: to address must be valid Ethereum address'
      );
    });

    it('should support method chaining', () => {
      const result = builder.addTransaction({
        to: '0x1234567890123456789012345678901234567890',
      });

      expect(result).toBe(builder);
    });
  });

  describe('addApprove', () => {
    it('should add ERC-20 approve transaction', () => {
      const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const spenderAddress = '0x1234567890123456789012345678901234567890';
      const amount = '1000000000';

      builder.addApprove(tokenAddress, spenderAddress, amount);

      expect(builder.transactions).toHaveLength(1);
      const tx = builder.transactions[0];
      expect(tx.to).toBe(tokenAddress);
      expect(tx.value).toBe('0');
      expect(tx.description).toBe(`Approve ${tokenAddress} for ${spenderAddress}`);
      expect(tx.gasLimit).toBe('30000');
      expect(tx.data).toBeDefined();
      expect(tx.data).toMatch(/^0x/); // Should be hex encoded
    });
  });

  describe('addSwap', () => {
    it('should add swap transaction', () => {
      const swapData = {
        to: '0x1234567890123456789012345678901234567890',
        data: '0xabcdef',
        value: '1000000000000000000',
        gasLimit: '200000',
      };
      const description = 'Swap USDC to ETH';

      builder.addSwap(swapData, description);

      expect(builder.transactions).toHaveLength(1);
      const tx = builder.transactions[0];
      expect(tx.to).toBe(swapData.to);
      expect(tx.data).toBe(swapData.data);
      expect(tx.value).toBe(swapData.value);
      expect(tx.description).toBe(description);
      expect(tx.gasLimit).toBe(swapData.gasLimit);
    });

    it('should use default description if not provided', () => {
      const swapData = {
        to: '0x1234567890123456789012345678901234567890',
        data: '0xabcdef',
      };

      builder.addSwap(swapData);

      expect(builder.transactions[0].description).toBe('Swap transaction');
    });
  });

  describe('addTransfer', () => {
    it('should add ETH transfer transaction', () => {
      const recipient = '0x1234567890123456789012345678901234567890';
      const amount = '1000000000000000000';

      builder.addTransfer(recipient, amount);

      expect(builder.transactions).toHaveLength(1);
      const tx = builder.transactions[0];
      expect(tx.to).toBe(recipient);
      expect(tx.value).toBe(amount);
      expect(tx.description).toBe(`Transfer ${amount} wei to ${recipient}`);
      expect(tx.gasLimit).toBe('21000');
      expect(tx.data).toBeUndefined();
    });

    it('should add ERC-20 transfer transaction', () => {
      const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const recipient = '0x1234567890123456789012345678901234567890';
      const amount = '1000000';

      builder.addTransfer(recipient, amount, tokenAddress);

      expect(builder.transactions).toHaveLength(1);
      const tx = builder.transactions[0];
      expect(tx.to).toBe(tokenAddress);
      expect(tx.value).toBe('0');
      expect(tx.description).toBe(`Transfer tokens from ${tokenAddress} to ${recipient}`);
      expect(tx.gasLimit).toBe('50000');
      expect(tx.data).toBeDefined();
      expect(tx.data).toMatch(/^0x/);
    });
  });

  describe('addUnwrap', () => {
    it('should add unwrap WETH transaction for mainnet', () => {
      const amount = '1000000000000000000';
      const chainId = 1;

      builder.addUnwrap(amount, chainId);

      expect(builder.transactions).toHaveLength(1);
      const tx = builder.transactions[0];
      expect(tx.to).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'); // WETH mainnet
      expect(tx.value).toBe('0');
      expect(tx.description).toBe(`Unwrap ${amount} WETH`);
      expect(tx.gasLimit).toBe('30000');
      expect(tx.data).toBeDefined();
    });

    it('should add unwrap WETH transaction for Arbitrum', () => {
      const amount = '1000000000000000000';
      const chainId = 42161;

      builder.addUnwrap(amount, chainId);

      expect(builder.transactions[0].to).toBe('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1');
    });

    it('should throw error for unsupported chain', () => {
      const amount = '1000000000000000000';
      const chainId = 999;

      expect(() => builder.addUnwrap(amount, chainId)).toThrow(
        'Unsupported chain ID: 999'
      );
    });
  });

  describe('addWrap', () => {
    it('should add wrap ETH transaction for mainnet', () => {
      const amount = '1000000000000000000';
      const chainId = 1;

      builder.addWrap(amount, chainId);

      expect(builder.transactions).toHaveLength(1);
      const tx = builder.transactions[0];
      expect(tx.to).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'); // WETH mainnet
      expect(tx.value).toBe(amount);
      expect(tx.description).toBe(`Wrap ${amount} wei to WETH`);
      expect(tx.gasLimit).toBe('30000');
      expect(tx.data).toBeDefined();
    });
  });

  describe('build', () => {
    it('should return all transactions', () => {
      builder
        .addTransaction({
          to: '0x1234567890123456789012345678901234567890',
          value: '1000',
        })
        .addTransaction({
          to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          value: '2000',
        });

      const result = builder.build();

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe('1000');
      expect(result[1].value).toBe('2000');
    });

    it('should return empty array when no transactions', () => {
      const result = builder.build();
      expect(result).toEqual([]);
    });
  });

  describe('reset', () => {
    it('should clear all transactions', () => {
      builder
        .addTransaction({
          to: '0x1234567890123456789012345678901234567890',
        })
        .addTransaction({
          to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        });

      expect(builder.transactions).toHaveLength(2);

      builder.reset();

      expect(builder.transactions).toHaveLength(0);
    });

    it('should support method chaining', () => {
      const result = builder.reset();
      expect(result).toBe(builder);
    });
  });

  describe('complex transaction flows', () => {
    it('should build approve and swap flow', () => {
      const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const routerAddress = '0x1234567890123456789012345678901234567890';
      const amount = '1000000000';
      const swapData = {
        to: routerAddress,
        data: '0xswapdata',
        value: '0',
      };

      builder
        .addApprove(tokenAddress, routerAddress, amount)
        .addSwap(swapData, 'Swap USDC to ETH');

      const transactions = builder.build();

      expect(transactions).toHaveLength(2);
      expect(transactions[0].description).toContain('Approve');
      expect(transactions[1].description).toBe('Swap USDC to ETH');
    });

    it('should build wrap and transfer flow', () => {
      const amount = '1000000000000000000';
      const recipient = '0x1234567890123456789012345678901234567890';
      const chainId = 1;

      builder
        .addWrap(amount, chainId)
        .addTransfer(recipient, amount, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');

      const transactions = builder.build();

      expect(transactions).toHaveLength(2);
      expect(transactions[0].description).toContain('Wrap');
      expect(transactions[1].description).toContain('Transfer tokens');
    });
  });
});