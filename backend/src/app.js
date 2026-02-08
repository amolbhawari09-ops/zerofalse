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
Normal JSON parser for all routes
*/
app.use(express.json({
  limit: '10mb'
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));


// =====================================================
// HEALTH CHECK ROUTE (CRITICAL FOR RAILWAY)
// =====================================================

app.get('/health', (req, res) => {

  res.status(200).json({
    status: 'OK',
    service: 'ZeroFalse Backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });

});


// =====================================================
// GITHUB WEBHOOK RAW BODY (ONLY THIS ROUTE)
// =====================================================

app.use('/api/webhook/github',
  express.raw({ type: 'application/json' })
);


// =====================================================
// API ROUTES
// =====================================================

app.use('/api', routes);


// =====================================================
// STATIC FRONTEND (SAFE VERSION)
// =====================================================

const frontendPath = path.join(__dirname, '../../frontend');

if (require('fs').existsSync(frontendPath)) {

  app.use(express.static(frontendPath));

  app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });

}


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


// =====================================================
// EXPORT
// =====================================================

module.exports = app;