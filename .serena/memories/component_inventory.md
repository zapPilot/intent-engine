# Component Inventory

## Architecture Overview

- **Backend**: Node.js/Express API for user management and reporting
- **Intent Engine**: Intent-based execution system for DeFi operations
- **Architecture**: Microservices with clear separation of concerns

## Intent System Components

### Core Intent Infrastructure

- **BaseIntentHandler** (`src/intents/BaseIntentHandler.js`) - Base class for all intent handlers
- **IntentService** (`src/intents/IntentService.js`) - Main service coordinating intent execution
- **DustZapIntentHandler** (`src/intents/DustZapIntentHandler.js`) - Handles dust token conversion intents

### Specialized Components (Post-Refactoring)

- **DustZapValidator** (`src/validators/DustZapValidator.js`) - Validation logic for DustZap intents
- **ExecutionContextManager** (`src/managers/ExecutionContextManager.js`) - Context storage and cleanup management
- **DustZapExecutor** (`src/executors/DustZapExecutor.js`) - Core business logic for DustZap processing

### SSE Streaming Infrastructure

- **SSEStreamManager** (`src/services/SSEStreamManager.js`) - Reusable SSE streaming utilities
- **DustZapSSEOrchestrator** (`src/services/SSEStreamManager.js`) - Orchestrates SSE streaming for DustZap intents
- **SSEEventFactory** (`src/services/SSEEventFactory.js`) - Standardized SSE event creation
- **SwapProcessingService** (`src/services/SwapProcessingService.js`) - Swap processing with SSE integration

### Services

- **FeeCalculationService** (`src/services/FeeCalculationService.js`) - Fee calculation logic
- **SmartFeeInsertionService** (`src/services/SmartFeeInsertionService.js`) - Dynamic fee insertion
- **RebalanceBackendClient** (`src/services/RebalanceBackendClient.js`) - External service client

### Utilities

- **SwapErrorClassifier** (`src/utils/SwapErrorClassifier.js`) - Error classification and SSE event mapping
- **IntentIdGenerator** (`src/utils/intentIdGenerator.js`) - Intent ID generation for tracking
- **dustFilters** (`src/utils/dustFilters.js`) - Token filtering utilities

## Configuration

- **dustZapConfig** (`src/config/dustZapConfig.js`) - DustZap-specific configuration including SSE settings
- **swaggerConfig** (`src/config/swaggerConfig.js`) - API documentation configuration

## Current Refactoring Status

1. ✅ **God Class Decomposition** - DustZapIntentHandler decomposed into focused components
2. ✅ **Long Method Extraction** - SwapProcessingService method refactored
3. ✅ **SSE Infrastructure Separation** - COMPLETE - DustZapSSEOrchestrator created

## Notes

- All components follow Single Responsibility Principle
- Facade pattern used for backward compatibility
- SSE streaming logic successfully consolidated into dedicated orchestrator
- Business logic cleanly separated from infrastructure concerns
- 249/250 tests passing (99.6% success rate)
