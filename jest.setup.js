// Jest setup file for global test configuration

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3004';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/intent_engine_test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX_REQUESTS = '1000'; // Higher limit for tests

// Mock external dependencies that aren't needed for tests
jest.mock('./src/config/database', () => ({
  database: {
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  },
}));

// Increase test timeout for integration tests
jest.setTimeout(10000);

// Clean up after tests
afterEach(() => {
  jest.clearAllMocks();
});

// Suppress console logs during tests unless LOG_LEVEL is set
if (process.env.LOG_LEVEL === 'silent') {
  global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
}