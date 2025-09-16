function mapDustZapError(error) {
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred while processing dustZap intent';
  let details = {};

  if (error.message.includes('No dust tokens found')) {
    statusCode = 400;
    errorCode = 'NO_DUST_TOKENS';
    message = error.message;
  } else if (
    error.message.includes('Invalid') ||
    error.message.includes('must be')
  ) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = error.message;
  } else if (error.message.includes('Rebalance backend')) {
    statusCode = 503;
    errorCode = 'EXTERNAL_SERVICE_ERROR';
    message = 'Unable to fetch token balances from backend service';
    details = { service: 'rebalance_backend' };
  } else if (error.message.includes('swap quote')) {
    statusCode = 503;
    errorCode = 'LIQUIDITY_ERROR';
    message = 'Unable to find swap routes for some tokens';
  }

  return { statusCode, errorCode, message, details };
}

function mapUnifiedZapError(error) {
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message =
    'An unexpected error occurred while processing unified zap intent';
  let details = {};

  const errorMessage = error.message;

  // Strategy validation errors
  if (
    errorMessage.includes('strategyAllocations') ||
    errorMessage.includes('Strategy percentages')
  ) {
    statusCode = 400;
    errorCode = 'STRATEGY_VALIDATION_ERROR';
    message = error.message;
  } else if (errorMessage.includes('Unknown strategy')) {
    statusCode = 400;
    errorCode = 'UNKNOWN_STRATEGY';
    message = error.message;
  } else if (errorMessage.includes('Unsupported chainId')) {
    statusCode = 400;
    errorCode = 'UNSUPPORTED_CHAIN';
    message = error.message;
  } else if (
    errorMessage.includes('Strategy') &&
    errorMessage.includes('has no enabled protocols')
  ) {
    statusCode = 400;
    errorCode = 'STRATEGY_UNAVAILABLE';
    message = error.message;
  }
  // Input validation errors
  else if (
    errorMessage.includes('Invalid userAddress') ||
    errorMessage.includes('Invalid chainId') ||
    errorMessage.includes('Invalid inputToken') ||
    errorMessage.includes('inputAmount')
  ) {
    statusCode = 400;
    errorCode = 'INPUT_VALIDATION_ERROR';
    message = error.message;
  }
  // Slippage validation
  else if (errorMessage.includes('slippage')) {
    statusCode = 400;
    errorCode = 'SLIPPAGE_ERROR';
    message = error.message;
  }
  // Protocol execution errors
  else if (
    errorMessage.includes('Protocol') &&
    (errorMessage.includes('failed') || errorMessage.includes('error'))
  ) {
    statusCode = 503;
    errorCode = 'PROTOCOL_EXECUTION_ERROR';
    message = 'Failed to execute protocol transaction';
    details = { originalError: error.message };
  }
  // External service errors
  else if (
    errorMessage.includes('swap quote') ||
    errorMessage.includes('price')
  ) {
    statusCode = 503;
    errorCode = 'EXTERNAL_SERVICE_ERROR';
    message = 'Unable to fetch required market data';
    details = { service: 'price_service' };
  } else if (errorMessage.includes('gas estimation')) {
    statusCode = 503;
    errorCode = 'GAS_ESTIMATION_ERROR';
    message = 'Unable to estimate transaction gas costs';
  }
  // Generic validation errors
  else if (
    errorMessage.includes('must be') ||
    errorMessage.includes('required') ||
    errorMessage.includes('Invalid')
  ) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = error.message;
  }

  return { statusCode, errorCode, message, details };
}

module.exports = { mapDustZapError, mapUnifiedZapError };
