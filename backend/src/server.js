// backend/src/server.js
const app = require('./app');
const logger = require('./utils/logger');

const PORT = process.env.PORT;

if (!PORT) {
  throw new Error("PORT environment variable is missing");
}

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🛡️ ZeroFalse server running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'production'}`);
});