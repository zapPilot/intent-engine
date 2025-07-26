/**
 * Transaction Builder - Composes batch transactions for intent execution
 */
const { isAddress, Interface } = require('ethers');
const { TokenConfigService } = require('../config/tokenConfig');

class TransactionBuilder {
  constructor() {
    this.transactions = [];
  }

  /**
   * Add a generic transaction step
   * @param {Object} transaction - Transaction object
   */
  addTransaction(transaction) {
    const { to, value = '0', data, description, gasLimit } = transaction;
    if (!to || !isAddress(to)) {
      throw new Error(
        'Invalid transaction: to address must be valid Ethereum address'
      );
    }

    const tx = {
      to,
      value: value.toString(),
      description: description || 'Transaction',
      gasLimit: gasLimit || '21000',
      ...(data && { data }), // Only adds 'data' if it is truthy (not undefined/null/empty string)
    };
    this.transactions.push(tx);

    return this;
  }

  /**
   * Add ERC-20 approve transaction
   * @param {string} tokenAddress - Token contract address
   * @param {string} spenderAddress - Spender address (usually DEX router)
   * @param {string} amount - Amount to approve (in wei)
   */
  addApprove(tokenAddress, spenderAddress, amount) {
    // Create interface for ERC20
    const erc20Interface = new Interface([
      'function approve(address spender, uint256 amount) returns (bool)',
    ]);

    // Encode the function call
    console.log(
      'tokenAddress',
      tokenAddress,
      'spenderAddress',
      spenderAddress,
      'amount',
      amount
    );
    const data = erc20Interface.encodeFunctionData('approve', [
      spenderAddress,
      amount,
    ]);
    console.log('after encodeFunctionData');

    return this.addTransaction({
      to: tokenAddress,
      value: '0',
      data,
      description: `Approve ${tokenAddress} for ${spenderAddress}`,
      gasLimit: '25000',
    });
  }

  /**
   * Add swap transaction from DEX aggregator
   * @param {Object} swapData - Swap data from aggregator
   * @param {string} description - Transaction description
   */
  addSwap(swapData, description) {
    return this.addTransaction({
      to: swapData.to,
      value: swapData.value || '0',
      data: swapData.data,
      description: description || 'Token swap',
      gasLimit: swapData.gas * 2 || swapData.gasLimit * 2 || '500000',
    });
  }

  /**
   * Add ETH transfer transaction
   * @param {string} recipient - Recipient address
   * @param {string} amount - Amount in wei
   * @param {string} description - Transaction description
   */
  addETHTransfer(recipient, amount, description) {
    return this.addTransaction({
      to: recipient,
      value: amount.toString(),
      description: description || 'ETH transfer',
      gasLimit: '21000',
    });
  }

  /**
   * Add WETH deposit transaction (ETH -> WETH)
   * @param {number} chainId - Chain ID to get correct WETH address
   * @param {string} amount - Amount in wei to deposit
   * @param {string} description - Transaction description
   */
  addWETHDeposit(chainId, amount, description) {
    const wethAddress = TokenConfigService.getWETHAddress(chainId);
    if (!wethAddress) {
      throw new Error(`WETH not supported on chain ${chainId}`);
    }

    // Create interface for WETH
    const wethInterface = new Interface(['function deposit() payable']);

    // Encode the function call
    const data = wethInterface.encodeFunctionData('deposit');

    return this.addTransaction({
      to: wethAddress,
      value: amount.toString(),
      data,
      description: description || 'WETH deposit (ETH -> WETH)',
      gasLimit: '50000',
    });
  }

