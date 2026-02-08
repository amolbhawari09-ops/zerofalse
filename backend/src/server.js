require('dotenv').config();

const http = require('http');
const app = require('./app');
const { connectDatabase } = require('./config/database');


// =============================
// CONFIG
// =============================

const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = '0.0.0.0';

let server;
let isShuttingDown = false;


// =============================
// GLOBAL ERROR HANDLERS
// =============================

// Catch synchronous crashes
process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION');
  console.error(err.name, err.message);
  console.error(err.stack);

  shutdown(1);
});

// Catch async crashes
process.on('unhandledRejection', (reason) => {
  console.error('💥 UNHANDLED PROMISE REJECTION');
  console.error(reason);

  shutdown(1);
});


// =============================
// GRACEFUL SHUTDOWN HANDLER
// =============================

function shutdown(exitCode = 0) {

  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('🛑 Graceful shutdown initiated...');

  if (server) {
    server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(exitCode);
    });

    // Force shutdown after timeout
    setTimeout(() => {
      console.error('⚠️ Forced shutdown');
      process.exit(exitCode);
    }, 10000);

  } else {
    process.exit(exitCode);
  }
}


// Railway / Docker shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);


// =============================
// BOOT FUNCTION
// =============================

async function boot() {

  try {

    console.log('🚀 Starting ZeroFalse Backend...');
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

    // =============================
    // CONNECT DATABASE
    // =============================

    console.log('📡 Connecting to MongoDB...');

    await connectDatabase();

    console.log('✅ MongoDB connected successfully');


    // =============================
    // CREATE HTTP SERVER
    // =============================

    server = http.createServer(app);


    // =============================
    // START LISTENING
    // =============================

    server.listen(PORT, HOST, () => {

      console.log('=================================');
      console.log('✅ SERVER STATUS: RUNNING');
      console.log(`🌐 Host: ${HOST}`);
      console.log(`🚪 Port: ${PORT}`);
      console.log(`🕒 Started: ${new Date().toISOString()}`);
      console.log('=================================');

    });


    // =============================
    // SERVER ERROR HANDLER
    // =============================

    server.on('error', (err) => {

      console.error('💥 SERVER ERROR');
      console.error(err);

      shutdown(1);

    });


  } catch (error) {

    console.error('❌ BOOT FAILURE');
    console.error(error);

    shutdown(1);

  }

}


// =============================
// START SYSTEM
// =============================

boot();