/**
 * Jest Test Setup
 * Provides console output suppression with debug capabilities
 */

// Store original console methods
const originalConsole = {
  error: console.error,
  warn: console.warn,
  info: console.info,
  log: console.log,
  debug: console.debug,
};

// Check if debug mode is enabled
const isDebugMode =
  process.env.DEBUG_TESTS === 'true' || process.env.NODE_ENV !== 'test';

/**
 * Mock console methods to suppress output during tests
 * Unless debug mode is enabled
 */
function setupConsoleMocking() {
  if (!isDebugMode) {
    // Mock console methods to suppress output
    console.error = jest.fn();
    console.warn = jest.fn();
    console.info = jest.fn();
    console.log = jest.fn();
    console.debug = jest.fn();
  }
}

/**
 * Restore original console methods
 */
function restoreConsole() {
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
  console.log = originalConsole.log;
  console.debug = originalConsole.debug;
}

/**
 * Mock console methods (force suppression)
 */
function mockConsole() {
  console.error = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();
  console.log = jest.fn();
  console.debug = jest.fn();
}

/**
 * Get console mocks for testing console calls
 */
function getConsoleMocks() {
  return {
    error: console.error,
    warn: console.warn,
    info: console.info,
    log: console.log,
    debug: console.debug,
  };
}

// Setup console mocking by default
setupConsoleMocking();

// Make utilities available globally for individual tests
global.restoreConsole = restoreConsole;
global.mockConsole = mockConsole;
global.getConsoleMocks = getConsoleMocks;
global.originalConsole = originalConsole;

// Log setup status (only in debug mode)
if (isDebugMode) {
  console.info('🔧 Test setup: Console output enabled (DEBUG_TESTS=true)');
} else {
  // Use original console.info to show this message even when mocked
  originalConsole.info(
    '🔇 Test setup: Console output suppressed (use DEBUG_TESTS=true to enable)'
  );
}

// Clean up after each test
afterEach(() => {
  // Reset console mocks if they exist
  if (jest.isMockFunction(console.error)) {
    console.error.mockReset();
  }
  if (jest.isMockFunction(console.warn)) {
    console.warn.mockReset();
  }
  if (jest.isMockFunction(console.info)) {
    console.info.mockReset();
  }
  if (jest.isMockFunction(console.log)) {
    console.log.mockReset();
  }
  if (jest.isMockFunction(console.debug)) {
    console.debug.mockReset();
  }
});

// Global test timeout warning
const originalTimeout = setTimeout;
global.setTimeout = (fn, delay) => {
  if (delay > 25000) {
    if (isDebugMode) {
      originalConsole.warn(`⚠️  Long timeout detected: ${delay}ms`);
    }
  }
  return originalTimeout(fn, delay);
};

// Global cleanup to prevent hanging tests
afterAll(() => {
  // Clear all timers and intervals to prevent Jest from hanging
  jest.clearAllTimers();

  // Clear all module cache to ensure cleanup of any singleton instances
  Object.keys(require.cache).forEach(key => {
    if (!key.includes('node_modules')) {
      delete require.cache[key];
    }
  });

  // Force garbage collection if available (Node.js specific)
  if (global.gc) {
    global.gc();
  }

  if (isDebugMode) {
    originalConsole.info(
      '🧹 Global cleanup: All timers cleared and modules cache cleaned'
    );
  }
});
