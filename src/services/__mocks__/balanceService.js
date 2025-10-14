/**
 * Mock BalanceService for unit testing
 */

const mockMethods = {
  getBalances: jest.fn(),
  getNativeBalance: jest.fn(),
  getCacheStats: jest.fn(),
  clearAddressCache: jest.fn(),
  clearChainCache: jest.fn(),
  getSupportedChains: jest.fn(),
  normalizeChainId: jest.fn(),
  isChainSupported: jest.fn(),
};

class MockBalanceService {
  constructor() {
    Object.assign(this, mockMethods);
  }
}

// Expose mock methods for easy access in tests
MockBalanceService.__mockMethods = mockMethods;

module.exports = MockBalanceService;
