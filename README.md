# Swap API Server

A Node.js Express API server that provides the best swap data from multiple DEX aggregators including 1inch, Paraswap, and 0x Protocol.

## Features

- **Multi-DEX Support**: Integrates with 1inch, Paraswap, and 0x Protocol
- **Retry Logic**: Automatic retry with exponential backoff for failed requests
- **Input Validation**: Comprehensive parameter validation using express-validator
- **Error Handling**: Robust error handling with meaningful error messages
- **CORS Support**: Configured for cross-origin requests
- **Testing**: Comprehensive test suite with Jest and Supertest

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd swap-api-server

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

#### Get Best Swap Data

```http
GET /the_best_swap_data
```

**Query Parameters:**
- `chainId` (required): Blockchain network ID (1, 10, 137, 42161, 8453)
- `fromTokenAddress` (required): Source token contract address
- `fromTokenDecimals` (required): Source token decimals (0-18)
- `toTokenAddress` (required): Destination token contract address
- `toTokenDecimals` (required): Destination token decimals (0-18)
- `amount` (required): Amount to swap (in smallest token unit)
- `fromAddress` (required): User's wallet address
- `slippage` (required): Slippage tolerance (0-100)
- `provider` (required): DEX aggregator ('1inch', 'paraswap', '0x')
- `to_token_price` (required): Destination token price in USD
- `eth_price` (optional): ETH price in USD (default: 1000)

**Example Request:**
```bash
curl "http://localhost:3002/the_best_swap_data?chainId=1&fromTokenAddress=0xA0b86a33E6441c8e4B23b4bcBd3e5ccB30B4c1b2&fromTokenDecimals=18&toTokenAddress=0xdAC17F958D2ee523a2206206994597C13D831ec7&toTokenDecimals=6&amount=1000000000000000000&fromAddress=0x1234567890123456789012345678901234567890&slippage=1&provider=1inch&to_token_price=1000&eth_price=2000"
```

**Response:**
```json
{
  "approve_to": "0x...",
  "to": "0x...",
  "toAmount": "1000000000",
  "minToAmount": "990000000",
  "data": "0x...",
  "gasCostUSD": 25.50,
  "gas": 200000,
  "custom_slippage": 1,
  "toUsd": 974.50
}
```

#### Get Supported Providers

```http
GET /supported_providers
```

**Response:**
```json
{
  "providers": ["1inch", "paraswap", "0x"]
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

## Architecture

### Project Structure

```
swap-api-server/
├── src/
│   ├── services/
│   │   ├── dexAggregators/
│   │   │   ├── oneinch.js      # 1inch API integration
│   │   │   ├── paraswap.js     # Paraswap API integration
│   │   │   └── zerox.js        # 0x Protocol API integration
│   │   └── swapService.js      # Main swap orchestration service
│   ├── utils/
│   │   ├── retry.js            # Retry logic utilities
│   │   └── validation.js       # Input validation middleware
│   ├── middleware/
│   │   ├── cors.js             # CORS configuration
│   │   └── errorHandler.js     # Global error handling
│   ├── routes/
│   │   └── swap.js             # API route definitions
│   └── app.js                  # Main application setup
├── test/
│   └── swap.test.js            # Test suite
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