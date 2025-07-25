# Intent Engine

A Node.js Express API server for intent-based DeFi operations, providing optimal swap execution and bulk token pricing with intelligent fallback logic.

## Features

- **Intent-Based Swap Execution**: Automatically finds the best swap routes across multiple DEX aggregators
- **Multi-DEX Support**: Integrates with 1inch, Paraswap, and 0x Protocol
- **Bulk Token Pricing**: Get prices for multiple tokens with intelligent provider fallback
- **Smart Rate Limiting**: Token bucket rate limiting with provider-specific configurations
- **Intelligent Fallback**: Tries providers in priority order, stops at first success
- **Comprehensive Caching**: In-memory caching with configurable TTL for price data
- **Multiple Price Sources**: CoinMarketCap, CoinGecko with extensible architecture
- **Retry Logic**: Automatic retry with exponential backoff for failed requests
- **Input Validation**: Comprehensive parameter validation using express-validator
- **Error Handling**: Robust error handling with meaningful error messages
- **CORS Support**: Configured for cross-origin requests
- **Testing**: Comprehensive test suite with Jest and Supertest

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd intent-engine

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure your API keys in .env
```

## Configuration

Create a `.env` file with the following variables:

```env
# DEX Aggregator API Keys
ONE_INCH_API_KEY=your_1inch_api_key_here
ZEROX_API_KEY=your_0x_api_key_here

# Price API Keys
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key_here,your_second_key_here

# Server Configuration
PORT=3002
NODE_ENV=development

