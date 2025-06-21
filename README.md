# Intent Engine

A scalable transaction orchestration service for DeFi operations in the All Weather Protocol ecosystem.

## Overview

The Intent Engine is a specialized API service that migrates complex transaction logic from the frontend to provide:
- **Multi-provider swap routing** - 1inch, Paraswap, 0x integration with intelligent fallbacks
- **Cross-chain bridging operations** - Across and Squid protocol integration
- **Portfolio rebalancing workflows** - Complex multi-step transaction orchestration
- **Gas optimization** - Dynamic gas estimation and cost optimization
- **Transaction validation** - Pre-execution safety checks and simulation
- **Wallet-agnostic execution** - Raw transaction output compatible with any wallet library

### Key Benefits
- **Reduced frontend complexity** - Move heavy Web3 logic to backend
- **Improved performance** - Server-side optimization and caching
- **Enhanced reliability** - Centralized error handling and retry logic
- **Better scalability** - Horizontal scaling and load balancing
- **Faster development** - Reusable transaction building components

## Quick Start

### Prerequisites
- Node.js >=18.0.0
- Redis server
- PostgreSQL database
- Environment variables configured

### Installation
```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your configuration

# Start development server
npm run dev

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build
npm start
```

### Environment Variables
```bash
PORT=3001
NODE_ENV=development
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:pass@localhost:5432/intent_engine

# API Keys
ONEINCH_API_KEY=your_1inch_api_key
PARASWAP_API_KEY=your_paraswap_api_key
ZEROX_API_KEY=your_0x_api_key

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## API Endpoints

### Health Check
```bash
GET /health
# Returns service status and dependencies
```

### Execute Intent
```bash
POST /api/v1/intent/execute
Content-Type: application/json

{
  "action": "swap",
  "params": {
    "fromToken": "0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037",
    "toToken": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    "amount": "1000000000000000000",
    "chainId": 42161,
    "slippageTolerance": 0.5
  },
  "userAddress": "0x...",
  "preferences": {
    "gasOptimization": "balanced",
    "provider": "auto"
  }
}

# Response:
{
  "intentId": "intent_123456",
  "transactions": [
    {
      "to": "0x1111111254EEB25477B68fb85Ed929f73A960582",
      "data": "0x7c025200...",
      "value": "0",
      "gasLimit": "150000",
      "chainId": 42161
    }
  ],
  "metadata": {
    "estimatedGas": "142354",
    "totalFees": "0.0015",
    "priceImpact": "0.12",
    "provider": "1inch",
    "executionTime": "~30s"
  }
}
```

### Get Quote
```bash
GET /api/v1/intent/quote?fromToken=0xA0b86a33E6441c8d59fb4b4df95c4FfAfFd46037&toToken=0x82aF49447D8a07e3bd95BD0d56f35241523fBab1&amount=1000000000000000000&chainId=42161

