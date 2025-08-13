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

module.exports = { mapDustZapError };
