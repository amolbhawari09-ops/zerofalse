require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const routes = require('./routes');
const logger = require('./utils/logger');

const app = express();


// ========================================
// HEALTHCHECK (Railway required)
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
// ROOT ENDPOINT (Railway fallback)
// ========================================

app.get('/', (req, res) => {

  res.status(200).json({
    status: 'OK',
    message: 'ZeroFalse backend running',
    uptime: process.uptime()
  });

});


// ========================================
// CORS
// ========================================

app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Hub-Signature-256',
    'X-GitHub-Event'
  ]
}));


// ========================================
// IMPORTANT: DO NOT use express.raw here
// webhook raw parsing is handled in routes/webhook.js
// ========================================


// ========================================
// NORMAL JSON PARSER
// ========================================

app.use(express.json({
  limit: '10mb'
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));


// ========================================
// API ROUTES
// ========================================

app.use('/api', routes);


// ========================================
// STATIC FRONTEND (optional)
// ========================================

const frontendPath =
  path.join(__dirname, '../../frontend');

if (fs.existsSync(frontendPath)) {

  app.use(express.static(frontendPath));

  app.get('/app', (req, res) => {

    res.sendFile(
      path.join(frontendPath, 'index.html')
    );

  });

}


// ========================================
// 404 HANDLER
// ========================================

app.use((req, res) => {

  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });

});


// ========================================
// GLOBAL ERROR HANDLER
// ========================================

app.use((err, req, res, next) => {

  logger.error('SERVER ERROR:', {
    message: err.message,
    stack: err.stack
  });

  res.status(500).json({
    error: 'Internal Server Error'
  });

});


module.exports = app;