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

  // Global teardown for cleaning up resources
  globalTeardown: '<rootDir>/test/globalTeardown.js',

  // Test file patterns
  testMatch: ['<rootDir>/test/**/*.test.js'],

  // Coverage configuration
  collectCoverageFrom: ['src/**/*.js', '!src/**/*.test.js', '!src/**/index.js'],

  // Coverage thresholds - Minimum acceptable coverage levels
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 75,
      lines: 75,
      statements: 75,
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
    // Services - critical business logic
    './src/services/': {
      statements: 70,
      branches: 50,
      functions: 75,
      lines: 70,
    },
    // Utilities - achievable improvements
    './src/utils/': {
      statements: 90,
      branches: 75,
      functions: 90,
      lines: 90,
    },
  },

  // Verbose output for CI environments
  verbose: process.env.CI === 'true',

  // Test timeout
  testTimeout: 30000,

  // Timer and cleanup configuration
  forceExit: true, // Force Jest to exit after tests complete
};
