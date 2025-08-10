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
      branches: 8,
      functions: 11,
      lines: 21,
      statements: 21,
    },
  },

  // Verbose output for CI environments
  verbose: process.env.CI === 'true',

  // Test timeout
  testTimeout: 30000,

  // Timer and cleanup configuration
  forceExit: true, // Force Jest to exit after tests complete
};
