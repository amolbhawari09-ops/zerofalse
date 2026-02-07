const isDev = process.env.NODE_ENV === 'development';

function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...meta
  };
  
  if (isDev) {
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, meta);
  }
  
  // In production, send to logging service
  return logEntry;
}

const logger = {
  info: (msg, meta) => log('info', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta)
};

module.exports = logger;