# Response:
{
  "bestRoute": {
    "provider": "1inch",
    "outputAmount": "1543210000000000000",
    "gasEstimate": "142354",
    "priceImpact": "0.12"
  },
  "alternatives": [
    {
      "provider": "paraswap",
      "outputAmount": "1541890000000000000",
      "gasEstimate": "156789",
      "priceImpact": "0.15"
    }
  ],
  "fees": {
    "gas": "0.0012",
    "protocol": "0.0003"
  }
}
```

## Development

### Technology Stack
- **TypeScript** - Type safety and enhanced developer experience
- **Express.js** - HTTP server with middleware support
- **Redis** - Caching and rate limiting
- **PostgreSQL** - Intent logging and persistence
- **Jest** - Comprehensive testing with 96%+ coverage
- **Ethers.js** - Web3 interactions and transaction building
- **Bull** - Background job processing
- **Winston** - Structured logging

### Development Commands
```bash
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript
npm run start        # Start production server
npm run test         # Run test suite
npm run test:coverage # Run tests with coverage report
npm run lint         # ESLint code checking
npm run format       # Format code with Prettier
```

### Testing
Comprehensive test suite includes:
- **Unit tests** - Individual service and utility testing
- **Integration tests** - API endpoint testing with supertest
- **Provider tests** - External API integration testing
- **Error handling tests** - Failure scenario validation
- **Performance tests** - Response time and throughput validation

### Code Quality
- **ESLint** - Code quality and style enforcement
- **Prettier** - Consistent code formatting
- **Husky** - Pre-commit hooks for quality gates
- **TypeScript strict mode** - Enhanced type checking
- **Jest coverage threshold** - Minimum 90% test coverage

## Architecture

### Service Structure
```
src/
├── controllers/           # HTTP request handlers
│   ├── IntentController.ts   # Main intent processing
│   └── QuoteController.ts    # Price quotes and estimates
├── services/             # Core business logic
│   └── TransactionBuilder.ts # Transaction construction
├── integrations/         # External API adapters
│   └── swap-providers/   # DEX aggregator integrations
│       ├── OneInchProvider.ts
│       ├── ParaswapProvider.ts
│       └── ZeroXProvider.ts
├── middleware/           # Express middleware
│   ├── errorHandler.ts   # Global error handling
│   └── validation.ts     # Request validation
├── utils/               # Shared utilities
│   ├── GasOptimizer.ts   # Gas estimation and optimization
│   ├── TransactionValidator.ts # Pre-execution validation
│   └── logger.ts         # Structured logging
├── config/              # Configuration management
│   ├── database.ts       # PostgreSQL configuration
│   └── redis.ts          # Redis configuration
└── types/               # TypeScript type definitions
```

### Design Principles
- **Modular Architecture** - Clear separation of concerns
- **Provider Abstraction** - Unified interface for different DEX aggregators
- **Error Resilience** - Comprehensive error handling and retry logic
- **Performance Optimization** - Intelligent caching and route selection
- **Extensibility** - Easy addition of new providers and protocols
- **Observability** - Comprehensive logging and monitoring

### Integration Patterns
- **Circuit Breaker** - Fail-fast on provider outages
- **Retry with Backoff** - Resilient external API calls
- **Rate Limiting** - Per-user and global request throttling
- **Caching Strategy** - Multi-layer caching for quotes and routes
- **Health Checks** - Dependency monitoring and status reporting

## Contributing

### Development Guidelines
1. **TypeScript strict mode** - All code must pass strict type checking
2. **Test coverage >90%** - Comprehensive testing required for all new features
3. **Conventional commits** - Use semantic commit message format
4. **Code review** - All changes require peer review
5. **Documentation** - Update README and inline docs for new features

### Commit Message Format
```
feat: add Paraswap provider integration
fix: handle rate limit errors in 1inch provider
test: add integration tests for quote controller
docs: update API documentation
refactor: optimize gas estimation logic
```

### Adding New Providers
1. Create provider class in `src/integrations/swap-providers/`
2. Implement the `SwapProvider` interface
3. Add comprehensive unit tests
4. Update provider factory and routing logic
5. Add integration tests
6. Update documentation

### Performance Considerations
- **Response time targets**: <500ms for quotes, <2s for transaction building
- **Concurrent requests**: Design for 100+ simultaneous requests
- **Cache efficiency**: Target 95%+ cache hit rate for common routes
- **Error rates**: Maintain <1% error rate under normal conditions

## Deployment

### Docker
```bash
# Build image
docker build -t intent-engine .

# Run container
docker run -p 3001:3001 --env-file .env intent-engine
```

### Production Checklist
- [ ] Environment variables configured
- [ ] Redis and PostgreSQL accessible
- [ ] API keys for all providers configured
- [ ] Monitoring and logging configured
- [ ] Health checks passing
- [ ] Load balancer configured
- [ ] SSL/TLS certificates installed

---

**Current Status**: Phases 1-3 complete (Foundation, Core Transaction Building, Multi-Provider Integration)
**Next Phase**: Rebalance Backend DEX Migration (Phase 3.5) - HIGH PRIORITY
**Test Coverage**: 96%+
**API Version**: v1

## Integration Status

### Rebalance Backend DEX Migration ✅ COMPLETED
The Intent Engine has successfully consolidated DEX aggregator logic from rebalance_backend:

#### Migration Completed
- **rebalance_backend/routes.py** (178 lines) DEX integrations migrated:
  - ✅ 1inch API integration with enhanced chain mapping and gas calculations
  - ✅ Paraswap API integration with proxy addresses and slippage handling  
  - ✅ 0x Protocol integration with USD calculations and fee optimization
  - ✅ EnhancedSwapService orchestrating all providers
  - ✅ `/api/v1/swap/enhanced` endpoint matching rebalance_backend functionality
  - ✅ Comprehensive test coverage (96%+ overall)

#### Migration Benefits Achieved
- **✅ Eliminated Code Duplication** - Single source of truth for all swap routing
- **✅ Improved Performance** - Centralized provider comparison and selection
- **✅ Simplified Maintenance** - Provider APIs consolidated in Intent Engine
- **✅ Enhanced Error Handling** - Circuit breakers, retry logic, and graceful degradation

#### Next Steps
- [ ] Update rebalance_backend to call Intent Engine `/api/v1/swap/enhanced`
- [ ] Deprecate GET /the_best_swap_data endpoint in rebalance_backend
- [ ] Add backward compatibility layer during transition