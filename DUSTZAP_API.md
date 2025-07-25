# DustZap Intent API Documentation

## Overview

The DustZap intent allows users to convert small token balances (dust) into ETH using **Server-Sent Events (SSE) streaming** for real-time progress updates. The intent-engine handles token filtering, optimal swap routing, and fee calculations, providing live feedback as each token is processed.

## API Endpoint

```
POST /api/v1/intents/dustZap
```

## Request Format

```json
{
  "userAddress": "0x2eCBC6f229feD06044CDb0dD772437a30190CD50",
  "chainId": 1,
  "params": {
    "dustThreshold": 0.005,
    "targetToken": "ETH",
    "referralAddress": "0x1234567890123456789012345678901234567890",
    "toTokenAddress": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "toTokenDecimals": 18,
    "slippage": 1
  }
}
```

### Parameters

- **userAddress** (required): User's wallet address
- **chainId** (required): Chain ID (1=Ethereum, 137=Polygon, etc.)
- **params.dustThreshold** (optional): Minimum USD value to consider dust (default: 0.005)
- **params.targetToken** (optional): Target token for conversion (only "ETH" supported currently)
- **params.referralAddress** (optional): Referral address for fee sharing
- **params.toTokenAddress** (required): Target token address (e.g., ETH = 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee)
- **params.toTokenDecimals** (required): Target token decimals (e.g., ETH = 18)
- **params.slippage** (optional): Slippage tolerance percentage (default: 1)

## Response Format

### Success Response (200) - SSE Streaming Mode

The API returns an immediate response with streaming information:

```json
{
  "success": true,
  "intentType": "dustZap",
  "mode": "streaming",
  "intentId": "dustZap_1699123456789_abcdef_0123456789abcdef",
  "streamUrl": "/api/dustzap/dustZap_1699123456789_abcdef_0123456789abcdef/stream",
  "metadata": {
    "totalTokens": 5,
    "estimatedDuration": "10-20 seconds",
    "streamingEnabled": true
  }
}
```

### SSE Stream Events

Connect to the `streamUrl` to receive real-time events as tokens are processed:

#### Token Ready Event

```json
{
  "type": "token_ready",
  "tokenIndex": 0,
  "tokenSymbol": "TOKEN1",
  "tokenAddress": "0x1234567890123456789012345678901234567890",
  "transactions": [
    {
      "to": "0xA0b86a33E6417FFB4B8e2f28f4ce82b0D18e3f8a",
      "value": "0",
      "data": "0x095ea7b3...",
      "description": "Approve TOKEN1",
      "gasLimit": "50000"
    },
    {
      "to": "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
      "value": "0",
      "data": "0x415565b0...",
      "description": "Swap TOKEN1 to ETH",
      "gasLimit": "200000"
    }
  ],
  "provider": "1inch",
  "expectedTokenAmount": "1000000000000000000",
  "toUsd": 95.5,
  "gasCostUSD": 4.5,
  "tradingLoss": {
    "inputValueUSD": 100.0,
    "outputValueUSD": 95.5,
    "netLossUSD": 4.5,
    "lossPercentage": 4.5
  },
  "progress": 0.2,
  "processedTokens": 1,
  "totalTokens": 5,
  "timestamp": "2024-01-01T10:00:00.000Z"
}
```

#### Completion Event

```json
{
  "type": "complete",
  "transactions": [
    // All approve + swap transactions for all tokens
    // Plus fee transactions at the end
  ],
  "metadata": {
    "totalTokens": 5,
    "processedTokens": 5,
    "totalValueUSD": 500.0,
    "feeInfo": {
      "totalFeeUsd": 0.5,
      "referrerFeeUSD": 0.35,
      "treasuryFee": 0.15,
      "feeTransactionCount": 2
    },
    "estimatedTotalGas": "1521000"
  },
  "timestamp": "2024-01-01T10:00:20.000Z"
}
```

#### Error Event

```json
{
  "type": "token_failed",
  "tokenIndex": 2,
  "tokenSymbol": "TOKEN3",
  "error": "Insufficient liquidity",
  "progress": 0.6,
  "timestamp": "2024-01-01T10:00:15.000Z"
}
```

### Error Response (400/500)

