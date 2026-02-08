require('dotenv').config();

const app = require('./app');
const { connectDatabase } = require('./config/database');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = '0.0.0.0';

let server;
let shuttingDown = false;


// Crash handlers
process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION:', err);
  shutdown(1);
});

process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION:', err);
  shutdown(1);
});


process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);


function shutdown(code = 0) {

  if (shuttingDown) return;
  shuttingDown = true;

  console.log('Shutting down server...');

  if (server) {
    server.close(() => {
      console.log('Server closed.');
      process.exit(code);
    });

    setTimeout(() => process.exit(code), 5000);

  } else {
    process.exit(code);
  }
}


async function boot() {

  try {

    console.log('🚀 Starting ZeroFalse Backend...');
    console.log('Environment:', process.env.NODE_ENV);

    await connectDatabase();

    console.log('MongoDB connected successfully');

    server = app.listen(PORT, HOST, () => {

      console.log('=================================');
      console.log('SERVER STATUS: RUNNING');
      console.log(`Host: ${HOST}`);
      console.log(`Port: ${PORT}`);
      console.log(`Started: ${new Date().toISOString()}`);
      console.log('=================================');

    });

  }
  catch (err) {

    console.error('BOOT ERROR:', err);
    process.exit(1);

  }
}

boot();