import { ethers } from 'ethers';
import { logger } from './logger';
import { Transaction, IntentRequest } from '../types';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  gasEstimate?: string;
  balanceCheck?: BalanceValidation;
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  severity: 'critical' | 'high' | 'medium';
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  suggestion?: string;
}

export interface BalanceValidation {
  hasInsufficientBalance: boolean;
  requiredBalance: string;
  currentBalance: string;
  token: string;
}

export interface ValidationContext {
  userAddress: string;
  chainId: number;
  rpcUrl?: string;
  blockNumber?: number;
  simulationEnabled?: boolean;
  strictMode?: boolean;
}

export class TransactionValidator {
  private readonly logger = logger.child({ service: 'TransactionValidator' });
  private readonly maxGasLimit = ethers.BigNumber.from('15000000'); // 15M gas
  private readonly minGasLimit = ethers.BigNumber.from('21000'); // 21k gas
  private readonly maxValueWei = ethers.utils.parseEther('1000000'); // 1M ETH max

  /**
   * Validate a single transaction
   */
  async validateTransaction(
    transaction: Transaction,
    context: ValidationContext
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      this.logger.debug('Validating transaction', {
        to: transaction.to,
        value: transaction.value,
        chainId: transaction.chainId,
        userAddress: context.userAddress,
      });

      // Basic structure validation
      this.validateTransactionStructure(transaction, errors);

      // Address validation
      this.validateAddresses(transaction, context, errors, warnings);

      // Gas validation
      this.validateGasParameters(transaction, errors, warnings);

      // Value validation
      this.validateValue(transaction, errors, warnings);

      // Chain ID validation
      this.validateChainId(transaction, context, errors);

      // Data validation
      this.validateTransactionData(transaction, errors, warnings);

      // Advanced validation (requires RPC)
      let balanceCheck: BalanceValidation | undefined;
      if (context.rpcUrl) {
        balanceCheck = await this.validateBalance(transaction, context);
        if (balanceCheck.hasInsufficientBalance) {
          errors.push({
            code: 'INSUFFICIENT_BALANCE',
            message: `Insufficient balance. Required: ${ethers.utils.formatEther(balanceCheck.requiredBalance)} ETH, Available: ${ethers.utils.formatEther(balanceCheck.currentBalance)} ETH`,
            severity: 'critical',
          });
        }

        // Simulation validation
        if (context.simulationEnabled) {
          const simulationResult = await this.simulateTransaction(transaction, context);
          if (!simulationResult.success) {
            errors.push({
              code: 'SIMULATION_FAILED',
              message: simulationResult.error || 'Transaction simulation failed',
              severity: 'high',
            });
          }
        }
      }

      const isValid =
        errors.filter(e => e.severity === 'critical' || e.severity === 'high').length === 0;

      const result: ValidationResult = {
        isValid,
        errors,
        warnings,
      };

      if (balanceCheck) {
        result.balanceCheck = balanceCheck;
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Transaction validation failed', {
        error: errorMessage,
        transaction: {
          to: transaction.to,
          value: transaction.value,
        },
      });

