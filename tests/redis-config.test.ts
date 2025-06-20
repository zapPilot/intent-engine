import { createClient } from 'redis';

// Mock config
jest.mock('../src/config', () => ({
  config: {
    redis: {
      url: 'redis://localhost:6379',
    },
    server: {
      nodeEnv: 'development',
    },
  },
}));

// Mock logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock Redis client
jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

describe('Redis Configuration', () => {
  const mockRedisClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    set: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue(mockRedisClient);
  });

  it('should create Redis client with correct development configuration', () => {
    // Import and test the configuration creation
    jest.isolateModules(() => {
      // This will trigger the Redis client creation
      require('../src/config/redis');

      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://localhost:6379',
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: false, // Should be false in development
        },
      });
    });
  });

  it('should create Redis client with reconnect strategy in production', () => {
    // Mock production environment
    jest.doMock('../src/config', () => ({
      config: {
        redis: {
          url: 'redis://prod:6379',
        },
        server: {
          nodeEnv: 'production',
        },
      },
    }));

    jest.isolateModules(() => {
      require('../src/config/redis');

      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://prod:6379',
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: expect.any(Function),
        },
      });

      // Test the reconnect strategy function
      const createClientCall = (createClient as jest.Mock).mock.calls[0][0];
      const reconnectStrategy = createClientCall.socket.reconnectStrategy;

      // Test various retry counts
      expect(reconnectStrategy(1)).toBe(50);
      expect(reconnectStrategy(10)).toBe(500);
      expect(reconnectStrategy(40)).toBe(2000); // Should cap at 2000
    });
  });

  it('should set up Redis client event listeners', () => {
    jest.isolateModules(() => {
      require('../src/config/redis');

      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
    });
  });

  it('should handle Redis connection timeout configuration', () => {
    jest.isolateModules(() => {
      require('../src/config/redis');

      const createClientCall = (createClient as jest.Mock).mock.calls[0][0];
      expect(createClientCall.socket.connectTimeout).toBe(5000);
    });
  });
});
