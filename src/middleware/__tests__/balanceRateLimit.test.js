/**
 * Tests for Balance Rate Limiting Middleware
 */

const balanceRateLimit = require('../balanceRateLimit');
const { RateLimiter } = require('../balanceRateLimit');

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  afterEach(() => {
    limiter.destroy();
  });

  describe('Per-wallet limit', () => {
    it('should allow 10 requests per wallet per minute', () => {
      const wallet = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

      // First 10 should be allowed
      for (let i = 0; i < 10; i++) {
        const result = limiter.checkLimit(wallet);
        expect(result.allowed).toBe(true);
      }

      // 11th should be blocked
      const result = limiter.checkLimit(wallet);
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe('wallet');
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should normalize wallet addresses to lowercase', () => {
      const wallet1 = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      const wallet2 = '0x742D35CC6634C0532925A3B844BC9E7595F0BEB';

      // Should count against same limit
      for (let i = 0; i < 10; i++) {
        limiter.checkLimit(i % 2 === 0 ? wallet1 : wallet2);
      }

      const result = limiter.checkLimit(wallet1);
      expect(result.allowed).toBe(false);
    });

    it('should allow different wallets independently', () => {
      const wallet1 = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      const wallet2 = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';

      // Each wallet should get 10 requests
      for (let i = 0; i < 10; i++) {
        expect(limiter.checkLimit(wallet1).allowed).toBe(true);
        expect(limiter.checkLimit(wallet2).allowed).toBe(true);
      }

      // Both should be limited independently
      expect(limiter.checkLimit(wallet1).allowed).toBe(false);
      expect(limiter.checkLimit(wallet2).allowed).toBe(false);
    });
  });

  describe('Global limit', () => {
    it('should enforce global limit of 100 requests per minute', () => {
      const wallets = Array.from(
        { length: 20 },
        (_, i) => `0x${'0'.repeat(39)}${i.toString().padStart(1, '0')}`
      );

      let requestCount = 0;

      // Should allow 100 requests across all wallets
      for (let i = 0; i < 100; i++) {
        const wallet = wallets[i % wallets.length];
        const result = limiter.checkLimit(wallet);

        if (result.allowed) {
          requestCount++;
        } else {
          break;
        }
      }

      expect(requestCount).toBe(100);

      // 101st should hit global limit
      const result = limiter.checkLimit(wallets[0]);
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe('global');
    });
  });

  describe('Status tracking', () => {
    it('should track wallet and global counts', () => {
      const wallet = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

      limiter.checkLimit(wallet);
      limiter.checkLimit(wallet);
      limiter.checkLimit(wallet);

      const status = limiter.getStatus(wallet);
      expect(status.walletCount).toBe(3);
      expect(status.globalCount).toBe(3);
      expect(status.walletReset).toBeGreaterThan(Date.now());
      expect(status.globalReset).toBeGreaterThan(Date.now());
    });
  });

  describe('Cleanup', () => {
    it('should clean up expired entries', done => {
      const wallet = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

      // Manually set an expired entry
      limiter.walletLimits.set(wallet.toLowerCase(), {
        count: 5,
        resetAt: Date.now() - 1000, // Expired
      });

      expect(limiter.walletLimits.size).toBe(1);

      limiter.cleanup();

      expect(limiter.walletLimits.size).toBe(0);
      done();
    });
  });
});

describe('balanceRateLimit middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      query: {},
      body: {},
    };
    res = {
      set: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();

    // Clear rate limiter between tests
    const { rateLimiter } = require('../balanceRateLimit');
    rateLimiter.walletLimits.clear();
    rateLimiter.globalLimit = { count: 0, resetAt: Date.now() + 60000 };
  });

  it('should pass through when no wallet provided', () => {
    balanceRateLimit(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should set rate limit headers on success', () => {
    req.query.wallet = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

    balanceRateLimit(req, res, next);

    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'X-RateLimit-Limit-Wallet': '10',
        'X-RateLimit-Remaining-Wallet': expect.any(Number),
        'X-RateLimit-Reset-Wallet': expect.any(Number),
        'X-RateLimit-Limit-Global': '100',
        'X-RateLimit-Remaining-Global': expect.any(Number),
      })
    );
    expect(next).toHaveBeenCalled();
  });

  it('should return 429 when wallet limit exceeded', () => {
    const { rateLimiter } = require('../balanceRateLimit');
    const wallet = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

    req.query.wallet = wallet;

    // Exhaust the limit
    for (let i = 0; i < 10; i++) {
      rateLimiter.checkLimit(wallet);
    }

    balanceRateLimit(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(Number));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Too Many Requests',
        limitType: 'wallet',
        retryAfter: expect.any(Number),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 429 when global limit exceeded', () => {
    const { rateLimiter } = require('../balanceRateLimit');

    // Exhaust global limit
    for (let i = 0; i < 100; i++) {
      rateLimiter.checkLimit(`0x${'0'.repeat(39)}${i}`);
    }

    req.query.wallet = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
    balanceRateLimit(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Too Many Requests',
        limitType: 'global',
      })
    );
  });

  it('should handle wallet from body', () => {
    req.body.wallet = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

    balanceRateLimit(req, res, next);

    expect(res.set).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
