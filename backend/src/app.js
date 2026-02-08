require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const routes = require('./routes');
const logger = require('./utils/logger');

const app = express();

// Health check FIRST (before any other middleware)
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Regular middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api', routes);

// Static files (if frontend exists)
const frontendPath = path.join(__dirname, '../../frontend');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

// Error handler
app.use((err, req, res, next) => {
  logger.error(err.message);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;
