require('dotenv').config();

const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const logger = require('./utils/logger');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    version: '1.0.0',
    env: process.env.NODE_ENV
  });
});

// API routes
app.use('/api', routes);

// Serve frontend static files (if deployed together)
app.use(express.static('../frontend'));

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', { error: err.message, stack: err.stack });
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// LOCAL DEVELOPMENT ONLY
// This block only runs when NOT on Vercel
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    logger.info(`🛡️ ZeroFalse server running on port ${PORT}`);
    logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

// VERCEL SERVERLESS EXPORT
// This is required for Vercel deployment
module.exports = app;
