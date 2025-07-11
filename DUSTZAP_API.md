# DustZap Intent API Documentation

## Overview

The DustZap intent allows users to convert small token balances (dust) into ETH with a single API call that returns a batch of transactions. The intent-engine handles token filtering, optimal swap routing, and fee calculations.

## API Endpoint

```
POST /api/v1/intents/dustZap
```

## Request Format

```json
{
  "userAddress": "0x742d35Cc6634C0532925a3b8D5c5c8d8e2bBC9d0",
  "chainId": 1,
  "params": {
    "dustThreshold": 0.005,
    "targetToken": "ETH",
    "referralAddress": "0x1234567890123456789012345678901234567890"
  }
}
```

### Parameters

- **userAddress** (required): User's wallet address
- **chainId** (required): Chain ID (1=Ethereum, 137=Polygon, etc.)
- **params.dustThreshold** (optional): Minimum USD value to consider dust (default: 0.005)
- **params.targetToken** (optional): Target token for conversion (only "ETH" supported currently)
- **params.referralAddress** (optional): Referral address for fee sharing

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "intentType": "dustZap",
  "transactions": [
    {
      "to": "0xA0b86a33E6417FFB4B8e2f28f4ce82b0D18e3f8a",
      "value": "0",
      "data": "0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25eff0000000000000000000000000000000000000000000000000de0b6b3a7640000",
      "description": "Approve TOKEN1 for 0xdef1c0ded9bec7f1a1670819833240f027b25eff",
      "gasLimit": "50000"
    },
    {
      "to": "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
      "value": "0",
      "data": "0x415565b0000000000000000000000000a0b86a33e6417ffb4b8e2f28f4ce82b0d18e3f8a000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0000000000000000000000000000000000000000000000000de0b6b3a7640000",
      "description": "Swap TOKEN1 to ETH",
      "gasLimit": "200000"
    },
    {
      "to": "0x1234567890123456789012345678901234567890",
      "value": "1000000000000000",
      "data": "0x",
      "description": "Referrer fee (70%)",
      "gasLimit": "21000"
    },
    {
      "to": "0x742d35Cc6634C0532925a3b8D5c5c8d8e2bBC9d0",
      "value": "430000000000000",
      "data": "0x",
      "description": "Treasury fee (30%)",
      "gasLimit": "21000"
    }
  ],
  "metadata": {
    "totalTokens": 5,
    "batchInfo": [
      {
        "startIndex": 0,
        "endIndex": 9,
        "tokenCount": 5
      }
    ],
    "feeInfo": {
      "startIndex": 10,
      "endIndex": 11,
      "totalFeeUsd": 0.143,
      "referrerFeeEth": "1000000000000000",
      "treasuryFeeEth": "430000000000000"
    },
    "estimatedTotalGas": "1521000",
    "dustThreshold": 0.005
  }
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

## Transaction Execution

The response contains an array of transactions that should be executed sequentially:

1. **Approve transactions**: Grant permission for tokens to be spent
2. **Swap transactions**: Execute token-to-ETH swaps via DEX aggregators
3. **Fee transactions**: Transfer platform fees to referrer and treasury

### Frontend Implementation Example

```javascript
// Get dustZap intent
const response = await fetch('/api/v1/intents/dustZap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userAddress: '0x...',
    chainId: 1,
    params: { dustThreshold: 0.005 }
  })
});

const { transactions, metadata } = await response.json();

// Execute transactions sequentially
for (const batch of metadata.batchInfo) {
  const batchTxns = transactions.slice(batch.startIndex, batch.endIndex + 1);

  // Add gas parameters dynamically
  const txnsWithGas = batchTxns.map(tx => ({
    ...tx,
    maxFeePerGas: await getMaxFeePerGas(),
    maxPriorityFeePerGas: await getMaxPriorityFeePerGas()
  }));

  // Execute batch (approve + swap pairs)
  await wallet.sendTransaction(txnsWithGas);
}
```

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
