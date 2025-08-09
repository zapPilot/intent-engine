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

  // Coverage thresholds - Updated to reflect current coverage and maintain quality
  coverageThreshold: {
    global: {
      branches: 78,
      functions: 87,
      lines: 87,
      statements: 87,
    },
    // Well-tested areas - maintain high standards
    './src/config/': {
      statements: 92,
      branches: 80,
      functions: 100,
      lines: 92,
    },
    './src/middleware/': {
      statements: 100,
      branches: 71,
      functions: 100,
      lines: 100,
    },
    // Services - critical business logic
    './src/services/': {
      statements: 85,
      branches: 75,
      functions: 90,
      lines: 85,
    },
    // Routes - improved coverage
    './src/routes/': {
      statements: 73,
      branches: 75,
      functions: 90,
      lines: 73,
    },
    // Utilities - high standards
    './src/utils/': {
      statements: 93,
      branches: 79,
      functions: 94,
      lines: 93,
    },
  },

  // Verbose output for CI environments
  verbose: process.env.CI === 'true',

  // Test timeout
  testTimeout: 30000,

  // Timer and cleanup configuration
  forceExit: true, // Force Jest to exit after tests complete
};
