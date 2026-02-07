const crypto = require('crypto');

/**
 * Verify GitHub webhook signature (PREVENTS TIMING ATTACKS)
 */
function verifyGitHubSignature(payload, signature, secret) {
  if (!signature || !secret) {
    console.error('Missing signature or secret');
    return false;
  }
  
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  
  try {
    // Timing-safe comparison prevents timing attacks
    const sigBuf = Buffer.from(signature);
    const digBuf = Buffer.from(digest);
    
    if (sigBuf.length !== digBuf.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(sigBuf, digBuf);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Generate secure random ID
 */
function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Hash sensitive data
 */
function hashData(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

module.exports = {
  verifyGitHubSignature,
  generateId,
  hashData
};
