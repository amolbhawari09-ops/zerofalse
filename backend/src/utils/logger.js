// =====================================================
// PRODUCTION LOGGER (Direct Output for Railway)
// =====================================================

const logger = {
  info: (msg, meta = {}) => {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    // Force output so Railway picks it up
    console.log(`[${timestamp}] INFO: ${msg} ${metaStr}`);
  },
  
  error: (msg, meta = {}) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] 💥 ERROR: ${msg}`, meta);
  },
  
  warn: (msg, meta = {}) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] ⚠️ WARN: ${msg}`, meta);
  },

  debug: (msg, meta = {}) => {
    // Keep debug hidden in production to save log space
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEBUG] ${msg}`, meta);
    }
  }
};

module.exports = logger;
