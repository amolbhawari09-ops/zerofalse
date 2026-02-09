const axios = require('axios');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');

class GitHubService {

  constructor() {

    this.baseURL = 'https://api.github.com';

    // Token cache
    this.cachedToken = null;
    this.tokenExpiry = 0;

    this.validateEnv();

  }


  // =====================================================
  // Validate environment variables
  // =====================================================

  validateEnv() {

    const requiredVars = [
      'GITHUB_APP_ID',
      'GITHUB_PRIVATE_KEY'
    ];

    for (const name of requiredVars) {

      if (!process.env[name]) {

        logger.error(`Missing env variable: ${name}`);
        throw new Error(`Missing env variable: ${name}`);

      }

    }

    logger.info("GitHubService environment OK");

  }


  // =====================================================
  // Fix private key formatting
  // =====================================================

  getPrivateKey() {

    let key = process.env.GITHUB_PRIVATE_KEY;

    if (!key)
      throw new Error("Private key empty");

    // Fix Railway formatting
    key = key.replace(/\\n/g, '\n');

    if (
      !key.includes("BEGIN RSA PRIVATE KEY") &&
      !key.includes("BEGIN PRIVATE KEY")
    ) {
      throw new Error("Invalid private key format");
    }

    return key;

  }


  // =====================================================
  // Generate GitHub App JWT
  // =====================================================

  generateJWT() {

    const now = Math.floor(Date.now() / 1000);

    const payload = {

      iat: now - 60,
      exp: now + 600,
      iss: process.env.GITHUB_APP_ID

    };

    const token = jwt.sign(
      payload,
      this.getPrivateKey(),
      { algorithm: 'RS256' }
    );

    logger.info("GitHub JWT generated");

    return token;

  }


  // =====================================================
  // Get installation token (FIXED)
  // =====================================================

  async getInstallationToken(installationId) {

    try {

      if (!installationId)
        throw new Error("installationId missing");

      const now = Date.now();

      if (
        this.cachedToken &&
        now < this.tokenExpiry
      ) {

        logger.info("Using cached installation token");
        return this.cachedToken;

      }

      logger.info("Requesting installation token...");

      const jwtToken = this.generateJWT();

      const response = await axios.post(

        `${this.baseURL}/app/installations/${installationId}/access_tokens`,

        {},

        {
          headers: {

            Authorization: `Bearer ${jwtToken}`,
            Accept: 'application/vnd.github+json'

          }
        }

      );

      this.cachedToken = response.data.token;

      this.tokenExpiry =
        now + (response.data.expires_in * 1000 || 50 * 60 * 1000);

      logger.info("Installation token created");

      return this.cachedToken;

    }
    catch (error) {

      logger.error(
        "Installation token error:",
        error.response?.data || error.message
      );

      throw error;

    }

  }


  // =====================================================
  // Get PR files
  // =====================================================

  async getPullRequestFiles(owner, repo, prNumber, token) {

    try {

      logger.info(`Fetching PR files: ${owner}/${repo} #${prNumber}`);

      const response = await axios.get(

        `${this.baseURL}/repos/${owner}/${repo}/pulls/${prNumber}/files`,

        {
          headers: {

            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json'

          }
        }

      );

      logger.info(`Files fetched: ${response.data.length}`);

      return response.data;

    }
    catch (error) {

      logger.error(
        "Fetch files failed:",
        error.response?.data || error.message
      );

      throw error;

    }

  }


  // =====================================================
  // Get file content
  // =====================================================

  async getFileContent(owner, repo, path, ref, token) {

    try {

      const response = await axios.get(

        `${this.baseURL}/repos/${owner}/${repo}/contents/${path}?ref=${ref}`,

        {
          headers: {

            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json'

          }
        }

      );

      return Buffer
        .from(response.data.content, 'base64')
        .toString('utf8');

    }
    catch (error) {

      logger.warn(`Skipping file: ${path}`);

      return null;

    }

  }


  // =====================================================
  // Create PR comment (FULLY FIXED)
  // =====================================================

  async createPRComment(owner, repo, prNumber, body, installationId) {

    try {

      if (!installationId)
        throw new Error("installationId missing");

      logger.info("Creating PR comment...");

      const token =
        await this.getInstallationToken(
          installationId
        );

      const response = await axios.post(

        `${this.baseURL}/repos/${owner}/${repo}/issues/${prNumber}/comments`,

        { body },

        {
          headers: {

            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json'

          }
        }

      );

      logger.info("PR comment created");

      return response.data;

    }
    catch (error) {

      logger.error(
        "Comment creation failed:",
        error.response?.data || error.message
      );

      throw error;

    }

  }

}

module.exports = new GitHubService();