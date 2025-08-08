const RateLimitManager = require('../src/services/rateLimiting/rateLimitManager');
const TokenBucket = require('../src/services/rateLimiting/tokenBucket');

describe('Rate Limiting', () => {
  describe('TokenBucket', () => {
    let bucket;
    let clock;

    beforeEach(() => {
      clock = jest.useFakeTimers();
      bucket = new TokenBucket(2, 10); // 2 tokens per second refill, 10 capacity
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should initialize with full capacity', () => {
      expect(bucket.consume(10)).toBe(true);
      expect(bucket.consume(1)).toBe(false);
    });

    it('should refill tokens over time', () => {
      // Consume all tokens
      bucket.consume(10);
      expect(bucket.consume(1)).toBe(false);

      // Wait 1 second (should add 2 tokens)
      clock.advanceTimersByTime(1000);
      expect(bucket.consume(2)).toBe(true);
      expect(bucket.consume(1)).toBe(false);
    });

    it('should not exceed capacity when refilling', () => {
      // Wait 10 seconds (would add 20 tokens, but capacity is 10)
      clock.advanceTimersByTime(10000);
      expect(bucket.consume(10)).toBe(true);
      expect(bucket.consume(1)).toBe(false);
    });

    it('should handle partial token consumption', () => {
      expect(bucket.consume(5)).toBe(true);
      expect(bucket.consume(5)).toBe(true);
      expect(bucket.consume(1)).toBe(false);
    });

    it('should handle zero consumption', () => {
      expect(bucket.consume(0)).toBe(true);
    });

    it('should handle consumption larger than capacity', () => {
      expect(bucket.consume(15)).toBe(false);
      expect(bucket.consume(10)).toBe(true);
    });

    it('should refill fractional tokens correctly', () => {
      bucket.consume(10);
      
      // Wait 0.5 seconds (should add 1 token)
      clock.advanceTimersByTime(500);
      expect(bucket.consume(1)).toBe(true);
      expect(bucket.consume(1)).toBe(false);
    });
  });

  describe('RateLimitManager', () => {
    let manager;
    let clock;

    beforeEach(() => {
      clock = jest.useFakeTimers();
      manager = new RateLimitManager();
      // Initialize common providers
      manager.initProvider('coingecko', 1/12, 5); // 5 requests per minute = 1 request per 12 seconds
      manager.initProvider('coinmarketcap', 0.5, 30); // 30 requests per minute
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('consumeTokens', () => {
      it('should allow requests within rate limit', () => {
        const provider = 'coingecko';
        
        // First 5 requests should succeed
        for (let i = 0; i < 5; i++) {
          expect(manager.consumeTokens(provider)).toBe(true);
        }
        
        // 6th request should fail
        expect(manager.consumeTokens(provider)).toBe(false);
      });

      it('should track different providers separately', () => {
        // Use up coingecko limit
        for (let i = 0; i < 5; i++) {
          expect(manager.consumeTokens('coingecko')).toBe(true);
        }
        expect(manager.consumeTokens('coingecko')).toBe(false);

        // Coinmarketcap should still work
        expect(manager.consumeTokens('coinmarketcap')).toBe(true);
      });

      it('should refill tokens over time', () => {
        const provider = 'coingecko';
        
        // Use up all tokens
        for (let i = 0; i < 5; i++) {
          manager.consumeTokens(provider);
        }
        expect(manager.consumeTokens(provider)).toBe(false);

        // Wait 12 seconds (should add 1 token for coingecko)
        clock.advanceTimersByTime(12000);
        expect(manager.consumeTokens(provider)).toBe(true);
        expect(manager.consumeTokens(provider)).toBe(false);
      });

      it('should handle unknown providers with no rate limit', () => {
        const unknownProvider = 'unknown-provider';
        
        // Should allow all requests (no rate limit configured)
        for (let i = 0; i < 100; i++) {
          expect(manager.consumeTokens(unknownProvider)).toBe(true);
        }
      });
    });

    describe('canRequest', () => {
      it('should check if tokens are available without consuming', () => {
        expect(manager.canRequest('coingecko')).toBe(true);
        
        // Use up all tokens
        for (let i = 0; i < 5; i++) {
          manager.consumeTokens('coingecko');
        }
        
        expect(manager.canRequest('coingecko')).toBe(false);
      });
    });

    describe('getTokenCount', () => {
      it('should return current token count', () => {
        expect(manager.getTokenCount('coingecko')).toBe(5);
        
        // Use some tokens
        manager.consumeTokens('coingecko', 2);
        expect(manager.getTokenCount('coingecko')).toBe(3);
      });

      it('should return Infinity for unknown providers', () => {
        expect(manager.getTokenCount('unknown-provider')).toBe(Infinity);
      });
    });

    describe('getStatus', () => {
      it('should return status of all rate limiters', () => {
        const status = manager.getStatus();
        
        expect(status.coingecko).toEqual({
          tokens: 5,
          capacity: 5,
          rate: 1/12,
        });
        
        expect(status.coinmarketcap).toEqual({
          tokens: 30,
          capacity: 30,
          rate: 0.5,
        });
      });
    });

    describe('provider-specific limits', () => {
      it('should apply correct limits for coingecko', () => {
        const provider = 'coingecko';
        let count = 0;
        
        while (manager.consumeTokens(provider)) {
          count++;
        }
        
        expect(count).toBe(5); // 5 requests per minute
      });

      it('should apply correct limits for coinmarketcap', () => {
        const provider = 'coinmarketcap';
        let count = 0;
        
        while (manager.consumeTokens(provider)) {
          count++;
        }
        
        expect(count).toBe(30); // 30 requests per minute
      });
    });
  });
});