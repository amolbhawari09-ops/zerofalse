// backend/src/server.js

require('dotenv').config();

const http = require('http');
const app = require('./app');
const logger = require('./utils/logger');
const { connectDatabase } = require('./config/database');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = '0.0.0.0';

let server = null;
let isShuttingDown = false;


/**
 * Boot function (Railway-safe)
 */
async function boot() {

  try {

    logger.info('🚀 Booting ZeroFalse...');

    // Step 1: Connect MongoDB
    logger.info('📦 Connecting to MongoDB...');
    await connectDatabase();

    logger.info('✅ Database ready');

    // Step 2: Create HTTP server
    server = http.createServer(app);

    // Step 3: Start listening (await ensures stability)
    await new Promise((resolve, reject) => {

      server.listen(PORT, HOST, (err) => {

        if (err) return reject(err);

        resolve();

      });

    });

    logger.info('================================');
    logger.info('🛡️ ZeroFalse LIVE');
    logger.info(`🌐 Host: ${HOST}`);
    logger.info(`📡 Port: ${PORT}`);
    logger.info(`📊 Env: ${process.env.NODE_ENV || 'production'}`);
    logger.info('================================');

  } catch (error) {

    logger.error('❌ BOOT FAILED', {
      message: error.message,
      stack: error.stack
    });

    process.exit(1);

  }

}


/**
 * Prevent Railway idle shutdown
 * THIS IS THE KEY FIX
 */
process.stdin.resume();


/**
 * Graceful shutdown
 */
async function shutdown(signal) {

  if (isShuttingDown) return;

  isShuttingDown = true;

  logger.warn(`⚠️ ${signal} received. Shutting down...`);

  try {

    if (server) {

      await new Promise(resolve =>
        server.close(resolve)
      );

      logger.info('✅ HTTP server closed');

    }

  } catch (err) {

    logger.error('Shutdown error', err);

  }

  process.exit(0);

}


/**
 * Crash protection
 */
process.on('uncaughtException', err => {

  logger.error('💥 Uncaught Exception', err);

});

process.on('unhandledRejection', err => {

  logger.error('💥 Unhandled Rejection', err);

});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);


/**
 * Start system
 */
boot();