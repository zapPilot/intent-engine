# SSE Standardization Components

## Overview

Created standardized SSE streaming utilities and patterns for intent endpoints that return batch transactions.

## New Components

### 1. SSEStreamManager (`src/services/SSEStreamManager.js`)

**Purpose**: Reusable SSE streaming utilities for intent endpoints
**Key Features**:

- Standardized SSE header setup
- Stream initialization with connection events
- Error handling patterns
- Stream cleanup utilities
- Intent ID validation helpers
- Complete endpoint factory function

**Methods**:

- `initializeStream(res, intentId, metadata)` - Setup SSE connection
- `handleStreamError(res, error, context)` - Standardized error handling
- `closeStream(res, finalEvent, delay)` - Graceful stream closure
- `createStreamEndpoint(options)` - Factory for complete SSE endpoints
- `validateIntentId(req, validateId, isExpired)` - Intent ID validation

### 2. Enhanced SSEEventFactory (`src/services/SSEEventFactory.js`)

**Purpose**: Extended with intent batch transaction event types
**New Event Types**:

- `createIntentBatchEvent(batchData)` - Intent batch transaction events
- `createTransactionUpdateEvent(txnData)` - Individual transaction updates

### 3. Standardized Event Types (`src/utils/SwapErrorClassifier.js`)

**Extended**: Added new SSE_EVENT_TYPES for intent batch transactions:

- `INTENT_BATCH: 'intent_batch'` - Batch processing events
- `TRANSACTION_UPDATE: 'transaction_update'` - Individual txn updates
- `BATCH_PROCESSING: 'batch_processing'` - Batch status updates
- `BATCH_COMPLETE: 'batch_complete'` - Batch completion
- `BATCH_FAILED: 'batch_failed'` - Batch failure

## Refactored Implementation

### DustZap Streaming Endpoint

**File**: `src/routes/intents.js`
**Changes**:

- Uses SSEStreamManager utilities
- Standardized validation and error handling
- Clean separation of concerns
- Consistent error response patterns

## Usage Pattern for Future Endpoints

```javascript
// Simple pattern using the manager
router.get('/api/intent/:intentId/stream',
  SSEStreamManager.createStreamEndpoint({
    validateParams: (req) => validateLogic,
    getExecutionContext: (intentId) => getContext,
    processStream: async (context, writer) => streamLogic,
    cleanup: (intentId) => cleanupLogic,
    intentType: 'intentName'
  })
);

// Custom pattern for complex validation
const customHandler = async (req, res) => {
  const validation = SSEStreamManager.validateIntentId(req, validateFn, expiredFn);
  if (!validation.isValid) return res.status(validation.statusCode).json({...});

  const streamWriter = SSEStreamManager.initializeStream(res, intentId, metadata);
  // ... streaming logic
  SSEStreamManager.closeStream(res);
};
```

## Intent Batch Transaction Events Structure

```javascript
// Batch event structure
{
  type: 'intent_batch',
  batchId: 'batch_123',
  intentType: 'dustZap',
  batchIndex: 0,
  totalBatches: 3,
  progress: 0.33,
  status: 'completed', // 'processing', 'completed', 'failed'
  transactions: [...],
  metadata: { batchSize: 5 },
  timestamp: '2024-01-01T00:00:00.000Z'
}

// Transaction update structure
{
  type: 'transaction_update',
  transactionId: 'txn_456',
  txnIndex: 0,
  totalTxns: 5,
  progress: 0.2,
  status: 'confirmed', // 'pending', 'confirmed', 'failed'
  transactionHash: '0x...',
  gasUsed: 21000,
  blockNumber: 12345,
  timestamp: '2024-01-01T00:00:00.000Z'
}
```

## Test Coverage

- HTTP endpoint validation tests: `test/dustZapStreaming.test.js`
- SSE functionality tests: `test/sseStreaming.test.js`
- All 250 tests passing post-refactor

## Benefits

1. **Consistency** - Standardized patterns across all streaming endpoints
2. **Maintainability** - Centralized SSE logic and error handling
3. **Extensibility** - Easy to add new intent streaming endpoints
4. **Reliability** - Robust error handling and cleanup patterns
5. **Performance** - Optimized streaming with proper resource management
