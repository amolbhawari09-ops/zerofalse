const axios = require('axios');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');

const baseURL = 'https://api.github.com';
const tokenCache = new Map();

// Internal Helper: Secure JWT Generation for GitHub App
function generateJWT() {
  const now = Math.floor(Date.now() / 1000);
  const key = (process.env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  
  if (!key) throw new Error("GITHUB_PRIVATE_KEY is missing from environment variables");

  return jwt.sign(
    { 
      iat: now - 60, 
      exp: now + 600, 
      iss: process.env.GITHUB_APP_ID 
    },
    key,
    { algorithm: 'RS256' }
  );
}

module.exports = {
  /**
   * Generates or retrieves a cached installation token for the GitHub App.
   */
  getInstallationToken: async (installationId) => {
    try {
      if (!installationId) throw new Error("installationId is required");
      
      const cached = tokenCache.get(installationId);
      if (cached && Date.now() < cached.expiresAt) return cached.token;

      const response = await axios.post(`${baseURL}/app/installations/${installationId}/access_tokens`, {}, {
        headers: { 
          Authorization: `Bearer ${generateJWT()}`, 
          Accept: 'application/vnd.github+json' 
        }
      });

      const token = response.data.token;
      tokenCache.set(installationId, { 
        token, 
        expiresAt: Date.now() + ((response.data.expires_in || 3600) - 300) * 1000 
      });
      return token;
    } catch (error) {
      logger.error("GitHub Token Error: " + (error.response?.data?.message || error.message));
      throw error;
    }
  },

  /**
   * Retrieves the list of files modified in a Pull Request.
   */
  getPullRequestFiles: async (owner, repo, prNumber, token) => {
    const res = await axios.get(`${baseURL}/repos/${owner}/${repo}/pulls/${prNumber}/files`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data;
  },

  /**
   * Retrieves the raw content of a specific file at a given reference.
   */
  getFileContent: async (owner, repo, path, ref, token) => {
    try {
      const res = await axios.get(`${baseURL}/repos/${owner}/${repo}/contents/${path}`, {
        params: { ref },
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data.content ? Buffer.from(res.data.content, 'base64').toString('utf8') : null;
    } catch (e) { 
      return null; 
    }
  },

  /**
   * UPGRADED: Creates a professional, formatted security report on the GitHub PR.
   * Fixes: "findings.filter is not a function" by ensuring data is an array.
   */
  createPRComment: async (owner, repo, prNumber, findings, token) => {
    // 🛡️ SAFETY GUARD: Ensure findings is always an array to prevent crashes
    const safeFindings = Array.isArray(findings) ? findings : [];

    // 1. Calculate Summary Stats
    const stats = {
      critical: safeFindings.filter(f => f.severity?.toLowerCase() === 'critical').length,
      high: safeFindings.filter(f => f.severity?.toLowerCase() === 'high').length,
      medium: safeFindings.filter(f => f.severity?.toLowerCase() === 'medium').length,
      low: safeFindings.filter(f => f.severity?.toLowerCase() === 'low').length,
      total: safeFindings.length
    };

    // 2. Build Report Header & Summary
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
      safeFindings.forEach((f) => {
        const severity = (f.severity || 'HIGH').toUpperCase();
        
        body += `### ${severity}\n`;
        body += `**${f.type || 'Potential Security Risk'}** \n`;
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

    // 5. Post to GitHub API
    try {
      return await axios.post(`${baseURL}/repos/${owner}/${repo}/issues/${prNumber}/comments`, 
        { body }, 
        {
          headers: { 
            Authorization: `Bearer ${token}`, 
            Accept: 'application/vnd.github.v3+json' 
          }
        }
      );
    } catch (err) {
      logger.error("PR Comment post failed: " + (err.response?.data?.message || err.message));
    }
  }
};
