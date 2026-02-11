const axios = require('axios');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');

const baseURL = 'https://api.github.com';
const tokenCache = new Map();

// Helper: Fix private key newlines
function getPrivateKey() {
  let key = process.env.GITHUB_PRIVATE_KEY;
  if (!key) throw new Error("Private key empty");
  return key.replace(/\\n/g, '\n');
}

// Helper: JWT Generation
function generateJWT() {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now - 60, exp: now + 600, iss: process.env.GITHUB_APP_ID };
  return jwt.sign(payload, getPrivateKey(), { algorithm: 'RS256' });
}

module.exports = {
  getInstallationToken: async (installationId) => {
    try {
      if (!installationId) throw new Error("installationId required");
      
      const cached = tokenCache.get(installationId);
      if (cached && Date.now() < cached.expiresAt) return cached.token;

      const response = await axios.post(`${baseURL}/app/installations/${installationId}/access_tokens`, {}, {
        headers: { Authorization: `Bearer ${generateJWT()}`, Accept: 'application/vnd.github+json' }
      });

      const token = response.data.token;
      tokenCache.set(installationId, { token, expiresAt: Date.now() + ((response.data.expires_in || 3600) - 300) * 1000 });
      return token;
    } catch (error) {
      logger.error("Token acquisition failed:", error.message);
      throw error;
    }
  },

  getPullRequestFiles: async (owner, repo, prNumber, token) => {
    const response = await axios.get(`${baseURL}/repos/${owner}/${repo}/pulls/${prNumber}/files`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
    });
    return response.data;
  },

  getFileContent: async (owner, repo, path, ref, token) => {
    try {
      const response = await axios.get(`${baseURL}/repos/${owner}/${repo}/contents/${path}`, {
        params: { ref },
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
      });
      return response.data.content ? Buffer.from(response.data.content, 'base64').toString('utf8') : null;
    } catch (error) { return null; }
  },

  createPRComment: async (owner, repo, prNumber, body, token) => {
    return await axios.post(`${baseURL}/repos/${owner}/${repo}/issues/${prNumber}/comments`, { body }, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
    });
  }
};
