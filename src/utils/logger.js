/**
 * Lightweight logging utility
 * Provides structured logging with log levels
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

class Logger {
  constructor(context = '') {
    this.context = context;
    this.level =
      LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;
  }

  _formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const contextStr = this.context ? `[${this.context}]` : '';
    const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';

    return `${timestamp} ${level} ${contextStr} ${message} ${metaStr}`.trim();
  }

  error(message, meta = {}) {
    if (this.level >= LOG_LEVELS.ERROR) {
      console.error(this._formatMessage('ERROR', message, meta));
    }
  }

  warn(message, meta = {}) {
    if (this.level >= LOG_LEVELS.WARN) {
      console.warn(this._formatMessage('WARN', message, meta));
    }
  }

  info(message, meta = {}) {
    if (this.level >= LOG_LEVELS.INFO) {
      // eslint-disable-next-line no-console
      console.info(this._formatMessage('INFO', message, meta));
    }
  }

  debug(message, meta = {}) {
    if (this.level >= LOG_LEVELS.DEBUG) {
      // eslint-disable-next-line no-console
      console.log(this._formatMessage('DEBUG', message, meta));
    }
  }
}

/**
 * Create a logger instance with optional context
 * @param {string} context - Logger context (e.g., 'UnifiedZapExecutor', 'SwapService')
 * @returns {Logger} - Logger instance
 */
function createLogger(context = '') {
  return new Logger(context);
}

module.exports = { createLogger, Logger };
