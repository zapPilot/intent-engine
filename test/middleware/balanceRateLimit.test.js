const balanceRateLimit = require('../../src/middleware/balanceRateLimit');
const { RateLimiter, rateLimiter: singletonRateLimiter } = balanceRateLimit;

// Helper to create mock Express req/res/next objects
const makeMockReqRes = (walletSource = {}) => {
  const req = {
    query: walletSource.query || {},
    body: walletSource.body || {},
  };
  const res = {
    headers: {},
    statusCode: 200,
    jsonData: null,
    set(header, value) {
      if (typeof header === 'object') {
        for (const key in header) {
          this.headers[key.toLowerCase()] = header[key];
        }
      } else {
        this.headers[header.toLowerCase()] = value;
      }
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
  };
  const next = jest.fn();
  return { req, res, next };
};

describe('balanceRateLimit', () => {
  let limiter;
  const wallet1 = '0x1234567890123456789012345678901234567890';
  const wallet2 = '0xabcDEF0123456789012345678901234567890abc';

  beforeEach(() => {
    // Use fake timers to control time-based logic like window resets
    jest.useFakeTimers();
    // Set a consistent starting time for Date.now()
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    // Create a new RateLimiter instance for each test to ensure isolation
    limiter = new RateLimiter();
  });

  afterEach(() => {
    // Clean up the limiter instance
    limiter.destroy();
    // Clean up the singleton instance and restore real timers
    singletonRateLimiter.destroy();
    jest.useRealTimers();
  });

  describe('RateLimiter Class', () => {
    describe('Constructor', () => {
      it('should initialize with empty walletLimits Map', () => {
        expect(limiter.walletLimits).toBeInstanceOf(Map);
        expect(limiter.walletLimits.size).toBe(0);
      });

      it('should initialize globalLimit with count 0', () => {
        expect(limiter.globalLimit.count).toBe(0);
        expect(limiter.globalLimit.resetAt).toBeGreaterThan(Date.now());
      });

      it('should set up cleanup interval', () => {
        expect(limiter.cleanupInterval).toBeDefined();
      });
    });

    describe('checkLimit() - Per-wallet limit', () => {
      it('should allow the first request for a wallet', () => {
        const result = limiter.checkLimit(wallet1);
        expect(result.allowed).toBe(true);
        const status = limiter.getStatus(wallet1);
        expect(status.walletCount).toBe(1);
        expect(status.globalCount).toBe(1);
      });

      it('should handle wallet addresses case-insensitively', () => {
        const walletUpper = '0X1234567890123456789012345678901234567890';
        limiter.checkLimit(wallet1);
        const result = limiter.checkLimit(walletUpper);
        expect(result.allowed).toBe(true);
        const status = limiter.getStatus(wallet1);
        expect(status.walletCount).toBe(2);
      });

      it('should allow requests 1-10 for a single wallet', () => {
        for (let i = 0; i < 10; i++) {
          const result = limiter.checkLimit(wallet1);
          expect(result.allowed).toBe(true);
        }
        const status = limiter.getStatus(wallet1);
        expect(status.walletCount).toBe(10);
      });

      it('should block the 11th request for a single wallet', () => {
        // Make 10 successful requests
        for (let i = 0; i < 10; i++) {
          expect(limiter.checkLimit(wallet1).allowed).toBe(true);
        }

        // The 11th request should be denied
        const result = limiter.checkLimit(wallet1);
        expect(result.allowed).toBe(false);
        expect(result.limit).toBe('wallet');
        expect(result.retryAfter).toBe(60);
        expect(result.message).toContain(
          `Rate limit exceeded for wallet ${wallet1}`
        );
        expect(result.message).toContain('Maximum 10 requests per minute');

        // Global count should be 10, not 11
        const status = limiter.getStatus(wallet1);
        expect(status.globalCount).toBe(10);
      });

      it('should reset the wallet limit after the time window expires', () => {
        const startTime = new Date('2024-01-01T00:00:00Z').getTime();

        // Exhaust the wallet limit
        for (let i = 0; i < 10; i++) {
          limiter.checkLimit(wallet1);
        }
        expect(limiter.checkLimit(wallet1).allowed).toBe(false);

        // Advance time by just over 60 seconds (both timers and system time)
        jest.advanceTimersByTime(60001);
        jest.setSystemTime(startTime + 60001);

        // The next request should be allowed
        const result = limiter.checkLimit(wallet1);
        expect(result.allowed).toBe(true);
        const status = limiter.getStatus(wallet1);
        expect(status.walletCount).toBe(1);
      });

      it('should correctly calculate retryAfter partway through a window', () => {
        // Exhaust the limit
        for (let i = 0; i < 10; i++) {
          limiter.checkLimit(wallet1);
        }

        // Advance time by 20 seconds
        jest.advanceTimersByTime(20 * 1000);

        const result = limiter.checkLimit(wallet1);
        expect(result.allowed).toBe(false);
        // Should be 40 seconds remaining (60 - 20)
        expect(result.retryAfter).toBe(40);
      });

      it('should track different wallets separately', () => {
        // Use up wallet1 limit
        for (let i = 0; i < 10; i++) {
          expect(limiter.checkLimit(wallet1).allowed).toBe(true);
        }
        expect(limiter.checkLimit(wallet1).allowed).toBe(false);

        // Wallet2 should still work
        expect(limiter.checkLimit(wallet2).allowed).toBe(true);
      });

      it('should reset wallet window when expired before checking limit', () => {
        // Make 5 requests
        for (let i = 0; i < 5; i++) {
          limiter.checkLimit(wallet1);
        }

        // Advance time past expiration
        jest.advanceTimersByTime(61 * 1000);

        // Next request should reset and be allowed
        const result = limiter.checkLimit(wallet1);
        expect(result.allowed).toBe(true);
        const status = limiter.getStatus(wallet1);
        expect(status.walletCount).toBe(1);
      });
    });

    describe('checkLimit() - Global limit', () => {
      it('should increment global counter for each request', () => {
        limiter.checkLimit(wallet1);
        limiter.checkLimit(wallet2);
        const status = limiter.getStatus(wallet1);
        expect(status.globalCount).toBe(2);
      });

      it('should block the 101st global request', () => {
        // Make 100 requests from 100 different wallets
        for (let i = 0; i < 100; i++) {
          expect(limiter.checkLimit(`0xwallet${i}`).allowed).toBe(true);
        }

        // The 101st request from a new wallet should be denied
        const result = limiter.checkLimit(wallet1);
        expect(result.allowed).toBe(false);
        expect(result.limit).toBe('global');
        expect(result.retryAfter).toBe(60);
        expect(result.message).toContain('Global rate limit exceeded');
        expect(result.message).toContain(
          'Too many requests across all wallets'
        );

        // Wallet count for the new wallet should be 0
        const status = limiter.getStatus(wallet1);
        expect(status.walletCount).toBe(0);
        expect(status.globalCount).toBe(100);
      });

      it('should reset the global limit after the time window expires', () => {
        const startTime = new Date('2024-01-01T00:00:00Z').getTime();

        // Exhaust the global limit
        for (let i = 0; i < 100; i++) {
          limiter.checkLimit(`0xwallet${i}`);
        }
        expect(limiter.checkLimit(wallet1).allowed).toBe(false);

        // Advance time by just over 60 seconds (both timers and system time)
        jest.advanceTimersByTime(60001);
        jest.setSystemTime(startTime + 60001);

        // The next request should be allowed
        const result = limiter.checkLimit(wallet1);
        expect(result.allowed).toBe(true);
        const status = limiter.getStatus(wallet1);
        expect(status.globalCount).toBe(1);
      });

      it('should check global limit before wallet limit', () => {
        // Exhaust global limit
        for (let i = 0; i < 100; i++) {
          limiter.checkLimit(`0xwallet${i}`);
        }

        // Try with a wallet that has no requests yet
        const result = limiter.checkLimit(wallet1);
        expect(result.allowed).toBe(false);
        expect(result.limit).toBe('global');

        // Wallet count should still be 0
        const status = limiter.getStatus(wallet1);
        expect(status.walletCount).toBe(0);
      });

      it('should calculate retryAfter for global limit', () => {
        // Exhaust global limit
        for (let i = 0; i < 100; i++) {
          limiter.checkLimit(`0xwallet${i}`);
        }

        // Advance 15 seconds
        jest.advanceTimersByTime(15 * 1000);

        const result = limiter.checkLimit(wallet1);
        expect(result.allowed).toBe(false);
        expect(result.retryAfter).toBe(45); // 60 - 15
      });
    });

    describe('checkLimit() - Combined scenarios', () => {
      it('should allow wallet limit to be reached with global capacity available', () => {
        // Make 10 requests (wallet limit)
        for (let i = 0; i < 10; i++) {
          expect(limiter.checkLimit(wallet1).allowed).toBe(true);
        }

        // 11th should fail on wallet limit
        const result = limiter.checkLimit(wallet1);
        expect(result.allowed).toBe(false);
        expect(result.limit).toBe('wallet');

        // Global should still have capacity
        const status = limiter.getStatus(wallet1);
        expect(status.globalCount).toBe(10);
      });

      it('should handle multiple wallets exhausting their limits independently', () => {
        // Exhaust wallet1
        for (let i = 0; i < 10; i++) {
          limiter.checkLimit(wallet1);
        }

        // Exhaust wallet2
        for (let i = 0; i < 10; i++) {
          limiter.checkLimit(wallet2);
        }

        // Both should be blocked at wallet level
        expect(limiter.checkLimit(wallet1).limit).toBe('wallet');
        expect(limiter.checkLimit(wallet2).limit).toBe('wallet');

        // Global should be at 20
        expect(limiter.getStatus(wallet1).globalCount).toBe(20);
      });

      it('should reset windows independently', () => {
        const startTime = new Date('2024-01-01T00:00:00Z').getTime();

        limiter.checkLimit(wallet1);

        // Advance time by 30 seconds
        jest.advanceTimersByTime(30 * 1000);
        jest.setSystemTime(startTime + 30 * 1000);

        limiter.checkLimit(wallet2);
        limiter.checkLimit(wallet2); // Make a second request for wallet2

        // Advance time by 31 seconds (61 total for wallet1, 31 for wallet2)
        jest.advanceTimersByTime(31 * 1000);
        jest.setSystemTime(startTime + 61 * 1000);

        // Wallet1 should have reset (> 60 seconds since first check)
        const result1 = limiter.checkLimit(wallet1);
        expect(result1.allowed).toBe(true);
        expect(limiter.getStatus(wallet1).walletCount).toBe(1);

        // Wallet2 should not have reset (only 31 seconds since first check)
        expect(limiter.getStatus(wallet2).walletCount).toBe(2);
      });
    });

    describe('getStatus()', () => {
      it('should return correct counts for tracked wallet', () => {
        limiter.checkLimit(wallet1);
        limiter.checkLimit(wallet1);

        const status = limiter.getStatus(wallet1);
        expect(status.walletCount).toBe(2);
        expect(status.globalCount).toBe(2);
        expect(status.walletReset).toBeGreaterThan(Date.now());
        expect(status.globalReset).toBeGreaterThan(Date.now());
      });

      it('should return zeros for untracked wallet', () => {
        const status = limiter.getStatus(wallet1);
        expect(status.walletCount).toBe(0);
        expect(status.globalCount).toBe(0);
        expect(status.walletReset).toBeGreaterThanOrEqual(Date.now());
      });

      it('should handle case-insensitive wallet lookup', () => {
        limiter.checkLimit(wallet1.toLowerCase());

        const statusUpper = limiter.getStatus(wallet1.toUpperCase());
        expect(statusUpper.walletCount).toBe(1);
      });

      it('should return current global count for any wallet', () => {
        limiter.checkLimit(wallet1);
        limiter.checkLimit(wallet2);

        const status = limiter.getStatus('0xrandom');
        expect(status.globalCount).toBe(2);
      });
    });

    describe('cleanup()', () => {
      it('should remove expired entries from walletLimits', () => {
        // Make a request to add an entry
        limiter.checkLimit(wallet1);
        expect(limiter.walletLimits.has(wallet1.toLowerCase())).toBe(true);

        // Advance time past the reset window
        jest.advanceTimersByTime(61 * 1000);

        // Manually trigger cleanup
        limiter.cleanup();

        // The entry should be gone
        expect(limiter.walletLimits.has(wallet1.toLowerCase())).toBe(false);
      });

      it('should keep valid entries', () => {
        limiter.checkLimit(wallet1);
        limiter.checkLimit(wallet2);

        // Advance time but not past expiration
        jest.advanceTimersByTime(30 * 1000);

        limiter.cleanup();

        // Both entries should still be present
        expect(limiter.walletLimits.has(wallet1.toLowerCase())).toBe(true);
        expect(limiter.walletLimits.has(wallet2.toLowerCase())).toBe(true);
      });

      it('should handle empty map', () => {
        expect(() => limiter.cleanup()).not.toThrow();
        expect(limiter.walletLimits.size).toBe(0);
      });

      it('should run automatically every 2 minutes', () => {
        limiter.checkLimit(wallet1);

        // Advance past entry expiration but less than cleanup interval
        jest.advanceTimersByTime(61 * 1000);
        expect(limiter.walletLimits.size).toBe(1);

        // Advance to cleanup interval (120 seconds total)
        jest.advanceTimersByTime(59 * 1000);

        // Trigger any pending timers
        jest.runOnlyPendingTimers();

        expect(limiter.walletLimits.size).toBe(0);
      });

      it('should remove multiple expired entries', () => {
        // Create entries for 5 wallets
        for (let i = 0; i < 5; i++) {
          limiter.checkLimit(`0xwallet${i}`);
        }
        expect(limiter.walletLimits.size).toBe(5);

        // Advance time past expiration
        jest.advanceTimersByTime(61 * 1000);

        limiter.cleanup();

        expect(limiter.walletLimits.size).toBe(0);
      });
    });

    describe('destroy()', () => {
      it('should clear the interval and the limits map', () => {
        const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
        limiter.checkLimit(wallet1);
        expect(limiter.walletLimits.size).toBe(1);

        limiter.destroy();

        expect(clearIntervalSpy).toHaveBeenCalledWith(limiter.cleanupInterval);
        expect(limiter.walletLimits.size).toBe(0);
        clearIntervalSpy.mockRestore();
      });

      it('should handle being called multiple times', () => {
        limiter.destroy();
        expect(() => limiter.destroy()).not.toThrow();
      });

      it('should clear all wallet entries', () => {
        for (let i = 0; i < 10; i++) {
          limiter.checkLimit(`0xwallet${i}`);
        }
        expect(limiter.walletLimits.size).toBe(10);

        limiter.destroy();

        expect(limiter.walletLimits.size).toBe(0);
      });
    });
  });

  describe('balanceRateLimit Middleware', () => {
    // The middleware uses a singleton, so we need to replace its implementation
    // with our isolated instance for these tests.
    let originalCheckLimit;
    let originalGetStatus;

    beforeEach(() => {
      originalCheckLimit = singletonRateLimiter.checkLimit;
      originalGetStatus = singletonRateLimiter.getStatus;
      singletonRateLimiter.checkLimit = (...args) =>
        limiter.checkLimit(...args);
      singletonRateLimiter.getStatus = (...args) => limiter.getStatus(...args);
    });

    afterEach(() => {
      singletonRateLimiter.checkLimit = originalCheckLimit;
      singletonRateLimiter.getStatus = originalGetStatus;
    });

    describe('Success path (within limits)', () => {
      it('should call next() and set headers for an allowed request from query', () => {
        const { req, res, next } = makeMockReqRes({
          query: { wallet: wallet1 },
        });

        balanceRateLimit(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        expect(res.jsonData).toBeNull();
        expect(res.headers['x-ratelimit-limit-wallet']).toBe('10');
        expect(res.headers['x-ratelimit-remaining-wallet']).toBe(9);
        expect(res.headers['x-ratelimit-limit-global']).toBe('100');
        expect(res.headers['x-ratelimit-remaining-global']).toBe(99);
        expect(res.headers['x-ratelimit-reset-wallet']).toBeGreaterThan(0);
      });

      it('should call next() and set headers for an allowed request from body', () => {
        const { req, res, next } = makeMockReqRes({
          body: { wallet: wallet1 },
        });

        balanceRateLimit(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.headers['x-ratelimit-limit-wallet']).toBe('10');
      });

      it('should prioritize query over body for wallet parameter', () => {
        const { req, res, next } = makeMockReqRes({
          query: { wallet: wallet1 },
          body: { wallet: wallet2 },
        });

        balanceRateLimit(req, res, next);

        const status = limiter.getStatus(wallet1);
        expect(status.walletCount).toBe(1);
        expect(limiter.getStatus(wallet2).walletCount).toBe(0);
      });

      it('should set correct remaining count after multiple requests', () => {
        // Make 5 requests
        for (let i = 0; i < 5; i++) {
          limiter.checkLimit(wallet1);
        }

        const { req, res, next } = makeMockReqRes({
          query: { wallet: wallet1 },
        });
        balanceRateLimit(req, res, next);

        expect(res.headers['x-ratelimit-remaining-wallet']).toBe(4); // 10 - 6
      });

      it('should never show negative remaining counts', () => {
        // Exhaust limit
        for (let i = 0; i < 10; i++) {
          limiter.checkLimit(wallet1);
        }

        const { req, res, next } = makeMockReqRes({
          query: { wallet: wallet1 },
        });
        balanceRateLimit(req, res, next);

        expect(res.headers['x-ratelimit-remaining-wallet']).toBe(0);
        expect(res.headers['x-ratelimit-remaining-global']).toBe(90);
      });
    });

    describe('429 responses', () => {
      it('should return 429 when wallet limit is exceeded', () => {
        // Exhaust the limit
        for (let i = 0; i < 10; i++) {
          limiter.checkLimit(wallet1);
        }

        const { req, res, next } = makeMockReqRes({
          body: { wallet: wallet1 },
        });
        balanceRateLimit(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(429);
        expect(res.jsonData.error).toBe('Too Many Requests');
        expect(res.jsonData.limitType).toBe('wallet');
        expect(res.jsonData.retryAfter).toBe(60);
        expect(res.jsonData.retryAfterMs).toBe(60000);
        expect(res.jsonData.message).toContain(
          'Rate limit exceeded for wallet'
        );
        expect(res.headers['retry-after']).toBe(60);
        // Remaining should be 0, not negative
        expect(res.headers['x-ratelimit-remaining-wallet']).toBe(0);
      });

      it('should return 429 when global limit is exceeded', () => {
        // Exhaust global limit
        for (let i = 0; i < 100; i++) {
          limiter.checkLimit(`0xwallet${i}`);
        }

        const { req, res, next } = makeMockReqRes({
          query: { wallet: wallet1 },
        });
        balanceRateLimit(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(429);
        expect(res.jsonData.error).toBe('Too Many Requests');
        expect(res.jsonData.limitType).toBe('global');
        expect(res.jsonData.retryAfter).toBe(60);
        expect(res.jsonData.message).toContain('Global rate limit exceeded');
        expect(res.headers['retry-after']).toBe(60);
        expect(res.headers['x-ratelimit-remaining-global']).toBe(0);
      });

      it('should include correct Retry-After header value', () => {
        // Exhaust limit
        for (let i = 0; i < 10; i++) {
          limiter.checkLimit(wallet1);
        }

        // Advance time by 25 seconds
        jest.advanceTimersByTime(25 * 1000);

        const { req, res, next } = makeMockReqRes({
          query: { wallet: wallet1 },
        });
        balanceRateLimit(req, res, next);

        expect(res.headers['retry-after']).toBe(35); // 60 - 25
        expect(res.jsonData.retryAfter).toBe(35);
      });

      it('should return 429 with all required response fields', () => {
        for (let i = 0; i < 10; i++) {
          limiter.checkLimit(wallet1);
        }

        const { req, res, next } = makeMockReqRes({
          query: { wallet: wallet1 },
        });
        balanceRateLimit(req, res, next);

        expect(res.jsonData).toEqual({
          error: 'Too Many Requests',
          message: expect.stringContaining('Rate limit exceeded'),
          limitType: 'wallet',
          retryAfter: 60,
          retryAfterMs: 60000,
        });
      });
    });

    describe('Missing wallet parameter', () => {
      it('should call next() immediately if no wallet is provided', () => {
        const { req, res, next } = makeMockReqRes(); // No wallet in query or body
        balanceRateLimit(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        // No rate limit headers should be set
        expect(res.headers['x-ratelimit-limit-wallet']).toBeUndefined();
        expect(res.headers['x-ratelimit-limit-global']).toBeUndefined();
      });

      it('should not increment any counters when wallet is missing', () => {
        const initialStatus = limiter.getStatus('0xrandom');
        const initialGlobalCount = initialStatus.globalCount;

        const { req, res, next } = makeMockReqRes();
        balanceRateLimit(req, res, next);

        const finalStatus = limiter.getStatus('0xrandom');
        expect(finalStatus.globalCount).toBe(initialGlobalCount);
      });

      it('should handle empty string wallet', () => {
        const { req, res, next } = makeMockReqRes({ query: { wallet: '' } });
        balanceRateLimit(req, res, next);

        // Should pass through since empty string is falsy
        expect(next).toHaveBeenCalledTimes(1);
      });

      it('should handle null wallet', () => {
        const { req, res, next } = makeMockReqRes({ query: { wallet: null } });
        balanceRateLimit(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
      });

      it('should handle undefined wallet in body', () => {
        const { req, res, next } = makeMockReqRes({
          body: { wallet: undefined },
        });
        balanceRateLimit(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
      });
    });

    describe('Rate limit headers', () => {
      it('should set all required rate limit headers', () => {
        const { req, res, next } = makeMockReqRes({
          query: { wallet: wallet1 },
        });
        balanceRateLimit(req, res, next);

        expect(res.headers['x-ratelimit-limit-wallet']).toBeDefined();
        expect(res.headers['x-ratelimit-remaining-wallet']).toBeDefined();
        expect(res.headers['x-ratelimit-reset-wallet']).toBeDefined();
        expect(res.headers['x-ratelimit-limit-global']).toBeDefined();
        expect(res.headers['x-ratelimit-remaining-global']).toBeDefined();
      });

      it('should set X-RateLimit-Reset-Wallet as Unix timestamp in seconds', () => {
        const { req, res, next } = makeMockReqRes({
          query: { wallet: wallet1 },
        });
        balanceRateLimit(req, res, next);

        const resetTimestamp = parseInt(
          res.headers['x-ratelimit-reset-wallet']
        );
        const now = Math.floor(Date.now() / 1000);

        // Should be a valid Unix timestamp in the future
        expect(resetTimestamp).toBeGreaterThan(now);
        expect(resetTimestamp).toBeLessThan(now + 61); // Within 61 seconds
      });

      it('should update headers correctly across multiple requests', () => {
        // First request
        const mock1 = makeMockReqRes({ query: { wallet: wallet1 } });
        balanceRateLimit(mock1.req, mock1.res, mock1.next);
        expect(mock1.res.headers['x-ratelimit-remaining-wallet']).toBe(9);

        // Second request
        const mock2 = makeMockReqRes({ query: { wallet: wallet1 } });
        balanceRateLimit(mock2.req, mock2.res, mock2.next);
        expect(mock2.res.headers['x-ratelimit-remaining-wallet']).toBe(8);
      });

      it('should not set Retry-After header for allowed requests', () => {
        const { req, res, next } = makeMockReqRes({
          query: { wallet: wallet1 },
        });
        balanceRateLimit(req, res, next);

        expect(res.headers['retry-after']).toBeUndefined();
      });
    });

    describe('Integration scenarios', () => {
      it('should handle rapid sequential requests correctly', () => {
        const requests = [];

        // Make 12 rapid requests
        for (let i = 0; i < 12; i++) {
          const mock = makeMockReqRes({ query: { wallet: wallet1 } });
          balanceRateLimit(mock.req, mock.res, mock.next);
          requests.push(mock);
        }

        // First 10 should succeed
        for (let i = 0; i < 10; i++) {
          expect(requests[i].next).toHaveBeenCalled();
          expect(requests[i].res.statusCode).toBe(200);
        }

        // Last 2 should fail
        for (let i = 10; i < 12; i++) {
          expect(requests[i].next).not.toHaveBeenCalled();
          expect(requests[i].res.statusCode).toBe(429);
        }
      });

      it('should handle concurrent requests from different wallets', () => {
        const wallets = [];
        for (let i = 0; i < 15; i++) {
          wallets.push(`0xwallet${i}`);
        }

        // Each wallet makes 5 requests
        wallets.forEach(wallet => {
          for (let i = 0; i < 5; i++) {
            const mock = makeMockReqRes({ query: { wallet } });
            balanceRateLimit(mock.req, mock.res, mock.next);
            expect(mock.res.statusCode).toBe(200);
          }
        });

        // Global count should be 75 (15 wallets * 5 requests)
        const status = limiter.getStatus(wallets[0]);
        expect(status.globalCount).toBe(75);
      });

      it('should recover after time window reset', () => {
        const startTime = new Date('2024-01-01T00:00:00Z').getTime();

        // Exhaust limit
        for (let i = 0; i < 10; i++) {
          limiter.checkLimit(wallet1);
        }

        // Verify blocked
        const mock1 = makeMockReqRes({ query: { wallet: wallet1 } });
        balanceRateLimit(mock1.req, mock1.res, mock1.next);
        expect(mock1.res.statusCode).toBe(429);

        // Advance time by just over 60 seconds (both timers and system time)
        jest.advanceTimersByTime(60001);
        jest.setSystemTime(startTime + 60001);

        // Should work again
        const mock2 = makeMockReqRes({ query: { wallet: wallet1 } });
        balanceRateLimit(mock2.req, mock2.res, mock2.next);
        expect(mock2.res.statusCode).toBe(200);
        expect(mock2.next).toHaveBeenCalled();
      });
    });
  });
});
