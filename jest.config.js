/**
 * Jest Configuration
 * Suppresses console output during tests while providing debug capabilities
 */
module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Suppress console output during tests (Option 1)
  silent: false, // Changed to false to allow console.log output

  // Setup file for console mocking and test utilities (Option 2)
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],

  // Test file patterns
  testMatch: ['<rootDir>/test/**/*.test.js'],

  // Coverage configuration
  collectCoverageFrom: ['src/**/*.js', '!src/**/*.test.js', '!src/**/index.js'],

  // Coverage thresholds - Realistic baseline with growth targets
  coverageThreshold: {
    global: {
      branches: 56.7,
      functions: 75.0,
      lines: 73.3,
      statements: 73.5,
    },
    // Well-tested areas - maintain high standards
    './src/config/': {
      statements: 64,
      branches: 46,
      functions: 58,
      lines: 64,
    },
    './src/middleware/': {
      statements: 100,
      branches: 71,
      functions: 100,
      lines: 100,
    },
    // Utilities - achievable improvements
    './src/utils/retry.js': {
      statements: 90,
      branches: 70,
      functions: 100,
      lines: 90,
    },
    './src/utils/validation.js': {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80,
    },
  },

  // Verbose output for CI environments
  verbose: process.env.CI === 'true',

  // Test timeout
  testTimeout: 30000,

  // Timer and cleanup configuration
  forceExit: true, // Force Jest to exit after tests complete
};
