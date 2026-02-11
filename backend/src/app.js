require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const routes = require('./routes');
const logger = require('./utils/logger');

const app = express();

// =====================================================
// HEALTHCHECK (Required by Railway)
// =====================================================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'ZeroFalse backend running' });
});

// =====================================================
// CORS CONFIGURATION
// =====================================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Hub-Signature-256', 'X-GitHub-Event']
}));

// =====================================================
// CRITICAL: JSON PARSER WITH RAW BODY CAPTURE
// =====================================================
// We capture the original buffer (buf) and store it as req.rawBody.
// This is mandatory for GitHub Signature Verification to work.
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    if (req.originalUrl && req.originalUrl.includes('/webhook')) {
      req.rawBody = buf; // Store the buffer directly
      logger.info(`📦 Raw body captured for: ${req.originalUrl}`);
    }
  }
}));

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =====================================================
// API ROUTES
// =====================================================
app.use('/api', routes);

// =====================================================
// STATIC FRONTEND SUPPORT
// =====================================================
const frontendPath = path.join(__dirname, '../../frontend');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get('/app', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// =====================================================
// ERROR HANDLERS
// =====================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

app.use((err, req, res, next) => {
  logger.error('SERVER ERROR:', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
