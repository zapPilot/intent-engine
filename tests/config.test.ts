describe('Configuration', () => {
  describe('Environment Variable Access', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should use environment variables when available', () => {
      // Test that the config loads from .env file correctly
      const { config } = require('../src/config');

      expect(typeof config.server.port).toBe('number');
      expect(config.server.nodeEnv).toBeDefined();
      expect(config.database.url).toBeDefined();
      expect(config.redis.url).toBeDefined();

      // Test structure
      expect(config).toHaveProperty('server');
      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('redis');
      expect(config).toHaveProperty('web3');
      expect(config).toHaveProperty('apis');
      expect(config).toHaveProperty('logging');
      expect(config).toHaveProperty('rateLimit');
    });

    it('should load environment variables using bracket notation', () => {
      process.env['PORT'] = '4000';
      process.env['NODE_ENV'] = 'production';
      process.env['DATABASE_URL'] = 'postgresql://prod:5432/db';
      process.env['REDIS_URL'] = 'redis://prod:6379';
      process.env['RATE_LIMIT_WINDOW_MS'] = '60000';
      process.env['RATE_LIMIT_MAX_REQUESTS'] = '50';

      jest.isolateModules(() => {
        const { config: testConfig } = require('../src/config');

        expect(testConfig.server.port).toBe(4000);
        expect(testConfig.server.nodeEnv).toBe('production');
        expect(testConfig.database.url).toBe('postgresql://prod:5432/db');
        expect(testConfig.redis.url).toBe('redis://prod:6379');
        expect(testConfig.rateLimit.windowMs).toBe(60000);
        expect(testConfig.rateLimit.maxRequests).toBe(50);
      });
    });

    it('should handle API key configuration', () => {
      process.env['ONEINCH_API_KEY'] = 'test-1inch-key';
      process.env['ZEROX_API_KEY'] = 'test-0x-key';
      process.env['PARASWAP_API_KEY'] = 'test-paraswap-key';

      jest.isolateModules(() => {
        const { config: testConfig } = require('../src/config');

        expect(testConfig.apis.oneInch).toBe('test-1inch-key');
        expect(testConfig.apis.zeroX).toBe('test-0x-key');
        expect(testConfig.apis.paraswap).toBe('test-paraswap-key');
      });
    });

    it('should handle Web3 RPC URLs configuration', () => {
      process.env['ETHEREUM_RPC_URL'] = 'https://custom-eth.rpc';
      process.env['ARBITRUM_RPC_URL'] = 'https://custom-arb.rpc';
      process.env['POLYGON_RPC_URL'] = 'https://custom-poly.rpc';

      jest.isolateModules(() => {
        const { config: testConfig } = require('../src/config');

        expect(testConfig.web3.rpcUrls.ethereum).toBe('https://custom-eth.rpc');
        expect(testConfig.web3.rpcUrls.arbitrum).toBe('https://custom-arb.rpc');
        expect(testConfig.web3.rpcUrls.polygon).toBe('https://custom-poly.rpc');
      });
    });

    it('should parse numeric environment variables correctly', () => {
      process.env['PORT'] = '8080';
      process.env['RATE_LIMIT_WINDOW_MS'] = '1800000';
      process.env['RATE_LIMIT_MAX_REQUESTS'] = '200';

      jest.isolateModules(() => {
        const { config: testConfig } = require('../src/config');

        expect(typeof testConfig.server.port).toBe('number');
        expect(testConfig.server.port).toBe(8080);
        expect(typeof testConfig.rateLimit.windowMs).toBe('number');
        expect(testConfig.rateLimit.windowMs).toBe(1800000);
        expect(typeof testConfig.rateLimit.maxRequests).toBe('number');
        expect(testConfig.rateLimit.maxRequests).toBe(200);
      });
    });

    it('should handle logging configuration', () => {
      process.env['LOG_LEVEL'] = 'debug';

      jest.isolateModules(() => {
        const { config: testConfig } = require('../src/config');

        expect(testConfig.logging.level).toBe('debug');
      });
    });

    it('should maintain config object structure', () => {
      jest.isolateModules(() => {
        const { config: testConfig } = require('../src/config');

        expect(testConfig).toHaveProperty('server');
        expect(testConfig).toHaveProperty('database');
        expect(testConfig).toHaveProperty('redis');
        expect(testConfig).toHaveProperty('web3');
        expect(testConfig).toHaveProperty('apis');
        expect(testConfig).toHaveProperty('logging');
        expect(testConfig).toHaveProperty('rateLimit');

        expect(testConfig.server).toHaveProperty('port');
        expect(testConfig.server).toHaveProperty('nodeEnv');
        expect(testConfig.web3).toHaveProperty('rpcUrls');
        expect(testConfig.web3.rpcUrls).toHaveProperty('ethereum');
        expect(testConfig.web3.rpcUrls).toHaveProperty('arbitrum');
        expect(testConfig.web3.rpcUrls).toHaveProperty('polygon');
      });
    });

    it('should load current configuration correctly', () => {
      // Test the actual current config
      const { config } = require('../src/config');

      expect(typeof config.server.port).toBe('number');
      expect(config.server.nodeEnv).toBeDefined();
      expect(config.database.url).toBeDefined();
      expect(config.redis.url).toBeDefined();
    });
  });
});
