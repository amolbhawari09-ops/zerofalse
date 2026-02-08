require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const routes = require('./routes');
const logger = require('./utils/logger');

const app = express();

// Health check FIRST - Keep it simple!
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', time: Date.now() });
});

// Regular middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api', routes);

// Static files
const frontendPath = path.join(__dirname, '../../frontend');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Error:', err.message);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;
