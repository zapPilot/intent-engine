/**
 * Jest Configuration
 * Suppresses console output during tests while providing debug capabilities
 */
module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Suppress console output during tests (Option 1)
  silent: true,

  // Setup file for console mocking and test utilities (Option 2)
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],

  // Test file patterns
  testMatch: ['<rootDir>/test/**/*.test.js'],

  // Coverage configuration
  collectCoverageFrom: ['src/**/*.js', '!src/**/*.test.js', '!src/**/index.js'],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // Verbose output for CI environments
  verbose: process.env.CI === 'true',

  // Test timeout
  testTimeout: 30000,
};
