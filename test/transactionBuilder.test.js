const TransactionBuilder = require('../src/transactions/TransactionBuilder');

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
      expect(tx.description).toBe(
        `Approve ${tokenAddress} for ${spenderAddress}`
      );
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
      expect(tx.gasLimit).toBe('400000'); // gasLimit is doubled in addSwap
    });

    it('should use default description if not provided', () => {
      const swapData = {
        to: '0x1234567890123456789012345678901234567890',
        data: '0xabcdef',
      };

      builder.addSwap(swapData);

      expect(builder.transactions[0].description).toBe('Token swap');
    });
  });

  describe('addETHTransfer', () => {
    it('should add ETH transfer transaction', () => {
      const recipient = '0x1234567890123456789012345678901234567890';
      const amount = '1000000000000000000';

      builder.addETHTransfer(recipient, amount);

      expect(builder.transactions).toHaveLength(1);
      const tx = builder.transactions[0];
      expect(tx.to).toBe(recipient);
      expect(tx.value).toBe(amount);
      expect(tx.description).toBe('ETH transfer');
      expect(tx.gasLimit).toBe('21000');
      expect(tx.data).toBeUndefined();
    });
  });

  describe('addERC20Transfer', () => {
    it('should add ERC-20 transfer transaction', () => {
      const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const recipient = '0x1234567890123456789012345678901234567890';
      const amount = '1000000';

      builder.addERC20Transfer(tokenAddress, recipient, amount);

      expect(builder.transactions).toHaveLength(1);
      const tx = builder.transactions[0];
      expect(tx.to).toBe(tokenAddress);
      expect(tx.value).toBe('0');
      expect(tx.description).toContain('ERC20 transfer');
      expect(tx.gasLimit).toBe('65000');
      expect(tx.data).toBeDefined();
      expect(tx.data).toMatch(/^0x/);
    });
  });

  describe('addWETHDeposit', () => {
    it('should add WETH deposit transaction for mainnet', () => {
      const amount = '1000000000000000000';
      const chainId = 1;

      // Mock TokenConfigService.getWETHAddress
      const TokenConfigService =
        require('../src/config/tokenConfig').TokenConfigService;
      TokenConfigService.getWETHAddress = jest
        .fn()
        .mockReturnValue('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');

      builder.addWETHDeposit(chainId, amount);

      expect(builder.transactions).toHaveLength(1);
      const tx = builder.transactions[0];
      expect(tx.to).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'); // WETH mainnet
      expect(tx.value).toBe(amount);
      expect(tx.description).toBe('WETH deposit (ETH -> WETH)');
      expect(tx.gasLimit).toBe('50000');
      expect(tx.data).toBeDefined();
    });

    it('should throw error for unsupported chain', () => {
      const amount = '1000000000000000000';
      const chainId = 999;

      // Mock TokenConfigService.getWETHAddress to return null
      const TokenConfigService =
        require('../src/config/tokenConfig').TokenConfigService;
      TokenConfigService.getWETHAddress = jest.fn().mockReturnValue(null);

      expect(() => builder.addWETHDeposit(chainId, amount)).toThrow(
        'WETH not supported on chain 999'
      );
    });
  });

  describe('getTransactions', () => {
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

      const result = builder.getTransactions();

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe('1000');
      expect(result[1].value).toBe('2000');
    });

    it('should return empty array when no transactions', () => {
      const result = builder.getTransactions();
      expect(result).toEqual([]);
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

      const transactions = builder.getTransactions();

      expect(transactions).toHaveLength(2);
      expect(transactions[0].description).toContain('Approve');
      expect(transactions[1].description).toBe('Swap USDC to ETH');
    });

    it('should build deposit and transfer flow', () => {
      const amount = '1000000000000000000';
      const recipient = '0x1234567890123456789012345678901234567890';
      const chainId = 1;
      const wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

      // Mock TokenConfigService.getWETHAddress
      const TokenConfigService =
        require('../src/config/tokenConfig').TokenConfigService;
      TokenConfigService.getWETHAddress = jest
        .fn()
        .mockReturnValue(wethAddress);

      builder
        .addWETHDeposit(chainId, amount)
        .addERC20Transfer(wethAddress, recipient, amount);

      const transactions = builder.getTransactions();

      expect(transactions).toHaveLength(2);
      expect(transactions[0].description).toContain('WETH deposit');
      expect(transactions[1].description).toContain('ERC20 transfer');
    });
  });

  describe('clear', () => {
    it('should clear all transactions', () => {
      builder
        .addTransaction({
          to: '0x1234567890123456789012345678901234567890',
          value: '1000',
        })
        .addTransaction({
          to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          value: '2000',
        });

      expect(builder.getTransactionCount()).toBe(2);

      const result = builder.clear();

      expect(builder.getTransactionCount()).toBe(0);
      expect(builder.getTransactions()).toEqual([]);
      expect(result).toBe(builder); // Should support chaining
    });
  });

  describe('getTransactionCount', () => {
    it('should return correct transaction count', () => {
      expect(builder.getTransactionCount()).toBe(0);

      builder.addTransaction({
        to: '0x1234567890123456789012345678901234567890',
      });

      expect(builder.getTransactionCount()).toBe(1);

      builder.addTransaction({
        to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      });

      expect(builder.getTransactionCount()).toBe(2);
    });
  });

  describe('insertTransactionsAtIndices', () => {
    beforeEach(() => {
      // Add some initial transactions
      builder
        .addTransaction({
          to: '0x1111111111111111111111111111111111111111',
          description: 'Transaction 1',
        })
        .addTransaction({
          to: '0x2222222222222222222222222222222222222222',
          description: 'Transaction 2',
        })
        .addTransaction({
          to: '0x3333333333333333333333333333333333333333',
          description: 'Transaction 3',
        });
    });

    it('should insert transactions at specified indices', () => {
      const newTransactions = [
        {
          to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          value: '100',
          description: 'Insert A',
          gasLimit: '21000',
        },
        {
          to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          value: '200',
          description: 'Insert B',
          gasLimit: '21000',
        },
      ];

      builder.insertTransactionsAtIndices(newTransactions, [1, 3]);

      const transactions = builder.getTransactions();
      expect(transactions).toHaveLength(5);
      expect(transactions[1].description).toBe('Insert A');
      expect(transactions[4].description).toBe('Insert B');
    });

    it('should throw error if transaction count does not match insertion points', () => {
      const newTransactions = [
        {
          to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          value: '100',
        },
      ];

      expect(() =>
        builder.insertTransactionsAtIndices(newTransactions, [1, 2])
      ).toThrow('Number of transactions must match number of insertion points');
    });

    it('should throw error for invalid insertion indices', () => {
      const newTransactions = [
        {
          to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          value: '100',
        },
        {
          to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          value: '200',
        },
      ];

      expect(() =>
        builder.insertTransactionsAtIndices(newTransactions, [-1, 5])
      ).toThrow('Invalid insertion indices: -1, 5');
    });

    it('should handle insertion at beginning and end', () => {
      const newTransactions = [
        {
          to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          value: '100',
          description: 'Insert at start',
          gasLimit: '21000',
        },
        {
          to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          value: '200',
          description: 'Insert at end',
          gasLimit: '21000',
        },
      ];

      builder.insertTransactionsAtIndices(newTransactions, [0, 3]);

      const transactions = builder.getTransactions();
      expect(transactions).toHaveLength(5);
      expect(transactions[0].description).toBe('Insert at start');
      expect(transactions[4].description).toBe('Insert at end');
    });

    it('should support method chaining', () => {
      const result = builder.insertTransactionsAtIndices(
        [
          {
            to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            value: '100',
            gasLimit: '21000',
          },
        ],
        [1]
      );

      expect(result).toBe(builder);
    });
  });

  describe('createFeeTransactionObjects', () => {
    it('should create fee transaction objects from fee data', () => {
      const feeTransactions = [
        {
          recipient: '0x1111111111111111111111111111111111111111',
          amount: '1000000000000000',
          description: 'Platform fee',
        },
        {
          recipient: '0x2222222222222222222222222222222222222222',
          amount: '2000000000000000',
          // No description provided
        },
      ];

      const result = builder.createFeeTransactionObjects(feeTransactions);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        to: '0x1111111111111111111111111111111111111111',
        value: '1000000000000000',
        description: 'Platform fee',
        gasLimit: '21000',
      });
      expect(result[1]).toEqual({
        to: '0x2222222222222222222222222222222222222222',
        value: '2000000000000000',
        description: 'Fee payment',
        gasLimit: '21000',
      });
    });

    it('should handle BigInt amounts', () => {
      const feeTransactions = [
        {
          recipient: '0x1111111111111111111111111111111111111111',
          amount: BigInt('1000000000000000'),
        },
      ];

      const result = builder.createFeeTransactionObjects(feeTransactions);

      expect(result[0].value).toBe('1000000000000000');
    });
  });

  describe('insertFeeTransactionsRandomly', () => {
    beforeEach(() => {
      // Add some initial transactions
      builder
        .addTransaction({
          to: '0x1111111111111111111111111111111111111111',
          description: 'Transaction 1',
        })
        .addTransaction({
          to: '0x2222222222222222222222222222222222222222',
          description: 'Transaction 2',
        });
    });

    it('should insert fee transactions at specified points', () => {
      const feeTransactionData = [
        {
          recipient: '0xfee1111111111111111111111111111111111111',
          amount: '1000000000000000',
          description: 'Fee 1',
        },
        {
          recipient: '0xfee2222222222222222222222222222222222222',
          amount: '2000000000000000',
          description: 'Fee 2',
        },
      ];

      builder.insertFeeTransactionsRandomly(feeTransactionData, [0, 2]);

      const transactions = builder.getTransactions();
      expect(transactions).toHaveLength(4);
      expect(transactions[0].description).toBe('Fee 1');
      expect(transactions[3].description).toBe('Fee 2');
    });

    it('should support method chaining', () => {
      const result = builder.insertFeeTransactionsRandomly(
        [
          {
            recipient: '0xfee1111111111111111111111111111111111111',
            amount: '1000000000000000',
          },
        ],
        [1]
      );

      expect(result).toBe(builder);
    });
  });

  describe('getTransactionAt', () => {
    beforeEach(() => {
      builder
        .addTransaction({
          to: '0x1111111111111111111111111111111111111111',
          value: '1000',
          description: 'Transaction 1',
        })
        .addTransaction({
          to: '0x2222222222222222222222222222222222222222',
          value: '2000',
          description: 'Transaction 2',
        });
    });

    it('should return transaction at valid index', () => {
      const tx = builder.getTransactionAt(0);
      expect(tx).toEqual({
        to: '0x1111111111111111111111111111111111111111',
        value: '1000',
        description: 'Transaction 1',
        gasLimit: '21000',
      });
    });

    it('should return null for negative index', () => {
      const tx = builder.getTransactionAt(-1);
      expect(tx).toBeNull();
    });

    it('should return null for index out of bounds', () => {
      const tx = builder.getTransactionAt(5);
      expect(tx).toBeNull();
    });

    it('should return a copy of the transaction', () => {
      const tx = builder.getTransactionAt(0);
      tx.value = '5000'; // Modify the returned object

      // Original should be unchanged
      const original = builder.getTransactionAt(0);
      expect(original.value).toBe('1000');
    });
  });

  describe('removeTransactionAt', () => {
    beforeEach(() => {
      builder
        .addTransaction({
          to: '0x1111111111111111111111111111111111111111',
          description: 'Transaction 1',
        })
        .addTransaction({
          to: '0x2222222222222222222222222222222222222222',
          description: 'Transaction 2',
        })
        .addTransaction({
          to: '0x3333333333333333333333333333333333333333',
          description: 'Transaction 3',
        });
    });

    it('should remove transaction at valid index', () => {
      builder.removeTransactionAt(1);

      const transactions = builder.getTransactions();
      expect(transactions).toHaveLength(2);
      expect(transactions[0].description).toBe('Transaction 1');
      expect(transactions[1].description).toBe('Transaction 3');
    });

    it('should handle negative index gracefully', () => {
      builder.removeTransactionAt(-1);
      expect(builder.getTransactionCount()).toBe(3); // No change
    });

    it('should handle out of bounds index gracefully', () => {
      builder.removeTransactionAt(10);
      expect(builder.getTransactionCount()).toBe(3); // No change
    });

    it('should support method chaining', () => {
      const result = builder.removeTransactionAt(1);
      expect(result).toBe(builder);
    });

    it('should handle removing all transactions', () => {
      builder
        .removeTransactionAt(2)
        .removeTransactionAt(1)
        .removeTransactionAt(0);

      expect(builder.getTransactionCount()).toBe(0);
      expect(builder.getTransactions()).toEqual([]);
    });
  });
});
