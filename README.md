# Intent Engine

[![Test Coverage](https://img.shields.io/badge/coverage-78.57%25-brightgreen.svg)](https://github.com/your-org/intent-engine)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](https://github.com/your-org/intent-engine/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

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

#### Documentation & Testing

- **Production Documentation**: https://zappilot.github.io/intent-engine/
- **Local Development**: http://localhost:3002/api-docs
- **Health Check**: http://localhost:3002/health

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

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with verbose output
npm run test:verbose

# Run tests with debugging enabled
npm run test:debug
```

### Test Coverage

The project maintains comprehensive test coverage with the following minimum thresholds:

- **Statements**: 75%
- **Branches**: 60%
- **Functions**: 75%
- **Lines**: 75%

Coverage is automatically checked:
- On every commit via pre-commit hooks
- On pull requests via GitHub Actions
- When running `npm run test:coverage`

To check coverage locally:
```bash
# Run coverage check
npm run test:coverage

# Or use the coverage script
./check-coverage.sh
```

### Pre-commit Hooks

The project uses Husky to enforce code quality and test coverage:

1. **Lint-staged**: Runs on staged files only
   - ESLint for code linting
   - Prettier for code formatting
   - Jest for related test files

2. **Test Suite**: Runs all tests to ensure nothing is broken

3. **Coverage Check**: Ensures minimum coverage thresholds are met

## Docker Deployment

### Building the Docker Image

The Intent Engine includes a production-ready Dockerfile with integrated Swagger documentation:

```bash
# Build the Docker image
docker build -t intent-engine .

# Run the container
docker run -d \
  --name intent-engine \
  -p 3002:3002 \
  --env-file .env \
  intent-engine

# View logs
docker logs intent-engine

# Stop the container
docker stop intent-engine
```

### Environment Variables for Docker

Create a `.env` file with your API keys:

```env
# DEX Aggregator API Keys
ONE_INCH_API_KEY=your_1inch_api_key_here
ZEROX_API_KEY=your_0x_api_key_here

# Price API Keys
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key_here

# Server Configuration
PORT=3002
NODE_ENV=production

# Intent Engine Configuration
REBALANCE_BACKEND_URL=http://host.docker.internal:5000
REBALANCE_BACKEND_TIMEOUT=10000
```

### Docker Features

- **Multi-stage build** for optimized production image
- **Non-root user** for enhanced security
- **Health checks** for container monitoring
- **Integrated Swagger UI** available at `/api-docs`
- **Alpine Linux** base for minimal attack surface

### Accessing the API

Once the container is running:

- **API Base URL**: `http://localhost:3002`
- **Swagger Documentation**: `http://localhost:3002/api-docs`
- **Health Check**: `http://localhost:3002/health`

### Production Deployment

For production deployment, consider:

```bash
# Build with specific tag
docker build -t intent-engine:v1.0.0 .

# Run with restart policy and resource limits
docker run -d \
  --name intent-engine-prod \
  --restart unless-stopped \
  --memory="512m" \
  --cpus="1.0" \
  -p 3002:3002 \
  --env-file .env.production \
  intent-engine:v1.0.0
```

## Static Documentation

The API documentation is automatically deployed to GitHub Pages whenever code is pushed to the main branch.

### Accessing Documentation

- **Live Documentation**: Available at your GitHub Pages URL (e.g., `https://your-username.github.io/intent-engine/`)
- **Interactive Testing**: Full Swagger UI with live API examples
- **Downloadable Spec**: OpenAPI 3.0 specification in JSON format

### GitHub Pages Setup

1. Enable GitHub Pages in your repository settings
2. Set source to "GitHub Actions"
3. Push changes to main branch
4. Documentation will be automatically built and deployed

The static documentation includes:

- Complete API reference with examples
- Interactive endpoint testing (try-it-out disabled for static deployment)
- Downloadable OpenAPI specification
- Responsive design for mobile/desktop

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