```json
{
  "success": false,
  "error": {
    "code": "NO_DUST_TOKENS",
    "message": "No dust tokens found above threshold",
    "details": {
      "dustThreshold": 0.005,
      "tokensFound": 5,
      "tokensAboveThreshold": 0
    }
  }
}
```

## SSE Streaming Implementation

The DustZap intent uses Server-Sent Events (SSE) to provide real-time progress updates as tokens are processed. The API returns streaming information immediately, then processes tokens individually.

### Frontend Implementation Example

```javascript
// Get dustZap intent (returns streaming info immediately)
const response = await fetch('/api/v1/intents/dustZap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userAddress: '0x...',
    chainId: 1,
    params: {
      dustThreshold: 0.005,
      toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      toTokenDecimals: 18,
      slippage: 1,
    },
  }),
});

const { streamUrl, intentId, metadata } = await response.json();

// Connect to SSE stream for real-time updates
const eventSource = new EventSource(streamUrl);
const allTransactions = [];

eventSource.onmessage = async event => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'token_ready':
      console.log(`Token ${data.tokenSymbol} ready for execution`);
      console.log(`Progress: ${Math.round(data.progress * 100)}%`);

      // Execute this token's transactions immediately
      for (const tx of data.transactions) {
        const txWithGas = {
          ...tx,
          maxFeePerGas: await getMaxFeePerGas(),
          maxPriorityFeePerGas: await getMaxPriorityFeePerGas(),
        };
        await wallet.sendTransaction(txWithGas);
      }
      break;

    case 'token_failed':
      console.warn(`Token ${data.tokenSymbol} failed: ${data.error}`);
      break;

    case 'complete':
      console.log('All tokens processed!');
      allTransactions.push(...data.transactions);

      // Execute final fee transactions
      const feeTransactions = data.transactions.slice(
        -data.metadata.feeInfo.feeTransactionCount
      );
      for (const tx of feeTransactions) {
        const txWithGas = {
          ...tx,
          maxFeePerGas: await getMaxFeePerGas(),
          maxPriorityFeePerGas: await getMaxPriorityFeePerGas(),
        };
        await wallet.sendTransaction(txWithGas);
      }

      eventSource.close();
      break;

    case 'error':
      console.error('Stream error:', data.error);
      eventSource.close();
      break;
  }
};

eventSource.onerror = error => {
  console.error('SSE connection error:', error);
  eventSource.close();
};
```

### Stream Processing Benefits

- **Real-time feedback**: Users see progress as tokens are processed
- **Token-level granularity**: Each token completion is reported individually
- **Error resilience**: Failed tokens don't block successful ones
- **Trading analytics**: Each token includes loss calculations and DEX provider used
- **Progressive execution**: Execute transactions as they become available instead of waiting for all

## Supported Chains

- Ethereum (1)
- Polygon (137)
- BSC (56)
- Arbitrum (42161)
- Optimism (10)
- Base (8453)
- Avalanche (43114)
- Fantom (250)

## Token Filtering Rules

Dust tokens are identified using these criteria:

- **Minimum value**: Above dustThreshold (default $0.005)
- **Excludes stablecoins**: USDC, USDT, DAI, BUSD, etc.
- **Excludes native tokens**: ETH, WETH, MATIC, BNB, etc.
- **Excludes LP tokens**: Tokens with "-" or "/" in symbol
- **Excludes Aave tokens**: aTokens, debt tokens, etc.
- **Requires valid price**: Must have price data from price providers

## Fee Structure

- **Platform fee**: 0.01% of total conversion value
- **Fee distribution**:
  - With referral: 70% to referrer, 30% to treasury
  - Without referral: 100% to treasury

## Error Codes

- `INVALID_INPUT`: Invalid request parameters
- `NO_DUST_TOKENS`: No tokens found above threshold
- `VALIDATION_ERROR`: Input validation failed
- `EXTERNAL_SERVICE_ERROR`: Rebalance backend unavailable
- `LIQUIDITY_ERROR`: No swap routes found
- `INTERNAL_SERVER_ERROR`: Unexpected server error

## Rate Limits

The intent-engine inherits rate limiting from underlying services:

- DEX aggregators: Provider-specific limits
- Price providers: CoinMarketCap/CoinGecko limits
- Rebalance backend: Backend-specific limits

## Health Check

```
GET /api/v1/intents/health
```

Returns health status of all services including rebalance backend connectivity.
