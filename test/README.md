# Test Configuration

This project uses Jest with console output suppression for cleaner test runs while preserving debugging capabilities.

## Available Test Scripts

```bash
# Default: Run tests with console output suppressed
npm test

# Watch mode with console suppression
npm run test:watch

# Enable console output for debugging
npm run test:debug

# Explicit verbose output
npm run test:verbose

# Force silent mode (double suppression)
npm run test:silent

# Generate coverage report
npm run test:coverage
```

## Console Output Control

### Default Behavior

- Console output is suppressed during tests for cleaner output
- Error logging, warnings, and debug messages are mocked
- Tests run faster without console I/O overhead

### Debug Mode

```bash
# Enable console output for debugging
npm run test:debug

# Or set environment variable directly
DEBUG_TESTS=true npm test
```

### Individual Test Control

Within test files, you can control console output:

```javascript
describe('My Test Suite', () => {
  beforeEach(() => {
    // Restore console for this test suite
    restoreConsole();
  });

  afterEach(() => {
    // Re-enable suppression
    mockConsole();
  });

  test('should log debug info', () => {
    console.log('This will be visible');
    // test code...
  });
});
```

### Testing Console Calls

You can test that your code calls console methods:

```javascript
test('should log error messages', () => {
  const consoleMocks = getConsoleMocks();

  // Your code that calls console.error
  myFunction();

  expect(consoleMocks.error).toHaveBeenCalledWith('Expected error message');
});
```

## Configuration Files

- **`jest.config.js`**: Main Jest configuration with console suppression
- **`test/setup.js`**: Console mocking setup and test utilities
- **`package.json`**: Test scripts with environment variables

## Environment Variables

- `NODE_ENV=test`: Set automatically by test scripts
- `DEBUG_TESTS=true`: Enable console output during tests
- `CI=true`: Enable verbose output in CI environments

## Coverage Thresholds

Minimum coverage requirements:

- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%