      return {
        isValid: false,
        errors: [
          {
            code: 'VALIDATION_ERROR',
            message: `Validation failed: ${errorMessage}`,
            severity: 'critical',
          },
        ],
        warnings: [],
      };
    }
  }

  /**
   * Validate multiple transactions in batch
   */
  async validateTransactionBatch(
    transactions: Transaction[],
    context: ValidationContext
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      if (!transaction) continue;

      const result = await this.validateTransaction(transaction, context);

      // Add sequence-specific validations
      if (i > 0) {
        this.validateTransactionSequence(transactions, i, result.errors, result.warnings);
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Validate intent request before building transactions
   */
  validateIntentRequest(intent: IntentRequest): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate action
    const validActions = ['zapIn', 'zapOut', 'rebalance', 'swap', 'bridge'];
    if (!validActions.includes(intent.action)) {
      errors.push({
        code: 'INVALID_ACTION',
        message: `Invalid action: ${intent.action}. Must be one of: ${validActions.join(', ')}`,
        field: 'action',
        severity: 'critical',
      });
    }

    // Validate user address
    if (!ethers.utils.isAddress(intent.userAddress)) {
      errors.push({
        code: 'INVALID_USER_ADDRESS',
        message: `Invalid user address: ${intent.userAddress}`,
        field: 'userAddress',
        severity: 'critical',
      });
    }

    // Validate parameters
    this.validateIntentParams(intent, errors, warnings);

    // Validate preferences
    if (intent.preferences) {
      this.validateIntentPreferences(intent.preferences, errors, warnings);
    }

    return {
      isValid: errors.filter(e => e.severity === 'critical' || e.severity === 'high').length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate transaction structure
   */
  private validateTransactionStructure(transaction: Transaction, errors: ValidationError[]): void {
    if (!transaction.to) {
      errors.push({
        code: 'MISSING_TO_ADDRESS',
        message: 'Transaction must have a to address',
        field: 'to',
        severity: 'critical',
      });
    }

    if (transaction.data === undefined || transaction.data === null) {
      errors.push({
        code: 'MISSING_DATA',
        message: 'Transaction must have data field (use "0x" for empty data)',
        field: 'data',
        severity: 'critical',
      });
    }

    if (!transaction.gasLimit) {
      errors.push({
        code: 'MISSING_GAS_LIMIT',
        message: 'Transaction must have gasLimit',
        field: 'gasLimit',
        severity: 'critical',
      });
    }

    if (!transaction.chainId) {
      errors.push({
        code: 'MISSING_CHAIN_ID',
        message: 'Transaction must have chainId',
        field: 'chainId',
        severity: 'critical',
      });
    }
  }

  /**
   * Validate addresses
   */
  private validateAddresses(
    transaction: Transaction,
    context: ValidationContext,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // Validate to address
    if (transaction.to && !ethers.utils.isAddress(transaction.to)) {
      errors.push({
        code: 'INVALID_TO_ADDRESS',
        message: `Invalid to address: ${transaction.to}`,
        field: 'to',
        severity: 'critical',
      });
    }

    // Check for zero address
    if (transaction.to === ethers.constants.AddressZero) {
      warnings.push({
        code: 'ZERO_ADDRESS_WARNING',
        message: 'Transaction sent to zero address (contract creation or burn)',
        field: 'to',
        suggestion: 'Verify this is intentional',
      });
    }

    // Check if sending to self
    if (transaction.to && transaction.to.toLowerCase() === context.userAddress.toLowerCase()) {
      warnings.push({
        code: 'SELF_TRANSACTION',
        message: 'Transaction is being sent to the same address',
        field: 'to',
        suggestion: 'Verify this is intentional',
      });
    }
  }

  /**
   * Validate gas parameters
   */
  private validateGasParameters(
    transaction: Transaction,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    try {
      const gasLimit = ethers.BigNumber.from(transaction.gasLimit);

      // Check gas limit bounds
      if (gasLimit.lt(this.minGasLimit)) {
        errors.push({
          code: 'GAS_LIMIT_TOO_LOW',
          message: `Gas limit too low: ${gasLimit.toString()}. Minimum: ${this.minGasLimit.toString()}`,
          field: 'gasLimit',
          severity: 'high',
        });
      }

      if (gasLimit.gt(this.maxGasLimit)) {
        errors.push({
          code: 'GAS_LIMIT_TOO_HIGH',
          message: `Gas limit too high: ${gasLimit.toString()}. Maximum: ${this.maxGasLimit.toString()}`,
          field: 'gasLimit',
          severity: 'high',
        });
      }

      // Validate gas price parameters
      if (
        transaction.type === 2 ||
        (transaction.maxFeePerGas && transaction.maxPriorityFeePerGas)
      ) {
        // EIP-1559 transaction
        if (transaction.maxFeePerGas && transaction.maxPriorityFeePerGas) {
          const maxFee = ethers.BigNumber.from(transaction.maxFeePerGas);
          const priorityFee = ethers.BigNumber.from(transaction.maxPriorityFeePerGas);

          if (priorityFee.gt(maxFee)) {
            errors.push({
              code: 'INVALID_EIP1559_FEES',
              message: 'maxPriorityFeePerGas cannot be greater than maxFeePerGas',
              severity: 'critical',
            });
          }

          // Warn about high fees
          const maxFeeGwei = parseFloat(ethers.utils.formatUnits(maxFee, 'gwei'));
          if (maxFeeGwei > 100) {
            warnings.push({
              code: 'HIGH_GAS_FEE',
              message: `Very high max fee per gas: ${maxFeeGwei} Gwei`,
              suggestion: 'Consider reducing gas fees',
            });
          }
        }
      } else if (transaction.gasPrice) {
        // Legacy transaction
        const gasPrice = ethers.BigNumber.from(transaction.gasPrice);
        const gasPriceGwei = parseFloat(ethers.utils.formatUnits(gasPrice, 'gwei'));

        if (gasPriceGwei > 100) {
          warnings.push({
            code: 'HIGH_GAS_PRICE',
            message: `Very high gas price: ${gasPriceGwei} Gwei`,
            suggestion: 'Consider reducing gas price',
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({
        code: 'INVALID_GAS_PARAMETERS',
        message: `Invalid gas parameters: ${errorMessage}`,
        severity: 'critical',
      });
    }
  }

  /**
   * Validate transaction value
   */
  private validateValue(
    transaction: Transaction,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    try {
      const value = ethers.BigNumber.from(transaction.value || '0');

      if (value.lt(0)) {
        errors.push({
          code: 'NEGATIVE_VALUE',
          message: 'Transaction value cannot be negative',
          field: 'value',
          severity: 'critical',
        });
      }

      if (value.gt(this.maxValueWei)) {
        warnings.push({
          code: 'VERY_HIGH_VALUE',
          message: `Very high transaction value: ${ethers.utils.formatEther(value)} ETH`,
          field: 'value',
          suggestion: 'Verify this amount is correct',
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({
        code: 'INVALID_VALUE',
        message: `Invalid transaction value: ${errorMessage}`,
        field: 'value',
        severity: 'critical',
      });
    }
  }

  /**
   * Validate chain ID
   */
  private validateChainId(
    transaction: Transaction,
    context: ValidationContext,
    errors: ValidationError[]
  ): void {
    if (transaction.chainId !== context.chainId) {
      errors.push({
        code: 'CHAIN_ID_MISMATCH',
        message: `Transaction chainId (${transaction.chainId}) does not match context chainId (${context.chainId})`,
        field: 'chainId',
        severity: 'critical',
      });
    }

    // Validate chain ID is a known network
    const knownChains = [1, 3, 4, 5, 42, 137, 42161, 10, 56, 43114, 250, 8453, 324];
    if (!knownChains.includes(transaction.chainId)) {
      errors.push({
        code: 'UNKNOWN_CHAIN_ID',
        message: `Unknown chain ID: ${transaction.chainId}`,
        field: 'chainId',
        severity: 'medium',
      });
    }
  }

  /**
   * Validate transaction data
   */
  private validateTransactionData(
    transaction: Transaction,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // Only validate data if it exists (structure validation should catch missing data)
    if (transaction.data !== undefined && transaction.data !== null) {
      if (!ethers.utils.isHexString(transaction.data)) {
        errors.push({
          code: 'INVALID_DATA_FORMAT',
          message: 'Transaction data must be a valid hex string',
          field: 'data',
          severity: 'critical',
        });
      }

      // Check for suspiciously large data
      if (transaction.data.length > 100000) {
        // 50kb of data
        warnings.push({
          code: 'LARGE_DATA_SIZE',
          message: `Large transaction data size: ${transaction.data.length} characters`,
          field: 'data',
          suggestion: 'Verify this is necessary',
        });
      }
    }
  }

  /**
   * Validate intent parameters
   */
  private validateIntentParams(
    intent: IntentRequest,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const params = intent.params;

    // Validate amount
    try {
      const amount = ethers.BigNumber.from(params.amount);
      if (amount.lte(0)) {
        errors.push({
          code: 'INVALID_AMOUNT',
          message: 'Amount must be greater than 0',
          field: 'params.amount',
          severity: 'critical',
        });
      }
    } catch (error) {
      errors.push({
        code: 'INVALID_AMOUNT_FORMAT',
        message: `Invalid amount format: ${params.amount}`,
        field: 'params.amount',
        severity: 'critical',
      });
    }

    // Validate token addresses
    if (params.fromToken !== 'ETH' && !ethers.utils.isAddress(params.fromToken)) {
      errors.push({
        code: 'INVALID_FROM_TOKEN',
        message: `Invalid from token address: ${params.fromToken}`,
        field: 'params.fromToken',
        severity: 'critical',
      });
    }

    if (params.toToken !== 'ETH' && !ethers.utils.isAddress(params.toToken)) {
      errors.push({
        code: 'INVALID_TO_TOKEN',
        message: `Invalid to token address: ${params.toToken}`,
        field: 'params.toToken',
        severity: 'critical',
      });
    }

    // Validate slippage tolerance
    if (params.slippageTolerance !== undefined) {
      if (params.slippageTolerance < 0 || params.slippageTolerance > 50) {
        errors.push({
          code: 'INVALID_SLIPPAGE',
          message: `Slippage tolerance must be between 0 and 50, got: ${params.slippageTolerance}`,
          field: 'params.slippageTolerance',
          severity: 'high',
        });
      } else if (params.slippageTolerance > 5) {
        warnings.push({
          code: 'HIGH_SLIPPAGE',
          message: `High slippage tolerance: ${params.slippageTolerance}%`,
          field: 'params.slippageTolerance',
          suggestion: 'Consider reducing slippage tolerance',
        });
      }
    }

    // Validate deadline
    if (params.deadline !== undefined) {
      const currentTime = Math.floor(Date.now() / 1000);
      if (params.deadline <= currentTime) {
        errors.push({
          code: 'EXPIRED_DEADLINE',
          message: 'Transaction deadline has already passed',
          field: 'params.deadline',
          severity: 'critical',
        });
      }
    }
  }

  /**
   * Validate intent preferences
   */
  private validateIntentPreferences(
    preferences: IntentRequest['preferences'],
    errors: ValidationError[],
    _warnings: ValidationWarning[]
  ): void {
    if (!preferences) return;

    // Validate gas optimization strategy
    const validStrategies = ['speed', 'cost', 'balanced'];
    if (!validStrategies.includes(preferences.gasOptimization)) {
      errors.push({
        code: 'INVALID_GAS_STRATEGY',
        message: `Invalid gas optimization strategy: ${preferences.gasOptimization}`,
        field: 'preferences.gasOptimization',
        severity: 'medium',
      });
    }

    // Validate bridge provider
    if (preferences.bridgeProvider) {
      const validProviders = ['across', 'squid', 'auto'];
      if (!validProviders.includes(preferences.bridgeProvider)) {
        errors.push({
          code: 'INVALID_BRIDGE_PROVIDER',
          message: `Invalid bridge provider: ${preferences.bridgeProvider}`,
          field: 'preferences.bridgeProvider',
          severity: 'medium',
        });
      }
    }
  }

  /**
   * Validate balance for transaction
   */
  private async validateBalance(
    transaction: Transaction,
    context: ValidationContext
  ): Promise<BalanceValidation> {
    try {
      if (!context.rpcUrl) {
        throw new Error('RPC URL required for balance validation');
      }

      const provider = new ethers.providers.JsonRpcProvider(context.rpcUrl);
      const balance = await provider.getBalance(context.userAddress);

      // Calculate required balance (value + gas cost)
      const value = ethers.BigNumber.from(transaction.value || '0');
      const gasLimit = ethers.BigNumber.from(transaction.gasLimit);
      const gasPrice = transaction.gasPrice
        ? ethers.BigNumber.from(transaction.gasPrice)
        : ethers.BigNumber.from(transaction.maxFeePerGas || '20000000000'); // 20 Gwei fallback

      const gasCost = gasLimit.mul(gasPrice);
      const requiredBalance = value.add(gasCost);

      return {
        hasInsufficientBalance: balance.lt(requiredBalance),
        requiredBalance: requiredBalance.toString(),
        currentBalance: balance.toString(),
        token: 'ETH',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Balance validation failed', {
        error: errorMessage,
        userAddress: context.userAddress,
      });

      return {
        hasInsufficientBalance: false, // Assume sufficient if we can't check
        requiredBalance: '0',
        currentBalance: '0',
        token: 'ETH',
      };
    }
  }

  /**
   * Simulate transaction execution
   */
  private async simulateTransaction(
    transaction: Transaction,
    context: ValidationContext
  ): Promise<{ success: boolean; error?: string; gasUsed?: string }> {
    try {
      if (!context.rpcUrl) {
        throw new Error('RPC URL required for simulation');
      }

      const provider = new ethers.providers.JsonRpcProvider(context.rpcUrl);

      // Use eth_call to simulate the transaction
      await provider.call({
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
        from: context.userAddress,
        gasLimit: transaction.gasLimit,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn('Transaction simulation failed', {
        error: errorMessage,
        transaction: {
          to: transaction.to,
          data: `${transaction.data.slice(0, 42)}...`,
        },
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Validate transaction sequence in batch
   */
  private validateTransactionSequence(
    transactions: Transaction[],
    currentIndex: number,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const current = transactions[currentIndex];
    const previous = transactions[currentIndex - 1];

    if (!current || !previous) return;

    // Check for nonce ordering (if nonces are provided)
    if (current.nonce !== undefined && previous.nonce !== undefined) {
      if (current.nonce <= previous.nonce) {
        errors.push({
          code: 'INVALID_NONCE_SEQUENCE',
          message: `Transaction nonce ${current.nonce} should be greater than previous nonce ${previous.nonce}`,
          severity: 'high',
        });
      }
    }

    // Check for dependency issues (approval followed by spend)
    if (this.isApprovalTransaction(previous) && this.isSpendTransaction(current)) {
      const approvalToken = this.extractTokenFromApproval(previous);
      const spendToken = this.extractTokenFromSpend(current);

      if (approvalToken && spendToken && approvalToken !== spendToken) {
        warnings.push({
          code: 'POTENTIAL_DEPENDENCY_ISSUE',
          message: 'Approval and spend transactions for different tokens in sequence',
          suggestion: 'Verify transaction order is correct',
        });
      }
    }
  }

  /**
   * Check if transaction is an approval
   */
  private isApprovalTransaction(transaction: Transaction): boolean {
    return transaction.data.startsWith('0x095ea7b3'); // approve(address,uint256)
  }

  /**
   * Check if transaction is a spend transaction
   */
  private isSpendTransaction(transaction: Transaction): boolean {
    // Common spend function signatures
    const spendSignatures = [
      '0xa9059cbb', // transfer(address,uint256)
      '0x23b872dd', // transferFrom(address,address,uint256)
      '0x38ed1739', // swapExactTokensForTokens
    ];

    return spendSignatures.some(sig => transaction.data.startsWith(sig));
  }

  /**
   * Extract token address from approval transaction
   */
  private extractTokenFromApproval(transaction: Transaction): string | null {
    try {
      // Token address is the 'to' field in approval transactions
      return transaction.to;
    } catch {
      return null;
    }
  }

  /**
   * Extract token address from spend transaction
   */
  private extractTokenFromSpend(transaction: Transaction): string | null {
    try {
      // This would require more complex ABI decoding
      // For now, return the 'to' address as approximation
      return transaction.to;
    } catch {
      return null;
    }
  }
}

export const transactionValidator = new TransactionValidator();
