require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const routes = require('./routes');
const logger = require('./utils/logger');

const app = express();


// =============================
// CORE MIDDLEWARE
// =============================

app.use(cors());

app.use(express.json({
  limit: '10mb'
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));


// =============================
// HEALTH CHECK
// =============================

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'ZeroFalse Backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});


// =============================
// API ROUTES
// =============================

app.use('/api', routes);


// =============================
// STATIC FRONTEND (optional)
// =============================

const frontendPath = path.join(__dirname, '../../frontend');

app.use(express.static(frontendPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});


// =============================
// ERROR HANDLER
// =============================

app.use((err, req, res, next) => {

  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack
  });

  res.status(500).json({
    error: 'Internal server error',
    message:
      process.env.NODE_ENV === 'development'
        ? err.message
        : undefined
  });

});


// =============================
// 404 HANDLER
// =============================

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found'
  });
});


// =============================
// EXPORT ONLY (NO app.listen HERE)
// =============================

module.exports = app;