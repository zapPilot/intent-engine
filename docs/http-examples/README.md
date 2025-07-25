# HTTP API Examples

This directory contains comprehensive HTTP request examples for testing the Intent Engine API endpoints during development.

## Files Overview

- **`intents.http`** - Intent-based operations (DustZap, ZapIn, ZapOut, Optimize)
- **`swaps.http`** - DEX aggregator swap operations and quotes
- **`prices.http`** - Token price data with fallback providers
- **`health.http`** - Health checks, monitoring, and utility endpoints

## How to Use

### VS Code REST Client Extension

1. Install the [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) extension
2. Open any `.http` file in VS Code
3. Click "Send Request" above any request block
4. View responses in a split pane

### IntelliJ HTTP Client

1. Open any `.http` file in IntelliJ IDEA or WebStorm
2. Click the green arrow (▶️) next to any request
3. View responses in the tool window

### curl Commands

You can also copy the request details and convert them to curl commands:

```bash
# Example: Basic health check
curl -X GET "http://localhost:3002/health" \
  -H "Content-Type: application/json"

# Example: Get token prices
curl -X GET "http://localhost:3002/tokens/prices?tokens=btc,eth,usdc" \
  -H "Content-Type: application/json"
```

## Environment Setup

### Default Configuration

All examples use `http://localhost:3002` as the base URL. Make sure your Intent Engine server is running on this port.

### Custom Base URL

To use a different base URL, update the `@baseUrl` variable in each file:

```http
@baseUrl = https://your-api-domain.com
```

## Testing Workflow

### 1. Basic Health Check

Start with `health.http` to verify the API is running:

```http
GET {{baseUrl}}/health
```

### 2. Service Status

Check all services are operational:

```http
GET {{baseUrl}}/api/v1/intents/health
```

### 3. Provider Status

Verify DEX and price providers:

```http
GET {{baseUrl}}/swap/providers
GET {{baseUrl}}/tokens/providers
```

### 4. Core Functionality

Test main features:

- Price fetching (`prices.http`)
- Swap quotes (`swaps.http`)
- Intent operations (`intents.http`)

## Key Endpoints

### Intent Operations

| Endpoint                         | Method | Description                      |
| -------------------------------- | ------ | -------------------------------- |
| `/api/v1/intents/dustZap`        | POST   | Convert dust tokens to ETH       |
| `/api/dustzap/{intentId}/stream` | GET    | SSE stream for real-time updates |
| `/api/v1/intents`                | GET    | List supported intent types      |

### Swap Operations

| Endpoint          | Method | Description            |
| ----------------- | ------ | ---------------------- |
| `/swap/quote`     | GET    | Get optimal swap quote |
| `/swap/providers` | GET    | List DEX providers     |

### Price Operations

| Endpoint                 | Method | Description           |
| ------------------------ | ------ | --------------------- |
| `/tokens/prices`         | GET    | Bulk token prices     |
| `/tokens/price/{symbol}` | GET    | Single token price    |
| `/tokens/providers`      | GET    | Price provider status |

### Health & Monitoring

| Endpoint                 | Method | Description                  |
| ------------------------ | ------ | ---------------------------- |
| `/health`                | GET    | Basic health check           |
| `/api/v1/intents/health` | GET    | Comprehensive service health |

## Real Examples

### DustZap Intent

```http
POST {{baseUrl}}/api/v1/intents/dustZap
Content-Type: application/json

{
  "userAddress": "0x2eCBC6f229feD06044CDb0dD772437a30190CD50",
  "chainId": 1,
  "params": {
    "dustThreshold": 5,
    "targetToken": "ETH",
    "toTokenAddress": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "toTokenDecimals": 18,
    "slippage": 1
  }
}
```

### Swap Quote

```http
GET {{baseUrl}}/swap/quote?chainId=1&fromTokenAddress=0xA0b86a33E6441c8e4B23b4bcBd3e5ccB30B4c1b2&fromTokenDecimals=6&toTokenAddress=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&toTokenDecimals=18&amount=1000000&fromAddress=0x2eCBC6f229feD06044CDb0dD772437a30190CD50&slippage=1&to_token_price=3000&eth_price=3000
```

### Token Prices

```http
GET {{baseUrl}}/tokens/prices?tokens=btc,eth,usdc&useCache=true
```

## Common Token Addresses

### Ethereum Mainnet (chainId: 1)

- **ETH**: `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`
- **USDC**: `0xA0b86a33E6441c8e4B23b4bcBd3e5ccB30B4c1b2`
- **USDT**: `0xdAC17F958D2ee523a2206206994597C13D831ec7`
- **WETH**: `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`

### Arbitrum (chainId: 42161)

- **WETH**: `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1`
- **USDC**: `0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8`

### Base (chainId: 8453)

- **WETH**: `0x4200000000000000000000000000000000000006`
- **USDC**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

## Error Testing

Each file includes error scenarios to test validation and error handling:

- Invalid parameters
- Non-existent endpoints
- Malformed requests
- Rate limiting scenarios
- Network timeout simulation

## Interactive Documentation

For a complete interactive API documentation, visit:

```
http://localhost:3002/api-docs
```

This provides a Swagger UI where you can test endpoints directly in your browser.

## Environment Variables

Make sure your `.env` file contains the required API keys:

```env
# DEX Aggregator API Keys
ONE_INCH_API_KEY=your_1inch_api_key_here
ZEROX_API_KEY=your_0x_api_key_here

# Price API Keys
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key_here

# Server Configuration
PORT=3002
NODE_ENV=development
```

## Troubleshooting

### Common Issues

1. **Connection Refused**: Ensure the server is running on port 3002
2. **API Key Errors**: Check your `.env` file has valid API keys
3. **Timeout Errors**: Increase timeout values in requests
4. **Rate Limiting**: Wait a few seconds between requests during testing

### Debug Mode

Enable debug logging by setting:

```env
DEBUG_TESTS=true
```

This will provide more detailed error information in the console.