# Retry Configuration
MAX_RETRIES=3
RETRY_DELAY=3000
```

## Usage

### Start the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

### API Endpoints

#### Get Best Swap Quote (Intent-Based)

```http
GET /swap/quote
```

Automatically finds the best swap route across all available DEX aggregators.

**Query Parameters:**

- `chainId` (required): Blockchain network ID (1, 10, 137, 42161, 8453)
- `fromTokenAddress` (required): Source token contract address
- `fromTokenDecimals` (required): Source token decimals (0-18)
- `toTokenAddress` (required): Destination token contract address
- `toTokenDecimals` (required): Destination token decimals (0-18)
- `amount` (required): Amount to swap (in smallest token unit)
- `fromAddress` (required): User's wallet address
- `slippage` (required): Slippage tolerance (0-100)
- `to_token_price` (required): Destination token price in USD
- `eth_price` (optional): ETH price in USD (default: 1000)

**Example Request:**

```bash
curl "http://localhost:3002/swap/quote?chainId=1&fromTokenAddress=0xA0b86a33E6441c8e4B23b4bcBd3e5ccB30B4c1b2&fromTokenDecimals=18&toTokenAddress=0xdAC17F958D2ee523a2206206994597C13D831ec7&toTokenDecimals=6&amount=1000000000000000000&fromAddress=0x1234567890123456789012345678901234567890&slippage=1&to_token_price=1000"
```

**Response:**

```json
{
  "approve_to": "0x...",
  "to": "0x...",
  "toAmount": "1000000000",
  "minToAmount": "990000000",
  "data": "0x...",
  "gasCostUSD": 25.5,
  "gas": 200000,
  "custom_slippage": 100,
  "toUsd": 974.5,
  "provider": "1inch",
  "allQuotes": [
    {
      "provider": "1inch",
      "toUsd": 974.5,
      "gasCostUSD": 25.5,
      "toAmount": "1000000000"
    },
    {
      "provider": "paraswap",
      "toUsd": 970.2,
      "gasCostUSD": 29.8,
      "toAmount": "1000000000"
    }
  ]
}
```

#### Get Bulk Token Prices

```http
GET /tokens/prices
```

Get prices for multiple tokens with intelligent fallback across price providers.

**Query Parameters:**

- `tokens` (required): Comma-separated token symbols (e.g., `btc,eth,usdc`)
- `useCache` (optional): Whether to use cached prices (default: true)
- `timeout` (optional): Request timeout in milliseconds (default: 5000)

**Example Request:**

```bash
curl "http://localhost:3002/tokens/prices?tokens=btc,eth,usdc&useCache=true"
```

**Response:**

```json
{
  "results": {
    "btc": {
      "success": true,
      "price": 45000.5,
      "symbol": "btc",
      "provider": "coinmarketcap",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "fromCache": false,
      "metadata": {
        "tokenId": "1",
        "marketCap": 850000000000,
        "volume24h": 25000000000,
        "percentChange24h": 2.5
      }
    },
    "eth": {
      "success": true,
      "price": 2800.25,
      "symbol": "eth",
      "provider": "coinmarketcap",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "fromCache": false
    }
  },
  "errors": [],
  "totalRequested": 3,
  "fromCache": 0,
  "fromProviders": 2,
  "failed": 1,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Get Single Token Price

```http
GET /tokens/price/:symbol
```

**Example Request:**

```bash
curl "http://localhost:3002/tokens/price/btc?useCache=false"
```

#### Get Supported Providers

```http
GET /swap/providers
```

**Response:**

```json
{
  "providers": ["1inch", "paraswap", "0x"]
}
```

#### Get Price Providers Status

```http
GET /tokens/providers
```

**Response:**

```json
{
  "providers": ["coinmarketcap", "coingecko"],
  "status": {
    "coinmarketcap": {
      "name": "coinmarketcap",
      "available": true,
      "apiKeysCount": 2,
      "currentKeyIndex": 0
    },
    "coingecko": {
      "name": "coingecko",
      "available": true,
      "requiresApiKey": false
    }
  },
  "rateLimits": {
    "coinmarketcap": {
      "tokens": 25,
      "capacity": 30,
      "rate": 0.5
    },
    "coingecko": {
      "tokens": 95,
      "capacity": 100,
      "rate": 1.67
    }
  }
}
```

#### Health Check

```http
GET /health
```

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Interactive API Documentation

### Swagger UI

Access the interactive API documentation at:

```
http://localhost:3002/api-docs
```

The Swagger UI provides:

- **Complete API Reference**: All endpoints with detailed parameters and response schemas
- **Interactive Testing**: Test endpoints directly in your browser
- **Request/Response Examples**: Real examples for all endpoints
- **Schema Documentation**: Detailed data models and validation rules
- **Authentication Info**: API key requirements and usage

### Development Testing

For development and testing, use the comprehensive HTTP request collections in `docs/http-examples/`:

- **`intents.http`** - Intent-based operations (DustZap, ZapIn, ZapOut, Optimize)
- **`swaps.http`** - DEX aggregator swap operations and quotes
- **`prices.http`** - Token price data with fallback providers
- **`health.http`** - Health checks, monitoring, and utility endpoints

These files work with:

- [VS Code REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) extension
- IntelliJ HTTP Client
- Any tool that supports `.http` files

See `docs/http-examples/README.md` for detailed usage instructions.

## Architecture

### Project Structure

```
intent-engine/
├── src/
│   ├── services/
│   │   ├── dexAggregators/
│   │   │   ├── oneinch.js      # 1inch API integration
│   │   │   ├── paraswap.js     # Paraswap API integration
│   │   │   └── zerox.js        # 0x Protocol API integration
│   │   ├── priceProviders/
│   │   │   ├── coinmarketcap.js # CoinMarketCap API integration
│   │   │   └── coingecko.js    # CoinGecko API integration
│   │   ├── rateLimiting/
│   │   │   ├── tokenBucket.js   # Token bucket rate limiter
│   │   │   └── rateLimitManager.js # Rate limit orchestration
│   │   ├── swapService.js      # Main swap orchestration service
│   │   └── priceService.js     # Main price orchestration service
│   ├── config/
│   │   ├── priceConfig.js      # Price provider configuration
│   │   └── swaggerConfig.js    # Swagger/OpenAPI configuration
│   ├── utils/
│   │   ├── retry.js            # Retry logic utilities
│   │   └── validation.js       # Input validation middleware
│   ├── middleware/
│   │   ├── cors.js             # CORS configuration
│   │   └── errorHandler.js     # Global error handling
│   ├── routes/
│   │   ├── swap.js             # Swap API route definitions
│   │   └── intents.js          # Intent API route definitions
│   └── app.js                  # Main application setup
├── docs/
│   └── http-examples/          # HTTP request examples for testing
│       ├── intents.http        # Intent endpoint examples
│       ├── swaps.http          # Swap endpoint examples
│       ├── prices.http         # Price endpoint examples
│       ├── health.http         # Health check examples
│       └── README.md           # HTTP examples documentation
├── test/
│   ├── swap.test.js            # Swap functionality tests
│   └── price.test.js           # Price functionality tests
├── package.json
├── .env.example
└── README.md
```

### DEX Aggregator Services

Each DEX aggregator is implemented as a separate service class:

- **OneInchService**: Handles 1inch API v5.2 integration
- **ParaswapService**: Handles Paraswap market API integration
- **ZeroXService**: Handles 0x allowance-holder API integration

All services implement a common interface and return standardized response formats.

### Price Provider Services

The price service implements intelligent fallback logic across multiple providers:

- **CoinMarketCapProvider**: Primary price provider with API key rotation
- **CoinGeckoProvider**: Secondary provider with generous rate limits
- **PriceService**: Orchestration service with caching and fallback logic

### Key Features

- **Priority-Based Fallback**: Providers are tried in configured priority order
- **Rate Limiting**: Token bucket algorithm prevents API quota exhaustion
- **Intelligent Caching**: Reduces API calls and improves response times
- **Bulk Processing**: Efficient handling of multiple token price requests
- **Error Resilience**: Graceful handling of provider failures and network issues

## Development Toolchain

### Code Quality & Formatting

```bash
# Run linter
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Format code with Prettier
npm run format

# Check if code is formatted correctly
npm run format:check

# Run all quality checks (lint + format + tests)
npm run quality

# Fix all quality issues automatically
npm run quality:fix
```

### Pre-commit Hooks

The project uses Husky for git hooks:

```bash
# Install Husky hooks (runs automatically after npm install)
npm run prepare

# Pre-commit hook runs automatically on git commit:
# - Lints and formats staged files
# - Runs tests to ensure nothing is broken
```

### Git Workflow

```bash
# Install dependencies and setup hooks
npm install

# Make changes to code
# ... edit files ...

# Attempt to commit (pre-commit hook will run)
git add .
git commit -m "feat: add new feature"

# If pre-commit fails, fix issues and try again
npm run quality:fix
git add .
git commit -m "feat: add new feature"
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Supported Networks

- **Ethereum** (1)
- **Optimism** (10)
- **Polygon** (137)
- **Arbitrum** (42161)
- **Base** (8453)

## Error Handling

The API provides comprehensive error handling for:

- Invalid parameters
- Network timeouts
- Rate limiting
- External API errors
- Unsupported providers/networks

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License
