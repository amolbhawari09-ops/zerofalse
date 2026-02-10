require('dotenv').config();

const app = require('./app');
const { connectDatabase } = require('./config/database');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = '0.0.0.0';

let server;
let shuttingDown = false;


// ========================================
// ENV DEBUG (CRITICAL)
// ========================================

console.log('=================================');
console.log('🔍 ENVIRONMENT CHECK');
console.log('NODE_ENV:', process.env.NODE_ENV || 'MISSING');
console.log('PORT:', process.env.PORT || 'MISSING');

console.log(
  'GITHUB_APP_ID:',
  process.env.GITHUB_APP_ID ? 'OK ✅' : 'MISSING ❌'
);

console.log(
  'GITHUB_PRIVATE_KEY:',
  process.env.GITHUB_PRIVATE_KEY ? 'OK ✅' : 'MISSING ❌'
);

console.log(
  'GITHUB_WEBHOOK_SECRET:',
  process.env.GITHUB_WEBHOOK_SECRET ? 'OK ✅' : 'MISSING ❌'
);

console.log(
  'MONGO_URI:',
  process.env.MONGO_URI ? 'OK ✅' : 'MISSING ❌'
);

console.log('=================================');



// ========================================
// GLOBAL CRASH HANDLERS
// ========================================

process.on('uncaughtException', (err) => {

  console.error('=================================');
  console.error('💥 UNCAUGHT EXCEPTION');
  console.error('Message:', err.message);
  console.error('Stack:', err.stack);
  console.error('Full:', err);
  console.error('=================================');

  shutdown(1);

});


process.on('unhandledRejection', (err) => {

  console.error('=================================');
  console.error('💥 UNHANDLED REJECTION');
  console.error('Message:', err?.message || err);
  console.error('Stack:', err?.stack);
  console.error('Full:', err);
  console.error('=================================');

  shutdown(1);

});


process.on('SIGTERM', () => {

  console.log('⚠️ SIGTERM received');
  shutdown(0);

});


process.on('SIGINT', () => {

  console.log('⚠️ SIGINT received');
  shutdown(0);

});



// ========================================
// SAFE SHUTDOWN
// ========================================

function shutdown(code = 0) {

  if (shuttingDown) return;

  shuttingDown = true;

  console.log('=================================');
  console.log('⚠️ Shutting down server...');
  console.log('Exit code:', code);
  console.log('=================================');

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
    console.log('🔌 Connecting to MongoDB...');

    await connectDatabase();

    console.log('✅ MongoDB connected successfully');


    // START SERVER
    console.log('🌐 Starting HTTP server...');

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
      console.error('Full:', err);
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


// ========================================
// START APPLICATION
// ========================================

boot();