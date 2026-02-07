require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const routes = require('./routes');
const logger = require('./utils/logger');

const app = express();


// =====================================================
// CORE MIDDLEWARE
// =====================================================

app.use(cors());

/*
CRITICAL:
GitHub webhook requires RAW body for signature verification
This MUST come before express.json()
*/
app.use('/api/webhook', express.raw({
  type: '*/*',
  limit: '10mb'
}));


// JSON parser for normal API routes
app.use(express.json({
  limit: '10mb'
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));


// =====================================================
// HEALTH CHECK
// =====================================================

app.get('/health', (req, res) => {

  res.json({
    status: 'OK',
    service: 'ZeroFalse Backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });

});


// =====================================================
// API ROUTES
// =====================================================

app.use('/api', routes);


// =====================================================
// SERVE FRONTEND
// =====================================================

const frontendPath = path.join(__dirname, '../../frontend');

app.use(express.static(frontendPath));

app.get('/', (req, res) => {

  res.sendFile(path.join(frontendPath, 'index.html'));

});


// =====================================================
// ERROR HANDLER
// =====================================================

app.use((err, req, res, next) => {

  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack
  });

  res.status(500).json({
    error: 'Internal server error'
  });

});


// =====================================================
// 404 HANDLER
// =====================================================

app.use((req, res) => {

  res.status(404).json({
    error: 'Route not found'
  });

});


module.exports = app;