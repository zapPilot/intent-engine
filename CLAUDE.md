# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the Intent Engine codebase.

## Project Overview

The Intent Engine is a specialized API service that handles complex DeFi transaction orchestration for the All Weather Protocol. It migrates heavy transaction logic from the frontend to provide scalable, optimized, and wallet-agnostic transaction building.

## Development Commands

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript  
npm run start        # Start production server
npm run test         # Run Jest test suite
npm run test:coverage # Run tests with coverage report (target: >90%)
npm run lint         # ESLint code checking
npm run format       # Format code with Prettier
```

## Architecture Overview

### Core Components

- **Controllers** (`src/controllers/`) - HTTP request handlers
  - `IntentController.ts` - Main intent processing endpoint
  - `QuoteController.ts` - Price quotes and route estimation

- **Services** (`src/services/`) - Business logic layer
  - `TransactionBuilder.ts` - Core transaction construction logic

- **Integrations** (`src/integrations/`) - External API adapters
  - `swap-providers/` - DEX aggregator integrations (1inch, Paraswap, 0x)

- **Utils** (`src/utils/`) - Shared utilities
  - `GasOptimizer.ts` - Gas estimation and optimization
  - `TransactionValidator.ts` - Pre-execution validation
  - `logger.ts` - Structured logging with Winston

- **Config** (`src/config/`) - Configuration management
  - `database.ts` - PostgreSQL configuration
  - `redis.ts` - Redis caching configuration

### Key Features Implemented

#### Multi-Provider Swap Integration ✅
- **1inch Provider** - Complete API integration with fallback handling
- **Paraswap Provider** - Full API integration with route optimization  
- **0x Provider** - Complete protocol integration
- **Provider abstraction** - Unified interface for all swap providers
- **Intelligent routing** - Best price and gas optimization across providers

#### Transaction Building ✅
- **Raw transaction output** - Compatible with any wallet library (ThirdWeb, MetaMask, WalletConnect)
- **Gas optimization** - Dynamic estimation with cost/speed preferences
- **Transaction validation** - Pre-execution safety checks and simulation
- **Error handling** - Comprehensive error recovery and retry logic

#### Infrastructure ✅
- **Express.js server** - Production-ready HTTP server with middleware
- **Redis caching** - Route and price caching for performance
- **PostgreSQL** - Intent logging and persistence
- **Comprehensive testing** - 96%+ test coverage with Jest
- **Docker support** - Containerized deployment

## API Design Philosophy

### Raw Transaction Output
The Intent Engine returns raw transaction data compatible with all wallet libraries:

```typescript
// Output format - works with any wallet
{
  "transactions": [
    {
      "to": "0x1111111254EEB25477B68fb85Ed929f73A960582",
      "data": "0x7c025200...",
      "value": "0", 
      "gasLimit": "150000",
      "chainId": 42161
    }
  ]
}
```

### Provider Abstraction
All swap providers implement the same interface for consistency:

```typescript
interface SwapProvider {
  getQuote(params: QuoteParams): Promise<Quote>;
  buildTransaction(params: SwapParams): Promise<Transaction>;
  getName(): string;
  getSupportedChains(): number[];
}
```

## Testing Guidelines

### Test Structure
- **Unit tests** - Individual service and utility functions
- **Integration tests** - API endpoints with supertest
- **Provider tests** - External API integration testing
- **Error scenario tests** - Failure case validation

### Running Tests
```bash
npm run test                    # Run all tests
npm run test:coverage          # Generate coverage report
npm run test -- --watch       # Watch mode for development
npm run test -- --verbose     # Detailed output
```

### Coverage Requirements
- **Minimum 90% overall coverage**
- **All new features must include tests**
- **Critical paths require 100% coverage**

## Development Workflow

### Adding New Swap Providers
1. Create provider class in `src/integrations/swap-providers/`
2. Implement the `SwapProvider` interface
3. Add API configuration and error handling
4. Create comprehensive unit tests
5. Add integration tests with mock responses
6. Update provider factory and routing logic
7. Update documentation

### Error Handling Patterns
- **Circuit breaker** - Fail fast on provider outages
- **Retry with exponential backoff** - Resilient API calls
- **Graceful degradation** - Fallback to alternative providers
- **Comprehensive logging** - Structured error reporting

### Performance Considerations
- **Target response times**: <500ms for quotes, <2s for transaction building
- **Caching strategy**: 95%+ cache hit rate for common routes
- **Concurrent handling**: Support 100+ simultaneous requests
- **Rate limiting**: Respect external API limits

## Configuration

### Environment Variables
```bash
# Server
PORT=3001
NODE_ENV=development

# Dependencies
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

### Dependencies
- **Production dependencies** - Express.js, Ethers.js, Redis, PostgreSQL client
- **Development dependencies** - Jest, TypeScript, ESLint, Prettier
- **External APIs** - 1inch, Paraswap, 0x for swap routing

