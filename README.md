# Intent Engine

A scalable transaction orchestration service for DeFi operations in the All Weather Protocol ecosystem.

## Overview

The Intent Engine handles complex transaction preparation and execution for:
- Multi-hop swaps across DEX aggregators
- Cross-chain bridging operations
- Portfolio rebalancing workflows
- Zap-in/zap-out operations

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
npm start
```

## API Endpoints

### Execute Intent
```bash
POST /api/v1/intent/execute
```

### Get Quote
```bash
GET /api/v1/intent/quote
```

## Development

- TypeScript for type safety
- Express.js for HTTP server
- Redis for caching
- PostgreSQL for persistence
- Jest for testing

## Architecture

The service follows a modular architecture:
- Controllers handle HTTP requests
- Services contain business logic
- Integrations manage external APIs
- Utils provide shared functionality

## Contributing

1. Follow TypeScript strict mode
2. Maintain test coverage >80%
3. Use conventional commits
4. Run linting before commits