  /**
   * Add ERC20 transfer transaction
   * @param {string} tokenAddress - ERC20 token contract address
   * @param {string} recipient - Recipient address
   * @param {string} amount - Amount in token's smallest unit (wei for WETH)
   * @param {string} description - Transaction description
   */
  addERC20Transfer(tokenAddress, recipient, amount, description) {
    // Create interface for ERC20
    const erc20Interface = new Interface([
      'function transfer(address to, uint256 amount) returns (bool)',
    ]);

    // Encode the function call
    const data = erc20Interface.encodeFunctionData('transfer', [
      recipient,
      amount,
    ]);

    return this.addTransaction({
      to: tokenAddress,
      value: '0',
      data,
      description: description || `ERC20 transfer to ${recipient}`,
      gasLimit: '65000',
    });
  }

  /**
   * Get all transactions
   * @returns {Array} - Array of transaction objects
   */
  getTransactions() {
    return [...this.transactions];
  }

  /**
   * Get total estimated gas
   * @returns {string} - Total gas limit as string
   */
  getTotalGas() {
    const total = this.transactions.reduce((sum, tx) => {
      return sum + BigInt(tx.gasLimit);
    }, BigInt(0));

    return total.toString();
  }

  /**
   * Clear all transactions
   */
  clear() {
    this.transactions = [];
    return this;
  }

  /**
   * Get transaction count
   * @returns {number} - Number of transactions
   */
  getTransactionCount() {
    return this.transactions.length;
  }

  /**
   * Insert transactions at specific indices
   * @param {Array} transactions - Array of transaction objects to insert
   * @param {Array} insertionPoints - Array of indices where transactions should be inserted
   * @returns {TransactionBuilder} - Builder instance for chaining
   */
  insertTransactionsAtIndices(transactions, insertionPoints) {
    if (transactions.length !== insertionPoints.length) {
      throw new Error(
        'Number of transactions must match number of insertion points'
      );
    }

    // Validate insertion points
    const maxIndex = this.transactions.length;
    const invalidIndices = insertionPoints.filter(
      index => index < 0 || index > maxIndex
    );
    if (invalidIndices.length > 0) {
      throw new Error(
        `Invalid insertion indices: ${invalidIndices.join(', ')}`
      );
    }

    // Sort insertion points in descending order to maintain indices during insertion
    const sortedInsertions = transactions
      .map((tx, i) => ({ transaction: tx, index: insertionPoints[i] }))
      .sort((a, b) => b.index - a.index);

    // Insert transactions from highest index to lowest to preserve indices
    for (const { transaction, index } of sortedInsertions) {
      this.transactions.splice(index, 0, transaction);
    }

    return this;
  }

  /**
   * Create transaction objects for fee payments
   * @param {Array} feeTransactions - Array of fee transaction data
   * @returns {Array} - Array of formatted transaction objects
   */
  createFeeTransactionObjects(feeTransactions) {
    return feeTransactions.map(fee => ({
      to: fee.recipient,
      value: fee.amount.toString(),
      description: fee.description || 'Fee payment',
      gasLimit: '21000',
    }));
  }

  /**
   * Insert fee transactions at random points using insertion strategy
   * @param {Array} feeTransactionData - Array of fee transaction data
   * @param {Array} insertionPoints - Array of indices for insertion
   * @returns {TransactionBuilder} - Builder instance for chaining
   */
  insertFeeTransactionsRandomly(feeTransactionData, insertionPoints) {
    const feeTransactions =
      this.createFeeTransactionObjects(feeTransactionData);
    return this.insertTransactionsAtIndices(feeTransactions, insertionPoints);
  }

  /**
   * Get transaction at specific index
   * @param {number} index - Transaction index
   * @returns {Object|null} - Transaction object or null if invalid index
   */
  getTransactionAt(index) {
    if (index < 0 || index >= this.transactions.length) {
      return null;
    }
    return { ...this.transactions[index] };
  }

  /**
   * Remove transaction at specific index
   * @param {number} index - Transaction index to remove
   * @returns {TransactionBuilder} - Builder instance for chaining
   */
  removeTransactionAt(index) {
    if (index >= 0 && index < this.transactions.length) {
      this.transactions.splice(index, 1);
    }
    return this;
  }
}

module.exports = TransactionBuilder;
