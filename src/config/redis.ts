import { createClient } from 'redis';
import { config } from './index';
import { logger } from '../utils/logger';

export class RedisClient {
  private static instance: RedisClient;
  private client: ReturnType<typeof createClient>;

  private constructor() {
    this.client = createClient({
      url: config.redis.url,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: config.server.nodeEnv === 'development' ? false : (retries: number) => {
          const delay = Math.min(retries * 50, 2000);
          return delay;
        },
      },
    });

    this.client.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  public async connect(): Promise<void> {
    try {
      await this.client.connect();
      logger.info('Redis connected successfully');
    } catch (error) {
      logger.error('Redis connection failed:', error);
      throw error;
    }
  }

  public async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error('Redis GET error:', { key, error });
      throw error;
    }
  }

  public async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.client.setEx(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logger.error('Redis SET error:', { key, error });
      throw error;
    }
  }

  public async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error('Redis DEL error:', { key, error });
      throw error;
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS error:', { key, error });
      throw error;
    }
  }

  public async close(): Promise<void> {
    await this.client.quit();
    logger.info('Redis connection closed');
  }
}

export const redisClient = RedisClient.getInstance();