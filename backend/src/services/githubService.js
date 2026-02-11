const axios = require('axios');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');

const baseURL = 'https://api.github.com';
const tokenCache = new Map();

// Internal Helper: Secure JWT Generation
function generateJWT() {
  const now = Math.floor(Date.now() / 1000);
  const key = (process.env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  
  if (!key) throw new Error("GITHUB_PRIVATE_KEY is missing");

  return jwt.sign(
    { iat: now - 60, exp: now + 600, iss: process.env.GITHUB_APP_ID },
    key,
    { algorithm: 'RS256' }
  );
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
      tokenCache.set(installationId, { 
        token, 
        expiresAt: Date.now() + ((response.data.expires_in || 3600) - 300) * 1000 
      });
      return token;
    } catch (error) {
      logger.error("GitHub Token Error: " + error.message);
      throw error;
    }
  },

  getPullRequestFiles: async (owner, repo, prNumber, token) => {
    const res = await axios.get(`${baseURL}/repos/${owner}/${repo}/pulls/${prNumber}/files`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data;
  },

  getFileContent: async (owner, repo, path, ref, token) => {
    try {
      const res = await axios.get(`${baseURL}/repos/${owner}/${repo}/contents/${path}`, {
        params: { ref },
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data.content ? Buffer.from(res.data.content, 'base64').toString('utf8') : null;
    } catch (e) { return null; }
  },

  // =====================================================
  // UPGRADED: PROFESSIONAL COMMENT FORMATTING
  // =====================================================
  createPRComment: async (owner, repo, prNumber, findings, token) => {
    // 1. Calculate Summary Stats automatically
    const stats = {
      critical: findings.filter(f => f.severity?.toLowerCase() === 'critical').length,
      high: findings.filter(f => f.severity?.toLowerCase() === 'high').length,
      medium: findings.filter(f => f.severity?.toLowerCase() === 'medium').length,
      low: findings.filter(f => f.severity?.toLowerCase() === 'low').length,
      total: findings.length
    };

    // 2. Build Report Header
    let body = `## 🛡️ ZeroFalse Security Scan Results\n\n`;
    body += `**Scan Status:** COMPLETED\n\n`;
    body += `### Summary:\n`;
    body += `- **Total Issues:** ${stats.total}\n`;
    body += `- **Critical:** ${stats.critical}\n`;
    body += `- **High:** ${stats.high}\n`;
    body += `- **Medium:** ${stats.medium}\n`;
    body += `- **Low:** ${stats.low}\n\n`;
    body += `--- \n\n`;

    // 3. Handle Empty Results (Correct Code)
    if (stats.total === 0) {
      body += `✅ **No vulnerabilities detected.** Your code follows security best practices.`;
    } else {
      // 4. Handle Findings (Wrong Code)
      findings.forEach((f) => {
        const severity = (f.severity || 'HIGH').toUpperCase();
        
        body += `### ${severity}\n`;
        body += `**${f.type}** \n`;
        body += `**File:** ${f.filename || 'N/A'}  \n`;
        body += `**Line:** ${f.line || 'N/A'}  \n\n`;
        
        if (f.description) {
          body += `**Description:** ${f.description}\n\n`;
        }

        if (f.fix) {
          body += `**Fix:**\n`;
          body += `\`\`\`javascript\n${f.fix}\n\`\`\`\n`;
        }
        body += `--- \n\n`;
      });
    }

    body += `_ZeroFalse — AI Security for AI-Generated Code_`;

    // 5. Post to GitHub
    try {
      return await axios.post(`${baseURL}/repos/${owner}/${repo}/issues/${prNumber}/comments`, { body }, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
      });
    } catch (err) {
      logger.error("PR Comment post failed: " + err.message);
    }
  }
};
