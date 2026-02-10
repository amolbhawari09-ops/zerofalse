require('dotenv').config();

const app = require('./app');
const { connectDatabase } = require('./config/database');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = '0.0.0.0';

let server;
let shuttingDown = false;


// ========================================
// GLOBAL CRASH HANDLERS
// ========================================

process.on('uncaughtException', (err) => {

  console.error('=================================');
  console.error('💥 UNCAUGHT EXCEPTION');
  console.error('Message:', err.message);
  console.error('Stack:', err.stack);
  console.error('=================================');

  shutdown(1);

});


process.on('unhandledRejection', (err) => {

  console.error('=================================');
  console.error('💥 UNHANDLED REJECTION');
  console.error('Message:', err?.message || err);
  console.error('Stack:', err?.stack);
  console.error('=================================');

  shutdown(1);

});


process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));


// ========================================
// SAFE SHUTDOWN
// ========================================

function shutdown(code = 0) {

  if (shuttingDown) return;
  shuttingDown = true;

  console.log('⚠️ Shutting down server...');

  if (server) {

    server.close(() => {

      console.log('✅ Server closed safely.');
      process.exit(code);

    });

    setTimeout(() => {

      console.log('⚠️ Force shutdown.');
      process.exit(code);

    }, 5000);

  }
  else {

    process.exit(code);

  }

}


// ========================================
// BOOT FUNCTION
// ========================================

async function boot() {

  try {

    console.log('=================================');
    console.log('🚀 Starting ZeroFalse Backend');
    console.log('Environment:', process.env.NODE_ENV);
    console.log('Port:', PORT);
    console.log('=================================');

    // DATABASE CONNECT
    await connectDatabase();

    console.log('✅ MongoDB connected successfully');


    // START SERVER
    server = app.listen(PORT, HOST, () => {

      console.log('=================================');
      console.log('✅ SERVER STATUS: RUNNING');
      console.log(`Host: ${HOST}`);
      console.log(`Port: ${PORT}`);
      console.log(`Started: ${new Date().toISOString()}`);
      console.log('=================================');

    });


    // SERVER ERROR HANDLER
    server.on('error', (err) => {

      console.error('=================================');
      console.error('💥 SERVER ERROR');
      console.error('Message:', err.message);
      console.error('Stack:', err.stack);
      console.error('=================================');

      shutdown(1);

    });


  }
  catch (err) {

    console.error('=================================');
    console.error('💥 BOOT FAILURE');
    console.error('Message:', err.message);
    console.error('Stack:', err.stack);
    console.error('Full error:', err);
    console.error('=================================');

    process.exit(1);

  }

}


boot();