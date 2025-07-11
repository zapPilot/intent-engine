/**
 * Transaction Builder - Composes batch transactions for intent execution
 */
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

    if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
      throw new Error(
        'Invalid transaction: to address must be valid Ethereum address'
      );
    }

    if (!data) {
      throw new Error('Invalid transaction: data field is required');
    }

    this.transactions.push({
      to,
      value: value.toString(),
      data,
      description: description || 'Transaction',
      gasLimit: gasLimit || '21000',
    });

    return this;
  }

  /**
   * Add ERC-20 approve transaction
   * @param {string} tokenAddress - Token contract address
   * @param {string} spenderAddress - Spender address (usually DEX router)
   * @param {string} amount - Amount to approve (in wei)
   */
  addApprove(tokenAddress, spenderAddress, amount) {
    // ERC-20 approve function signature: approve(address,uint256)
    const approveMethodId = '0x095ea7b3';
    const paddedSpender = spenderAddress.slice(2).padStart(64, '0');
    const paddedAmount = BigInt(amount).toString(16).padStart(64, '0');
    const data = `${approveMethodId}${paddedSpender}${paddedAmount}`;

    return this.addTransaction({
      to: tokenAddress,
      value: '0',
      data,
      description: `Approve ${tokenAddress} for ${spenderAddress}`,
      gasLimit: '50000',
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
      gasLimit: swapData.gas || swapData.gasLimit || '200000',
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
      data: '0x',
      description: description || 'ETH transfer',
      gasLimit: '21000',
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
}

module.exports = TransactionBuilder;
