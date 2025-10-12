'use strict';

const UnifiedZapExecutor = require('../src/executors/UnifiedZapExecutor');

describe('UnifiedZapExecutor swap guards', () => {
  let swapService;
  let executor;

  beforeEach(() => {
    swapService = {
      getSecondBestSwapQuote: jest.fn(),
    };

    executor = new UnifiedZapExecutor(
      swapService,
      { getPrices: jest.fn() },
      {}
    );
  });

  test('skips swap when from and to token addresses are identical', async () => {
    const amount = 123456n;

    const result = await executor._executeSwap({
      chainId: 8453,
      userAddress: '0x0000000000000000000000000000000000000001',
      fromTokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      fromTokenDecimals: 6,
      toTokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      toTokenDecimals: 6,
      amount,
      slippage: 0.5,
      tokenPrices: {},
      toTokenSymbol: 'USDC',
    });

    expect(result.transactions).toEqual([]);
    expect(result.depositAmount).toBe(amount);
    expect(result.depositTokenAddress).toBe(
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
    );
    expect(result.swapQuote).toBeNull();
    expect(swapService.getSecondBestSwapQuote).not.toHaveBeenCalled();
  });

  test('skips swap leg for LP token matching the input token', async () => {
    const lpAmount = 302474127n;
    const expectedFirstLeg = lpAmount / 2n;
    const swapQuote = {
      approve_to: '0x0000000000000000000000000000000000000002',
      to: '0x0000000000000000000000000000000000000003',
      value: '0',
      data: '0x1234',
      gas: 210000,
      minToAmount: '151237064',
    };
    swapService.getSecondBestSwapQuote.mockResolvedValue(swapQuote);

    const result = await executor._prepareLPTokenSwaps({
      protocolAllocation: {
        id: 'velodrome-bold-usdc-base',
        chainId: 8453,
      },
      tokenRequirements: {
        protocolSpecific: {
          token0: {
            address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            decimals: 6,
            symbol: 'USDC',
          },
          token1: {
            address: '0x1234567890abcdef1234567890abcdef12345678',
            decimals: 18,
            symbol: 'BOLD',
          },
        },
        requiresSwap: true,
      },
      userAddress: '0x0000000000000000000000000000000000000009',
      inputToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      inputTokenDecimals: 6,
      amount: lpAmount,
      slippage: 0.5,
      tokenPrices: {},
    });

    expect(swapService.getSecondBestSwapQuote).toHaveBeenCalledTimes(1);
    expect(result.swapTransactions).toHaveLength(2);
    expect(result.depositParams.token0Amount).toBe(expectedFirstLeg);
    expect(result.depositParams.token1Amount).toBe(151237064n);
  });
});
