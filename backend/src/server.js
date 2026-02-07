// backend/src/server.js

require('dotenv').config();

const http = require('http');
const app = require('./app');
const logger = require('./utils/logger');
const { connectDatabase } = require('./config/database');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

let server;

/**
 * Start server safely
 */
async function startServer() {
  try {
    logger.info('🚀 Starting ZeroFalse server...');

    // Connect database FIRST
    logger.info('📦 Connecting to MongoDB...');
    await connectDatabase();

    // Create HTTP server (more stable than app.listen directly)
    server = http.createServer(app);

    server.listen(PORT, HOST, () => {
      logger.info('==============================');
      logger.info(`🛡️ ZeroFalse running`);
      logger.info(`🌐 Host: ${HOST}`);
      logger.info(`📡 Port: ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'production'}`);
      logger.info('==============================');
    });

    // Handle server errors
    server.on('error', (err) => {
      logger.error('❌ Server error', {
        message: err.message,
        stack: err.stack
      });
    });

  } catch (error) {
    logger.error('❌ Failed to start server', {
      message: error.message,
      stack: error.stack
    });

    // Exit if startup fails
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
function shutdown(signal) {
  logger.warn(`⚠️ ${signal} received. Shutting down gracefully...`);

  if (server) {
    server.close(() => {
      logger.info('✅ Server closed cleanly');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

/**
 * Global crash protection
 */
process.on('uncaughtException', (err) => {
  logger.error('💥 Uncaught Exception', {
    message: err.message,
    stack: err.stack
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('💥 Unhandled Rejection', {
    reason: reason?.message || reason
  });
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/**
 * Start system
 */
startServer();