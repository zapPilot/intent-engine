// Setup mock instances FIRST
const mockSwapService = {
  getSecondBestSwapQuote: jest.fn(),
};

const mockPriceService = {
  getPrice: jest.fn(),
};

const mockBalanceService = {
  getBalances: jest.fn(),
};

const mockRebalanceClient = {
  getStrategyBalances: jest.fn(),
  getSwapRoute: jest.fn(),
};

// Mock protocol instance with mocked transaction methods
const mockProtocolInstance = {
  getApprovalTransaction: jest.fn(),
  getDepositTransaction: jest.fn(),
  getTokenRequirements: jest.fn(),
  config: {
    mode: 'single',
    symbolOfBestTokenToZapInOut: 'USDC',
  },
};

// Mock ProtocolFactory
const mockProtocolFactory = {
  createProtocol: jest.fn(),
  createProtocolsForStrategy: jest.fn(),
};

// Mock the services BEFORE importing anything else
jest.mock('../../src/services/swapService', () => {
  return jest.fn().mockImplementation(() => mockSwapService);
});

jest.mock('../../src/services/priceService', () => {
  return jest.fn().mockImplementation(() => mockPriceService);
});

jest.mock('../../src/services/balanceService', () => {
  return jest.fn().mockImplementation(() => mockBalanceService);
});

jest.mock('../../src/services/RebalanceBackendClient', () => {
  return jest.fn().mockImplementation(() => mockRebalanceClient);
});

jest.mock('../../src/protocols', () => {
  return {
    protocolFactory: mockProtocolFactory,
  };
});

const request = require('supertest');
const express = require('express');
const phasedZapRoutes = require('../../src/routes/phasedZapRoutes');
const PhasedZapController = require('../../src/controllers/PhasedZapController');

// Setup Express app
const app = express();
app.use(express.json());
app.use(phasedZapRoutes);

// Test constants
const MOCK_USER_ADDRESS = '0x2eCBC6f229feD06044CDb0dD772437a30190CD50';
const MOCK_CHAIN_ID = 8453;
const MOCK_INPUT_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
// Expected output tokens for stablecoin strategy on Base:
const MOCK_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC (for Aave + Velodrome)
const MOCK_BOLD_ADDRESS = '0x03569CC076654F82679C4BA2124D64774781B01D'; // BOLD (for Velodrome LP)

