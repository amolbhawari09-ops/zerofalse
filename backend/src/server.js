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
 * CRITICAL FIX — keeps Railway container alive
 */
setInterval(() => {

  // do nothing, just keep event loop active

}, 1000 * 60 * 10);



async function boot() {

  try {

    logger.info('🚀 Booting ZeroFalse...');

    await connectDatabase();

    logger.info('✅ Database ready');

    server = http.createServer(app);

    await new Promise((resolve, reject) => {

      server.listen(PORT, HOST, err => {

        if (err) return reject(err);

        resolve();

      });

    });

    logger.info(`🛡️ Server LIVE on ${HOST}:${PORT}`);

  }

  catch (error) {

    logger.error('BOOT FAILED', error);

    process.exit(1);

  }

}


process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown(signal) {

  if (isShuttingDown) return;

  isShuttingDown = true;

  logger.warn(`Shutdown signal: ${signal}`);

  if (server) {

    server.close(() => {

      logger.info('Server closed');

      process.exit(0);

    });

  }

}


boot();