require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const routes = require('./routes');
const logger = require('./utils/logger');

const app = express();


// ========================================
// CRITICAL: Healthcheck endpoint (Railway)
// ========================================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'zerofalse-backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});


// ========================================
// CRITICAL: Root endpoint (Railway fallback)
// ========================================

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'ZeroFalse backend running',
    uptime: process.uptime()
  });
});


// ========================================
// Middleware
// ========================================

app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

app.use(express.json({
  limit: '10mb'
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));


// ========================================
// API Routes
// ========================================

app.use('/api', routes);


// ========================================
// Static frontend (optional)
// ========================================

const frontendPath = path.join(__dirname, '../../frontend');

if (fs.existsSync(frontendPath)) {

  app.use(express.static(frontendPath));

  app.get('/app', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });

}


// ========================================
// 404 Handler
// ========================================

app.use((req, res) => {

  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });

});


// ========================================
// Global Error Handler
// ========================================

app.use((err, req, res, next) => {

  logger.error('SERVER ERROR:', err);

  res.status(500).json({
    error: 'Internal Server Error'
  });

});


module.exports = app;