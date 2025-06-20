export interface IntentRequest {
  action: 'zapIn' | 'zapOut' | 'rebalance' | 'swap' | 'bridge';
  params: {
    amount: string;
    fromToken: string;
    toToken: string;
    chainId: number;
    slippageTolerance?: number;
    deadline?: number;
  };
  userAddress: string;
  preferences?: {
    gasOptimization: 'speed' | 'cost' | 'balanced';
    bridgeProvider?: 'across' | 'squid' | 'auto';
  };
}

export interface IntentResponse {
  intentId: string;
  transactions: Transaction[];
  metadata: {
    estimatedGas: string;
    totalFees: string;
    priceImpact: string;
    routes: RouteInfo[];
    executionTime: string;
    walletCompatibility: {
      thirdweb: boolean;
      zerodev: boolean;
      metamask: boolean;
      walletConnect: boolean;
    };
    batchable: boolean;
    requiresApproval: boolean;
  };
}

export interface Transaction {
  to: string;
  data: string;
  value: string;
  gasLimit: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  chainId: number;
  nonce?: number;
  type?: number; // EIP-1559 transaction type
  accessList?: Array<{
    address: string;
    storageKeys: string[];
  }>;
  // Additional metadata for wallet compatibility
  metadata?: {
    description: string;
    tokenSymbol?: string;
    amount?: string;
    protocol?: string;
    action?: string;
  };
}

export interface RouteInfo {
  provider: string;
  route: string[];
  amountIn: string;
  amountOut: string;
  gasEstimate: string;
  priceImpact: string;
}

export interface QuoteRequest {
  action: string;
  amount: string;
  fromToken: string;
  toToken: string;
  chainId: number;
}

export interface QuoteResponse {
  bestRoute: RouteInfo;
  alternatives: RouteInfo[];
  gasEstimate: string;
  priceImpact: string;
  fees: FeeBreakdown;
}

export interface FeeBreakdown {
  protocolFee: string;
  gasFee: string;
  bridgeFee?: string;
  totalFee: string;
}

export interface IntentStatus {
  status: 'pending' | 'executing' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  transactions: TransactionStatus[];
  errors?: ErrorInfo[];
}

export interface TransactionStatus {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  gasUsed?: string;
  blockNumber?: number;
}

export interface ErrorInfo {
  code: string;
  message: string;
  details?: any;
}

export interface OptimizationMetrics {
  gasReduction: string;
  speedImprovement: string;
  reliabilityScore: number;
}