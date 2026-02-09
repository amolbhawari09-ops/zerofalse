const axios = require('axios');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');

class GitHubService {

  constructor() {

    this.baseURL = 'https://api.github.com';

    // Token cache
    this.cachedToken = null;
    this.tokenExpiry = 0;

    // Validate required env variables at startup
    this.validateEnv();

  }


  // =====================================================
  // Validate environment variables
  // =====================================================

  validateEnv() {

    const requiredVars = [
      'GITHUB_APP_ID',
      'GITHUB_PRIVATE_KEY',
      'GITHUB_INSTALLATION_ID'
    ];

    for (const name of requiredVars) {

      if (!process.env[name]) {

        logger.error(`Missing required env variable: ${name}`);
        throw new Error(`Missing required env variable: ${name}`);

      }

    }

    logger.info("GitHubService environment validated");

  }


  // =====================================================
  // Get properly formatted private key
  // =====================================================

  getPrivateKey() {

    try {

      let key = process.env.GITHUB_PRIVATE_KEY;

      if (!key) {
        throw new Error("GITHUB_PRIVATE_KEY is empty");
      }

      // Convert escaped \n → real newline
      key = key.replace(/\\n/g, '\n');

      // Validate format
      if (!key.includes('BEGIN RSA PRIVATE KEY')) {
        throw new Error("Invalid private key format");
      }

      return key;

    }
    catch (error) {

      logger.error("Private key processing failed", error.message);
      throw error;

    }

  }


  // =====================================================
  // Generate GitHub App JWT
  // =====================================================

  generateJWT() {

    try {

      const now = Math.floor(Date.now() / 1000);

      const payload = {
        iat: now - 60,
        exp: now + 600,
        iss: process.env.GITHUB_APP_ID
      };

      const privateKey = this.getPrivateKey();

      const token = jwt.sign(
        payload,
        privateKey,
        { algorithm: 'RS256' }
      );

      logger.info("GitHub JWT generated");

      return token;

    }
    catch (error) {

      logger.error("JWT generation failed", error.message);
      throw error;

    }

  }


  // =====================================================
  // Get installation token (cached)
  // =====================================================

  async getInstallationToken(installationId) {

    try {

      const now = Date.now();

      // Use cached token if still valid
      if (
        this.cachedToken &&
        now < this.tokenExpiry
      ) {

        logger.info("Using cached installation token");
        return this.cachedToken;

      }

      logger.info("Requesting new installation token...");

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

      // expire slightly early for safety
      this.tokenExpiry = now + (50 * 60 * 1000);

      logger.info("Installation token generated successfully");

      return this.cachedToken;

    }
    catch (error) {

      logger.error(
        "Installation token failed",
        error.response?.data || error.message
      );

      throw error;

    }

  }


  // =====================================================
  // Get PR files
  // =====================================================

  async getPullRequestFiles(owner, repo, pullNumber, token) {

    try {

      const response = await axios.get(
        `${this.baseURL}/repos/${owner}/${repo}/pulls/${pullNumber}/files`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json'
          }
        }
      );

      return response.data;

    }
    catch (error) {

      logger.error(
        "Failed to fetch PR files",
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
    catch {

      logger.warn(`Skipping file: ${path}`);
      return null;

    }

  }


  // =====================================================
  // Get ALL PR code
  // =====================================================

  async getPullRequestCode(owner, repo, pullNumber, branch, installationId) {

    try {

      logger.info("Fetching PR code...");

      const token =
        await this.getInstallationToken(installationId);

      const files =
        await this.getPullRequestFiles(
          owner,
          repo,
          pullNumber,
          token
        );

      const results = [];

      for (const file of files) {

        if (
          file.status === "removed" ||
          file.filename.endsWith(".md") ||
          file.filename.endsWith(".txt") ||
          file.filename.includes("package-lock.json")
        ) {
          continue;
        }

        const content =
          await this.getFileContent(
            owner,
            repo,
            file.filename,
            branch,
            token
          );

        if (content) {

          results.push({
            filename: file.filename,
            content
          });

        }

      }

      logger.info(`Fetched ${results.length} files`);

      return results;

    }
    catch (error) {

      logger.error(
        "PR code fetch failed",
        error.response?.data || error.message
      );

      throw error;

    }

  }


  // =====================================================
  // Create PR comment
  // =====================================================

  async createPRComment(owner, repo, pullNumber, body, installationId) {

    try {

      logger.info("Posting PR comment...");

      const token =
        await this.getInstallationToken(installationId);

      const response = await axios.post(
        `${this.baseURL}/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
        { body },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json'
          }
        }
      );

      logger.info("PR comment posted successfully");

      return response.data;

    }
    catch (error) {

      logger.error(
        "Comment failed",
        error.response?.data || error.message
      );

      throw error;

    }

  }

}

module.exports = new GitHubService();