## Integration with All Weather Protocol

### With Frontend
- **Raw transaction consumption** - Frontend receives transaction data to execute
- **Wallet agnostic** - Works with ThirdWeb, MetaMask, WalletConnect, etc.
- **Real-time updates** - WebSocket support for transaction status

### With Rebalance Backend (Python)
- **Portfolio analysis** - Calls rebalance backend for strategy calculations
- **DEX aggregator migration** - Intent Engine will replace rebalance_backend DEX logic
- **Current integration**: `routes.py` contains 178 lines of DEX code to migrate:
  ```python
  # rebalance_backend/routes.py - TO BE MIGRATED
  def get_the_best_swap_data(chain_id, from_token, to_token, amount, ...):
      # 1inch integration (lines 24-76)
      # Paraswap integration (lines 77-135) 
      # 0x integration (lines 136-170)
  ```
- **Migration plan**: Intent Engine will provide `/api/v1/intent/quote` to replace `/the_best_swap_data`
- **Backward compatibility**: Rebalance backend will call Intent Engine during transition

### Migration Integration Patterns

#### Before Migration (Current)
```typescript
// Rebalance backend has duplicate DEX logic
rebalance_backend/routes.py -> Direct API calls to 1inch/Paraswap/0x
intent-engine/integrations/ -> Separate implementations
```

#### After Migration (Target)
```typescript
// Centralized DEX logic in Intent Engine
rebalance_backend -> HTTP calls -> intent-engine/api/v1/intent/quote
frontend -> HTTP calls -> intent-engine/api/v1/intent/execute
```

#### Integration Code Patterns
```typescript
// Rebalance backend will call Intent Engine
const swapData = await axios.get('http://intent-engine/api/v1/intent/quote', {
  params: {
    fromToken: '0x...',
    toToken: '0x...',
    amount: '1000000',
    chainId: 42161,
    userAddress: '0x...',
    slippage: 0.5
  }
});

// Intent Engine provides consistent response format
const { bestRoute, alternatives, gasEstimate } = swapData.data;
```

### With Current Backend
- **User authentication** - Validates user permissions and tier levels
- **Fee calculation** - Retrieves protocol fees and user-specific rates

## Security Considerations

- **Input validation** - Joi schema validation for all API inputs
- **Rate limiting** - Per-user and global request throttling
- **API authentication** - JWT token validation for protected endpoints
- **Transaction validation** - Pre-execution safety checks
- **Audit logging** - Complete operation audit trail

## Monitoring & Observability

- **Health checks** - Dependency status monitoring
- **Structured logging** - Winston with correlation IDs
- **Performance metrics** - Response times and success rates
- **Error tracking** - Comprehensive error reporting and alerting

## Code Quality Standards

- **TypeScript strict mode** - All code must pass strict type checking
- **ESLint configuration** - Enforced code style and best practices
- **Prettier formatting** - Consistent code formatting
- **Conventional commits** - Semantic commit message format
- **Pre-commit hooks** - Automated quality checks

## Current Status & Next Steps

### Completed (Phases 1-3) ✅
- Core infrastructure and API framework
- Transaction building and validation
- Multi-provider swap integration (1inch, Paraswap, 0x)
- Comprehensive testing suite (96%+ coverage)

### In Progress (Phase 3.5) 🔄 HIGH PRIORITY
- **Rebalance Backend DEX Migration**
  - Consolidating duplicate DEX aggregator logic from rebalance_backend
  - Migrating production-tested 1inch, Paraswap, and 0x integrations
  - Adding Intent Engine quote endpoint to replace `/the_best_swap_data`
  - Implementing backward compatibility during transition

### Planned (Phases 4-6)
- Cross-chain bridge integration (Across, Squid)
- Complex workflow orchestration and rebalancing
- Frontend SDK development
- WebSocket real-time updates
- Production deployment and monitoring

### DEX Migration Priority
The immediate focus is eliminating code duplication between rebalance_backend and intent-engine:
- **Current**: Two separate DEX implementations
- **Target**: Single source of truth in Intent Engine
- **Benefits**: Improved performance, simplified maintenance, consistent error handling

## Troubleshooting

### Common Issues
- **Provider API errors** - Check API keys and rate limits
- **Redis connection** - Verify Redis server is running
- **Database connection** - Check PostgreSQL configuration
- **Test failures** - Run `npm run test:coverage` for detailed output

### Performance Issues
- **Slow response times** - Check provider response times and cache hit rates
- **High memory usage** - Monitor Redis cache size and database connections
- **Rate limiting** - Adjust provider request patterns and caching

---

**Note**: This service is currently in active development with Phases 1-3 complete. Always run the full test suite before making changes and maintain the 90%+ coverage requirement.