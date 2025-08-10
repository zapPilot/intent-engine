const ExecutionContextManager = require('../src/managers/ExecutionContextManager');

describe('ExecutionContextManager - extra coverage', () => {
  const config = {
    SSE_STREAMING: {
      CLEANUP_INTERVAL: 50,
      CONNECTION_TIMEOUT: 100,
    },
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stores, retrieves, and removes execution contexts', () => {
    const manager = new ExecutionContextManager(config);

    expect(manager.getExecutionContext('abc')).toBeNull();

    manager.storeExecutionContext('abc', { foo: 'bar' });
    const ctx = manager.getExecutionContext('abc');
    expect(ctx).toBeTruthy();
    expect(ctx.intentId).toBe('abc');
    expect(ctx.foo).toBe('bar');
    expect(typeof ctx.createdAt).toBe('number');

    manager.removeExecutionContext('abc');
    expect(manager.getExecutionContext('abc')).toBeNull();

    manager.cleanup();
  });

  it('cleans up expired contexts via interval', () => {
    const manager = new ExecutionContextManager(config);

    manager.storeExecutionContext('old', { value: 1 });
    // advance just before timeout; context should remain
    jest.advanceTimersByTime(90);
    expect(manager.getExecutionContext('old')).not.toBeNull();

    // advance beyond next cleanup tick to trigger removal (>150ms)
    jest.advanceTimersByTime(70); // now >= 160ms
    expect(manager.getExecutionContext('old')).toBeNull();

    manager.cleanup();
  });

  it('reports status with active timer and counts', () => {
    const manager = new ExecutionContextManager(config);
    manager.storeExecutionContext('x', {});

    const status = manager.getStatus();
    expect(status).toEqual({ activeContexts: 1, timerActive: true });

    manager.cleanup();
    expect(manager.getStatus()).toEqual({
      activeContexts: 1,
      timerActive: false,
    });
  });
});
