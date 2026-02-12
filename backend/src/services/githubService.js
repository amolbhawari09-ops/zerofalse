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
   * UPGRADED: "Perfect Enterprise" Format
   * Vertical scannable cards, dividers, and dynamic Risk Score.
   */
  createPRComment: async (owner, repo, prNumber, scanData, token) => {
    // 🛡️ Ensure findings is always an array
    const findings = Array.isArray(scanData.findings) ? scanData.findings : [];
    const score = scanData.riskScore !== undefined ? scanData.riskScore : "N/A";

    // 1. Calculate Stats (Hides empty levels)
    const stats = {
      critical: findings.filter(f => f.severity?.toLowerCase() === 'critical').length,
      high: findings.filter(f => f.severity?.toLowerCase() === 'high').length,
      medium: findings.filter(f => f.severity?.toLowerCase() === 'medium').length,
      total: findings.length
    };

    // 2. Build Header & Summary Card
    let body = `## 🛡️ ZeroFalse Security Scan Results\n\n`;
    body += `**Scan Status:** COMPLETED\n`;
    body += `**Risk Score:** ${score}/10\n`;
    
    // Scannable line of findings
    const counts = [];
    if (stats.critical > 0) counts.push(`Critical: ${stats.critical}`);
    if (stats.high > 0) counts.push(`High: ${stats.high}`);
    if (stats.medium > 0) counts.push(`Medium: ${stats.medium}`);
    
    body += counts.length > 0 ? `**${counts.join(' | ')}**\n\n` : `**No Issues Found**\n\n`;
    body += `────────────────────────────\n\n`;

    // 3. Handle Findings List
    if (stats.total === 0) {
      body += `✅ **No vulnerabilities detected.** Your code follows security best practices.`;
    } else {
      findings.forEach((f) => {
        const sev = (f.severity || 'HIGH').toUpperCase();
        
        body += `**${sev}: ${f.type || 'Security Risk'}**\n`;
        body += `**Location:** \`${f.filename || 'N/A'}:${f.line || '?'}\`\n`;
        
        // Use the new 1-sentence fields from the LLM
        body += `**Issue:** ${f.issue || f.description || 'Vulnerability detected.'}\n`;
        body += `**Fix:** ${f.fix_instruction || 'Update the implementation to follow security standards.'}\n\n`;
        
        body += `────────────────────────────\n\n`;
      });
      
      body += `**⚠️ Fix these issues before merging.**`;
    }

    body += `\n\n_ZeroFalse — AI Security for AI-Generated Code_`;

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
