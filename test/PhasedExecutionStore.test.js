const PhasedExecutionStore = require('../src/executors/PhasedExecutionStore');

describe('PhasedExecutionStore', () => {
  let store;
  const EXECUTION_ID = 'test-exec-123';
  const MOCK_STATE = {
    phase: 1,
    status: 'pending',
    executionContext: '{}',
    swapTokenAddresses: ['0xTOKEN1'],
    userAddress: '0xUSER',
    chainId: 1,
  };

  // Use fake timers to control TTL and cleanup intervals deterministically
  beforeAll(() => {
    jest.useFakeTimers();
    // Mock setInterval and clearInterval to test cleanup lifecycle
    jest.spyOn(global, 'setInterval');
    jest.spyOn(global, 'clearInterval');
  });

  // Each test gets a fresh store instance with a short TTL for convenience
  beforeEach(() => {
    // Clear mock calls before each test
    jest.clearAllMocks();
    // Default 1 minute TTL for most tests
    store = new PhasedExecutionStore(1);
  });

  // Ensure timers and store are cleared after each test to prevent leaks
  afterEach(() => {
    store.destroy();
  });

  afterAll(() => {
    jest.useRealTimers();
    // Restore mocks - wrapped in try-catch to avoid issues if already restored
    try {
      if (jest.isMockFunction(global.setInterval)) {
        global.setInterval.mockRestore();
      }
      if (jest.isMockFunction(global.clearInterval)) {
        global.clearInterval.mockRestore();
      }
    } catch (_e) {
      // Mocks already restored or not needed
    }
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with a default TTL of 30 minutes', () => {
      const defaultStore = new PhasedExecutionStore();
      expect(defaultStore.TTL_MS).toBe(30 * 60 * 1000);
      defaultStore.destroy();
    });

    it('should accept a custom TTL in minutes', () => {
      const customStore = new PhasedExecutionStore(10);
      expect(customStore.TTL_MS).toBe(10 * 60 * 1000);
      customStore.destroy();
    });

    it('should handle a TTL of 0', () => {
      const zeroTtlStore = new PhasedExecutionStore(0);
      expect(zeroTtlStore.TTL_MS).toBe(0);
      zeroTtlStore.destroy();
    });

    it('should start the cleanup interval timer', () => {
      expect(store.cleanupInterval).not.toBeNull();
      // Check that setInterval has been called
      expect(setInterval).toHaveBeenCalledTimes(1);
      expect(setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        5 * 60 * 1000
      );
    });
  });

  describe('Set and Get', () => {
    it('should set and get an execution state', () => {
      store.set(EXECUTION_ID, MOCK_STATE);
      const retrievedState = store.get(EXECUTION_ID);

      expect(retrievedState).not.toBeNull();
      expect(retrievedState.phase).toBe(MOCK_STATE.phase);
      expect(retrievedState.executionId).toBe(EXECUTION_ID);
      expect(retrievedState.createdAt).toBeDefined();
      expect(retrievedState.expiresAt).toBe(
        retrievedState.createdAt + 60 * 1000
      );
    });

    it('should return null for a non-existent execution ID', () => {
      expect(store.get('non-existent-id')).toBeNull();
    });

    it('should overwrite an existing state when set is called again for the same ID', () => {
      store.set(EXECUTION_ID, MOCK_STATE);
      const firstTimestamp = store.get(EXECUTION_ID).createdAt;

      jest.advanceTimersByTime(1000); // Advance time by 1 second

      const updatedStatePayload = { ...MOCK_STATE, status: 'updated' };
      store.set(EXECUTION_ID, updatedStatePayload);

      const retrievedState = store.get(EXECUTION_ID);
      expect(retrievedState.status).toBe('updated');
      expect(retrievedState.createdAt).toBeGreaterThan(firstTimestamp);
    });
  });

  describe('Update', () => {
    beforeEach(() => {
      store.set(EXECUTION_ID, MOCK_STATE);
    });

    it('should update an existing execution state', () => {
      const updates = { status: 'completed', phase: 2 };
      store.update(EXECUTION_ID, updates);

      const retrievedState = store.get(EXECUTION_ID);
      expect(retrievedState.status).toBe('completed');
      expect(retrievedState.phase).toBe(2);
      // Ensure other fields are preserved
      expect(retrievedState.userAddress).toBe(MOCK_STATE.userAddress);
    });

    it('should throw an error when updating a non-existent execution', () => {
      const updates = { status: 'failed' };
      expect(() => store.update('non-existent-id', updates)).toThrow(
        'Execution non-existent-id not found or expired (TTL: 1 minutes)'
      );
    });

    it('should throw an error when updating an expired execution', () => {
      // Advance time past the TTL
      jest.advanceTimersByTime(60 * 1000 + 1);

      const updates = { status: 'failed' };
      expect(() => store.update(EXECUTION_ID, updates)).toThrow(
        `Execution ${EXECUTION_ID} not found or expired (TTL: 1 minutes)`
      );
    });
  });

  describe('TTL and Expiration', () => {
    it('should return null and delete the state when getting an expired execution', () => {
      store.set(EXECUTION_ID, MOCK_STATE);
      expect(store.size()).toBe(1);

      // Advance time just past the TTL
      jest.advanceTimersByTime(60 * 1000 + 1);

      // Getting the expired item should return null
      expect(store.get(EXECUTION_ID)).toBeNull();

      // The item should have been lazily deleted
      expect(store.size()).toBe(0);
    });

    it('should retrieve an item just before it expires', () => {
      store.set(EXECUTION_ID, MOCK_STATE);

      // Advance time to just before expiration
      jest.advanceTimersByTime(60 * 1000 - 1);

      const state = store.get(EXECUTION_ID);
      expect(state).not.toBeNull();
      expect(state.executionId).toBe(EXECUTION_ID);
    });

    it('should immediately expire items if TTL is 0', () => {
      const zeroTtlStore = new PhasedExecutionStore(0);
      zeroTtlStore.set(EXECUTION_ID, MOCK_STATE);

      // Advance time by a minimal amount
      jest.advanceTimersByTime(1);

      expect(zeroTtlStore.get(EXECUTION_ID)).toBeNull();
      zeroTtlStore.destroy();
    });
  });

  describe('Cleanup', () => {
    it('should remove only expired entries during cleanup', () => {
      store.set('exec-1', { ...MOCK_STATE }); // Will expire
      store.set('exec-2', { ...MOCK_STATE }); // Will expire

      jest.advanceTimersByTime(30 * 1000); // 30 seconds pass

      store.set('exec-3', { ...MOCK_STATE }); // Will not expire yet

      jest.advanceTimersByTime(30 * 1000 + 1); // Total time > 60s, exec-1 and exec-2 expire

      // Manually trigger cleanup to test its logic in isolation
      const removedCount = store._cleanup();

      expect(removedCount).toBe(2);
      expect(store.size()).toBe(1);
      expect(store.get('exec-3')).not.toBeNull();
      expect(store.get('exec-1')).toBeNull();
    });

    it('should not remove any entries if none are expired', () => {
      store.set('exec-1', { ...MOCK_STATE });
      store.set('exec-2', { ...MOCK_STATE });

      const removedCount = store._cleanup();
      expect(removedCount).toBe(0);
      expect(store.size()).toBe(2);
    });

    it('should run cleanup automatically via setInterval', () => {
      // Use a longer TTL to ensure items don't expire before the interval
      store.destroy();
      store = new PhasedExecutionStore(4); // 4 minute TTL

      store.set('expired-item', { ...MOCK_STATE });

      // Advance time past the 5-minute cleanup interval
      jest.advanceTimersByTime(5 * 60 * 1000);

      // The item should have been removed by the automatic cleanup
      expect(store.size()).toBe(0);
    });
  });

  describe('Lifecycle and Utilities', () => {
    beforeEach(() => {
      store.set('exec-1', { ...MOCK_STATE });
      store.set('exec-2', { ...MOCK_STATE });
    });

    it('should delete an entry and return true', () => {
      expect(store.size()).toBe(2);
      const result = store.delete('exec-1');
      expect(result).toBe(true);
      expect(store.size()).toBe(1);
      expect(store.get('exec-1')).toBeNull();
    });

    it('should return false when deleting a non-existent entry', () => {
      const result = store.delete('non-existent');
      expect(result).toBe(false);
      expect(store.size()).toBe(2);
    });

    it('should return the correct size', () => {
      expect(store.size()).toBe(2);
      store.set('exec-3', { ...MOCK_STATE });
      expect(store.size()).toBe(3);
    });

    it('should return all keys', () => {
      const keys = store.keys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain('exec-1');
      expect(keys).toContain('exec-2');
    });

    it('should clear all entries', () => {
      expect(store.size()).toBe(2);
      store.clear();
      expect(store.size()).toBe(0);
      expect(store.keys()).toEqual([]);
    });

    it('should stop the cleanup interval and clear the store on destroy', () => {
      const intervalId = store.cleanupInterval;
      store.destroy();
      expect(clearInterval).toHaveBeenCalledWith(intervalId);
      expect(store.cleanupInterval).toBeNull();
      expect(store.size()).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should return correct stats for an empty store', () => {
      const stats = store.getStats();
      expect(stats).toEqual({
        total: 0,
        active: 0,
        expired: 0,
        ttlMinutes: 1,
      });
    });

    it('should return correct stats for active and expired items', () => {
      store.set('expired-1', { ...MOCK_STATE });

      // Advance time so expired-1 will be expired
      jest.advanceTimersByTime(30 * 1000);

      // Create active-1 after some time has passed
      store.set('active-1', { ...MOCK_STATE });

      // Advance time to expire the first item only (30s + 31s = 61s total for expired-1, but only 31s for active-1)
      jest.advanceTimersByTime(31 * 1000);

      const stats = store.getStats();
      expect(stats).toEqual({
        total: 2,
        active: 1,
        expired: 1,
        ttlMinutes: 1,
      });
    });
  });
});
