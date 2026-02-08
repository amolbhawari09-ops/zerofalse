require('dotenv').config();

const http = require('http');
const app = require('./app');
const { connectDatabase } = require('./config/database');

const PORT = parseInt(process.env.PORT, 10) || 8080;

// Catch all errors
process.on('uncaughtException', (err) => {
  console.error('CRASH:', err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('PROMISE ERROR:', reason);
  process.exit(1);
});

async function boot() {
  try {
    console.log('Connecting to database...');
    await connectDatabase();
    console.log('✅ Database connected');

    const server = http.createServer(app);
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error('❌ Failed to start:', error.message);
    process.exit(1);
  }
}

boot();
