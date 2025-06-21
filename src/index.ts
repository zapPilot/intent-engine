import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { database } from './config/database';
import { redisClient } from './config/redis';
import routes from './routes';

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
});
app.use(limiter);

app.use((req, _res, next) => {
  req.headers['x-request-id'] =
    req.headers['x-request-id'] || Math.random().toString(36).substring(2, 15);
  next();
});

// Root health check endpoint
app.get('/', (_req, res) => {
  res.json({
    service: 'Intent Engine API',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.server.nodeEnv,
    version: '1.0.0',
  });
});

// Basic health endpoint (redirect to comprehensive health check)
app.get('/health', (_req, res) => {
  res.redirect('/api/v1/health');
});

app.get('/health/ready', (_req, res) => {
  res.redirect('/api/v1/health/ready');
});

app.get('/health/live', (_req, res) => {
  res.redirect('/api/v1/health/live');
});

app.use('/api/v1', routes);

app.get('/api/v1', (_req, res) => {
  res.json({
    message: 'Intent Engine API v1',
    version: '1.0.0',
    endpoints: [
      'POST /api/v1/intent/execute',
      'GET /api/v1/intent/quote',
    ],
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
});

app.use(errorHandler);

const startServer = async () => {
  try {
    // Try to connect to database and Redis, but don't fail if they're not available in development
    if (config.server.nodeEnv === 'production') {
      await database.connect();
      await redisClient.connect();
    } else {
      // In development, try to connect but continue if they fail
      try {
        await database.connect();
        logger.info('Database connected in development mode');
      } catch (error) {
        logger.warn('Database not available in development mode, continuing without it');
      }

      try {
        await redisClient.connect();
        logger.info('Redis connected in development mode');
      } catch (error) {
        logger.warn('Redis not available in development mode, continuing without it');
      }
    }

    const server = app.listen(config.server.port, () => {
      logger.info(`Intent Engine server running on port ${config.server.port}`);
      logger.info(`Environment: ${config.server.nodeEnv}`);
    });

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

const server = startServer();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  const serverInstance = await server;
  serverInstance.close(async () => {
    try {
      await database.close();
    } catch (error) {
      logger.warn('Database close error:', error);
    }

    try {
      await redisClient.close();
    } catch (error) {
      logger.warn('Redis close error:', error);
    }

    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', error => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

export { app };
export default app;
