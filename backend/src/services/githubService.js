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
    } catch (e) { 
      return null; 
    }
  },

  /**
   * UPGRADED: Minimalist Security Engineer Format
   * Removes zero-count clutter and adds technical 'Impact' sections.
   */
  createPRComment: async (owner, repo, prNumber, findings, token) => {
    const safeFindings = Array.isArray(findings) ? findings : [];

    // 1. Calculate Summary Stats
    const stats = {
      critical: safeFindings.filter(f => f.severity?.toLowerCase() === 'critical').length,
      high: safeFindings.filter(f => f.severity?.toLowerCase() === 'high').length,
      medium: safeFindings.filter(f => f.severity?.toLowerCase() === 'medium').length,
      low: safeFindings.filter(f => f.severity?.toLowerCase() === 'low').length,
      total: safeFindings.length
    };

    // 2. Build Smart Header (Only show what exists)
    let body = `## 🛡️ ZeroFalse Security Audit\n\n`;
    body += `**Scan Status:** COMPLETED\n`;
    body += `**Total Issues Found:** ${stats.total}\n\n`;

    if (stats.total > 0) {
      body += `### 📊 Risk Profile:\n`;
      if (stats.critical > 0) body += `- 🔴 **Critical:** ${stats.critical}\n`;
      if (stats.high > 0) body += `- 🟠 **High:** ${stats.high}\n`;
      if (stats.medium > 0) body += `- 🟡 **Medium:** ${stats.medium}\n`;
      if (stats.low > 0) body += `- 🔵 **Low:** ${stats.low}\n`;
      body += `\n---\n\n`;
    }

    // 3. Handle Findings
    if (stats.total === 0) {
      body += `✅ **No vulnerabilities detected.** Your code follows security best practices.`;
    } else {
      safeFindings.forEach((f) => {
        const sev = (f.severity || 'HIGH').toUpperCase();
        const icon = sev === 'CRITICAL' ? '🔴' : sev === 'HIGH' ? '🟠' : '🟡';
        
        body += `### ${icon} ${sev}: ${f.type || 'Security Risk'}\n`;
        body += `**Location:** \`${f.filename || 'N/A'}\` (Line ${f.line || 'N/A'})\n\n`;
        
        // UPGRADE: Concise Expert Reasoning
        if (f.description) {
          body += `**🔍 Why it's dangerous:** ${f.description}\n\n`;
        }

        // UPGRADE: Business/Technical Impact
        if (f.impact) {
          body += `**⚠️ Impact:** ${f.impact}\n\n`;
        }

        if (f.fix) {
          body += `**🛡️ Recommended Fix:**\n`;
          body += `\`\`\`javascript\n${f.fix}\n\`\`\`\n`;
        }
        body += `--- \n\n`;
      });
    }

    body += `_ZeroFalse — AI Security for AI-Generated Code_`;

    // 4. Post to GitHub
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
