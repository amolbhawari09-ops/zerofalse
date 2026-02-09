const axios = require('axios');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');

class GitHubService {

  constructor() {
    this.baseURL = 'https://api.github.com';
    this.tokenCache = new Map(); // Cache tokens by installationId
    this.validateEnv();
  }

  // =====================================================
  // Validate environment
  // =====================================================

  validateEnv() {
    const required = ['GITHUB_APP_ID', 'GITHUB_PRIVATE_KEY'];
    
    for (const name of required) {
      if (!process.env[name]) {
        throw new Error(`Missing env: ${name}`);
      }
    }
    
    logger.info("GitHubService: Environment OK");
  }

  // =====================================================
  // Fix private key format
  // =====================================================

  getPrivateKey() {
    let key = process.env.GITHUB_PRIVATE_KEY;

    if (!key) {
      throw new Error("Private key empty");
    }

    // Fix escaped newlines
    key = key.replace(/\\n/g, '\n');

    // Validate format
    const hasRSA = key.includes("BEGIN RSA PRIVATE KEY");
    const hasPKCS8 = key.includes("BEGIN PRIVATE KEY");
    
    if (!hasRSA && !hasPKCS8) {
      throw new Error("Invalid private key format");
    }

    return key;
  }

  // =====================================================
  // Generate JWT
  // =====================================================

  generateJWT() {
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iat: now - 60,  // 60 seconds in the past
      exp: now + 600, // 10 minutes
      iss: process.env.GITHUB_APP_ID
    };

    const token = jwt.sign(
      payload,
      this.getPrivateKey(),
      { algorithm: 'RS256' }
    );

    return token;
  }

  // =====================================================
  // Get installation token (with caching)
  // =====================================================

  async getInstallationToken(installationId) {
    try {
      if (!installationId) {
        throw new Error("installationId required");
      }

      // Check cache
      const cached = this.tokenCache.get(installationId);
      const now = Date.now();

      if (cached && now < cached.expiresAt) {
        logger.info("Using cached installation token");
        return cached.token;
      }

      logger.info(`Requesting token for installation ${installationId}`);

      const jwtToken = this.generateJWT();

      const response = await axios.post(
        `${this.baseURL}/app/installations/${installationId}/access_tokens`,
        {},
        {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          },
          timeout: 10000
        }
      );

      const token = response.data.token;
      const expiresIn = response.data.expires_in || 3600; // Default 1 hour
      
      // Cache token (expire 5 minutes early for safety)
      this.tokenCache.set(installationId, {
        token,
        expiresAt: now + ((expiresIn - 300) * 1000)
      });

      logger.info("Installation token acquired");
      return token;

    } catch (error) {
      logger.error("Token acquisition failed:", {
        status: error.response?.status,
        message: error.response?.data?.message || error.message
      });
      throw error;
    }
  }

  // =====================================================
  // Get PR files
  // =====================================================

  async getPullRequestFiles(owner, repo, prNumber, token) {
    try {
      logger.info(`Fetching files: ${owner}/${repo} #${prNumber}`);

      const response = await axios.get(
        `${this.baseURL}/repos/${owner}/${repo}/pulls/${prNumber}/files`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json'
          },
          timeout: 10000
        }
      );

      logger.info(`Found ${response.data.length} files`);
      return response.data;

    } catch (error) {
      logger.error("Failed to fetch files:", {
        status: error.response?.status,
        message: error.response?.data?.message
      });
      throw error;
    }
  }

  // =====================================================
  // Get file content
  // =====================================================

  async getFileContent(owner, repo, path, ref, token) {
    try {
      const response = await axios.get(
        `${this.baseURL}/repos/${owner}/${repo}/contents/${path}`,
        {
          params: { ref },
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json'
          },
          timeout: 10000
        }
      );

      // Handle both string and object content
      if (response.data.content) {
        return Buffer.from(response.data.content, 'base64').toString('utf8');
      }
      
      return null;

    } catch (error) {
      if (error.response?.status === 404) {
        logger.warn(`File not found: ${path}`);
      } else {
        logger.warn(`Failed to get ${path}:`, error.response?.status);
      }
      return null;
    }
  }

  // =====================================================
  // Create PR comment (FIXED - uses issues endpoint)
  // =====================================================

  async createPRComment(owner, repo, prNumber, body, token) {
  try {
    if (!token) {
      throw new Error("Token required");
    }

    if (!body || body.trim().length === 0) {
      throw new Error("Comment body cannot be empty");
    }

    logger.info(`💬 Creating PR comment on ${owner}/${repo} #${prNumber}`);
    logger.info(`Token: ${token.substring(0, 15)}...`);

    // Use issues endpoint (works for PRs)
    const url = `${this.baseURL}/repos/${owner}/${repo}/issues/${prNumber}/comments`;
    logger.info(`POST ${url}`);

    const response = await axios.post(
      url,
      { body },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        timeout: 10000
      }
    );

    logger.info(`✅ Comment created: ${response.data.html_url}`);
    return response.data;

  } catch (error) {
    logger.error("❌ Comment creation failed:");
    logger.error(`Status: ${error.response?.status}`);
    logger.error(`Data: ${JSON.stringify(error.response?.data)}`);
    logger.error(`Message: ${error.message}`);
    throw error;
  }
}


}  // <-- This closes the class

module.exports = new GitHubService();  // <-- This exports the instance
