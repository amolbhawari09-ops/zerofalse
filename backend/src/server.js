require('dotenv').config();

const http = require('http');
const app = require('./app');
const logger = require('./utils/logger');
const { connectDatabase } = require('./config/database');

const PORT = parseInt(process.env.PORT, 10) || 3000;

async function boot() {
  try {
    await connectDatabase();
    console.log('✅ Database connected');

    const server = http.createServer(app);
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

boot();
