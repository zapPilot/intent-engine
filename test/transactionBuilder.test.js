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
});