describe('Phased Zap Execution - Integration Tests', () => {
  let executor;

  beforeAll(() => {
    // Get a handle on the executor instance to inspect its store
    executor = PhasedZapController.getExecutor();
  });

  beforeEach(() => {
    // Reset mocks and clear the store before each test
    jest.clearAllMocks();
    executor.phasedStore.clear();

    // Replace executor's protocolFactory with our mock
    executor.protocolFactory = mockProtocolFactory;

    // Default successful mock implementations
    // CRITICAL: TransactionBuilder.addSwap() expects to, data, value at TOP LEVEL
    mockSwapService.getSecondBestSwapQuote.mockResolvedValue({
      approve_to: '0x1111111254EEB25477B68fb85Ed929f73A960582',
      minToAmount: '995000000000000000', // ~0.995 WETH
      toAmount: '1000000000000000000', // 1 WETH
      // Transaction fields at TOP LEVEL (not nested under 'tx')
      to: '0x1111111254EEB25477B68fb85Ed929f73A960582',
      data: '0xswapdata',
      value: '0',
      gas: 250000,
    });

    mockPriceService.getPrice.mockResolvedValue({ price: 3000 });

    // Mock balance service to return balances for USDC and BOLD after swaps
    // These are the tokens that will be held after Phase 1 swap transactions
    mockBalanceService.getBalances.mockResolvedValue({
      balances: [
        {
          tokenAddress: MOCK_USDC_ADDRESS,
          balance: '500000000', // 500 USDC (6 decimals)
          decimals: 6,
        },
        {
          tokenAddress: MOCK_BOLD_ADDRESS,
          balance: '250000000000000000000', // 250 BOLD (18 decimals)
          decimals: 18,
        },
      ],
    });

    // Mock protocol instance methods
    mockProtocolInstance.getApprovalTransaction.mockResolvedValue({
      to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      data: '0xapprovaldata',
      value: '0',
      gasLimit: null,
      description: 'Approve USDC for protocol',
    });

    mockProtocolInstance.getDepositTransaction.mockResolvedValue({
      to: '0xProtocolAddress',
      data: '0xdepositdata',
      value: '0',
      gasLimit: null,
      description: 'Deposit to protocol',
    });

    mockProtocolInstance.getTokenRequirements.mockReturnValue({
      mode: 'single',
      inputToken: MOCK_USDC_ADDRESS,
      outputToken: MOCK_USDC_ADDRESS,
      requiresSwap: true,
      protocolSpecific: {
        underlyingToken: MOCK_USDC_ADDRESS,
        protocolAddress: '0xProtocolAddress',
        poolAddress: '0xPoolAddress',
      },
    });

    // Mock protocol factory to return mock protocol instance
    mockProtocolFactory.createProtocol.mockReturnValue(mockProtocolInstance);

    mockProtocolFactory.createProtocolsForStrategy.mockReturnValue([
      {
        id: 'aave-usdc-base',
        name: 'Aave USDC',
        weight: 50,
        chain: 'base',
        chainId: MOCK_CHAIN_ID,
        instance: mockProtocolInstance,
        config: {
          id: 'aave-usdc-base',
          implementation: 'AaveProtocol',
          config: mockProtocolInstance.config,
        },
      },
      {
        id: 'velodrome-usdc-bold-base',
        name: 'Velodrome USDC/BOLD',
        weight: 50,
        chain: 'base',
        chainId: MOCK_CHAIN_ID,
        instance: mockProtocolInstance,
        config: {
          id: 'velodrome-usdc-bold-base',
          implementation: 'VelodromeProtocol',
          config: mockProtocolInstance.config,
        },
      },
    ]);
  });

  afterAll(() => {
    // Clean up the executor and its store
    executor.destroy();
  });

  describe('E2E Happy Path', () => {
    it('should successfully complete a 2-phase execution flow', async () => {
      // --- Phase 1: Initialize ---
      const initResponse = await request(app)
        .post('/api/v1/intents/unified-zap/phased/init')
        .send({
          userAddress: MOCK_USER_ADDRESS,
          chainId: MOCK_CHAIN_ID,
          params: {
            strategyAllocations: [
              { strategyId: 'stablecoin', percentage: 100 },
            ],
            inputToken: MOCK_INPUT_TOKEN,
            inputAmount: '1000000000', // 1000 USDC
            slippage: 0.5,
          },
        });

      // If init fails, show the actual error
      if (initResponse.status !== 200) {
        throw new Error(
          `Init failed with status ${initResponse.status}: ${JSON.stringify(initResponse.body)}`
        );
      }

      // Assert Phase 1 response
      expect(initResponse.body.success).toBe(true);
      expect(initResponse.body.phase).toBe(1);
      expect(initResponse.body.executionId).toBeDefined();
      expect(initResponse.body.transactions.length).toBe(0);
      expect(mockSwapService.getSecondBestSwapQuote).not.toHaveBeenCalled();
      expect(initResponse.body.metadata.nextStep).toBeDefined();

      const { executionId } = initResponse.body;

      // Assert state store after Phase 1
      const phase1State = executor.phasedStore.get(executionId);
      expect(phase1State).toBeDefined();
      expect(phase1State.phase).toBe(1);
      expect(phase1State.status).toBe('pending');
      expect(phase1State.swapTokenAddresses.length).toBeGreaterThan(0);

      // --- Phase 2: Continue ---
      const continueResponse = await request(app).post(
        `/api/v1/intents/unified-zap/phased/continue/${executionId}`
      );

      // Check for failures and provide detailed error
      if (continueResponse.status !== 200) {
        throw new Error(
          `Phase 2 failed: ${JSON.stringify(continueResponse.body, null, 2)}`
        );
      }

      // Assert Phase 2 response
      expect(continueResponse.body.success).toBe(true);
      expect(continueResponse.body.phase).toBe(2);
      expect(continueResponse.body.executionId).toBe(executionId);
      expect(continueResponse.body.transactions.length).toBeGreaterThan(0); // Approvals + Deposits
      expect(continueResponse.body.actualBalances).toBeDefined();

      // Verify balances were queried
      expect(mockBalanceService.getBalances).toHaveBeenCalledWith(
        MOCK_USER_ADDRESS,
        expect.objectContaining({
          skipCache: true,
        })
      );
    });
  });

  describe('State Management and Error Handling', () => {
    let executionId;

    beforeEach(async () => {
      // Create a pending execution for error tests
      const res = await request(app)
        .post('/api/v1/intents/unified-zap/phased/init')
        .send({
          userAddress: MOCK_USER_ADDRESS,
          chainId: MOCK_CHAIN_ID,
          params: {
            strategyAllocations: [
              { strategyId: 'stablecoin', percentage: 100 },
            ],
            inputToken: MOCK_INPUT_TOKEN,
            inputAmount: '1000000000',
          },
        });
      executionId = res.body.executionId;
    });

    it('should return 404 for a non-existent executionId', async () => {
      const res = await request(app)
        .post('/api/v1/intents/unified-zap/phased/continue/exec_invalid_id')
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EXECUTION_NOT_FOUND');
    });

    it('should return 400 if post-swap balances are zero', async () => {
      // Mock balance service to return zero balance
      mockBalanceService.getBalances.mockResolvedValue({
        balances: [
          {
            tokenAddress: MOCK_USDC_ADDRESS,
            balance: '0',
            decimals: 6,
          },
          {
            tokenAddress: MOCK_BOLD_ADDRESS,
            balance: '0',
            decimals: 18,
          },
        ],
      });

      const res = await request(app)
        .post(`/api/v1/intents/unified-zap/phased/continue/${executionId}`)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INSUFFICIENT_BALANCES');
      expect(res.body.error.message).toContain('balances');
    });

    it('should handle errors from the balance service gracefully', async () => {
      // Mock balance service to throw an error
      const errorMessage = 'Moralis API is down';
      mockBalanceService.getBalances.mockRejectedValue(new Error(errorMessage));

      const res = await request(app)
        .post(`/api/v1/intents/unified-zap/phased/continue/${executionId}`)
        .expect(500);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBeDefined();
    });

    it('should return 400 for missing required parameters in init', async () => {
      const res = await request(app)
        .post('/api/v1/intents/unified-zap/phased/init')
        .send({
          // Missing userAddress
          chainId: MOCK_CHAIN_ID,
          params: {
            strategyAllocations: [
              { strategyId: 'stablecoin', percentage: 100 },
            ],
            inputToken: MOCK_INPUT_TOKEN,
            inputAmount: '1000',
          },
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });

    it('should return 400 for missing executionId in continue', async () => {
      const _res = await request(app)
        .post('/api/v1/intents/unified-zap/phased/continue/')
        .expect(404); // Express returns 404 for missing route param

      // This tests that the route is properly configured
    });
  });

  describe('TTL and Expiration', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return 404 when trying to continue an expired execution', async () => {
      const initResponse = await request(app)
        .post('/api/v1/intents/unified-zap/phased/init')
        .send({
          userAddress: MOCK_USER_ADDRESS,
          chainId: MOCK_CHAIN_ID,
          params: {
            strategyAllocations: [
              { strategyId: 'stablecoin', percentage: 100 },
            ],
            inputToken: MOCK_INPUT_TOKEN,
            inputAmount: '1000000000',
          },
        });

      const { executionId } = initResponse.body;

      // Advance time past the 30-minute TTL
      jest.advanceTimersByTime(31 * 60 * 1000);

      // Attempt to continue
      const res = await request(app)
        .post(`/api/v1/intents/unified-zap/phased/continue/${executionId}`)
        .expect(404);

      expect(res.body.error.code).toBe('EXECUTION_NOT_FOUND');
      expect(res.body.error.message).toContain('not found or expired');
    });
  });

  describe('GET /api/v1/intents/unified-zap/phased/status/:executionId', () => {
    it('should return the correct status after phase 1 initialization', async () => {
      const initResponse = await request(app)
        .post('/api/v1/intents/unified-zap/phased/init')
        .send({
          userAddress: MOCK_USER_ADDRESS,
          chainId: MOCK_CHAIN_ID,
          params: {
            strategyAllocations: [
              { strategyId: 'stablecoin', percentage: 100 },
            ],
            inputToken: MOCK_INPUT_TOKEN,
            inputAmount: '1000000000',
          },
        });
      const { executionId } = initResponse.body;

      const statusResponse = await request(app)
        .get(`/api/v1/intents/unified-zap/phased/status/${executionId}`)
        .expect(200);

      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.executionId).toBe(executionId);
      expect(statusResponse.body.phase).toBe(1);
      expect(statusResponse.body.status).toBe('pending');
      expect(statusResponse.body.metadata.userAddress).toBe(MOCK_USER_ADDRESS);
      expect(statusResponse.body.metadata.chainId).toBe(
        MOCK_CHAIN_ID.toString()
      );
      expect(statusResponse.body.metadata.createdAt).toBeDefined();
      expect(statusResponse.body.metadata.expiresAt).toBeDefined();
    });

    it('should return 404 for a non-existent execution status', async () => {
      const res = await request(app)
        .get('/api/v1/intents/unified-zap/phased/status/exec_invalid_id')
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EXECUTION_NOT_FOUND');
    });

    it('should return updated status after phase 2', async () => {
      // Initialize
      const initResponse = await request(app)
        .post('/api/v1/intents/unified-zap/phased/init')
        .send({
          userAddress: MOCK_USER_ADDRESS,
          chainId: MOCK_CHAIN_ID,
          params: {
            strategyAllocations: [
              { strategyId: 'stablecoin', percentage: 100 },
            ],
            inputToken: MOCK_INPUT_TOKEN,
            inputAmount: '1000000000',
          },
        });
      const { executionId } = initResponse.body;

      // Continue to phase 2
      await request(app)
        .post(`/api/v1/intents/unified-zap/phased/continue/${executionId}`)
        .expect(200);

      // Check status
      const statusResponse = await request(app)
        .get(`/api/v1/intents/unified-zap/phased/status/${executionId}`)
        .expect(200);

      expect(statusResponse.body.phase).toBe(2);
      expect(statusResponse.body.metadata.actualBalances).toBeDefined();
    });
  });

  describe('Store Statistics', () => {
    it('should track multiple concurrent executions', async () => {
      // Create 3 executions
      const requests = Array.from({ length: 3 }, (_, i) =>
        request(app)
          .post('/api/v1/intents/unified-zap/phased/init')
          .send({
            userAddress: MOCK_USER_ADDRESS,
            chainId: MOCK_CHAIN_ID,
            params: {
              strategyAllocations: [
                { strategyId: 'stablecoin', percentage: 100 },
              ],
              inputToken: MOCK_INPUT_TOKEN,
              inputAmount: String(1000000000 * (i + 1)),
            },
          })
      );

      await Promise.all(requests);

      // Check store stats
      const stats = PhasedZapController.getStoreStats();
      expect(stats.total).toBe(3);
      expect(stats.active).toBe(3);
      expect(stats.expired).toBe(0);
    });
  });
});
