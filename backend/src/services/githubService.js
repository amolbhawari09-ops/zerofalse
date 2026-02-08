const axios = require('axios');
const logger = require('../utils/logger');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class GitHubService {

  constructor() {
    this.baseURL = 'https://api.github.com';
  }


  // =====================================================
  // Generate GitHub App JWT
  // =====================================================

  generateJWT() {

    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iat: now,
      exp: now + 600,
      iss: process.env.GITHUB_APP_ID
    };

    const privateKey =
      process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n');

    return jwt.sign(
      payload,
      privateKey,
      { algorithm: 'RS256' }
    );
  }


  // =====================================================
  // Get installation token
  // =====================================================

  async getInstallationToken(installationId) {

    try {

      const jwtToken = this.generateJWT();

      const response =
        await axios.post(
          `${this.baseURL}/app/installations/${installationId}/access_tokens`,
          {},
          {
            headers: {
              Authorization: `Bearer ${jwtToken}`,
              Accept: 'application/vnd.github+json'
            }
          }
        );

      return response.data.token;

    }
    catch (error) {

      logger.error("Failed to get installation token", error);

      throw error;
    }
  }


  // =====================================================
  // Get PR files
  // =====================================================

  async getPullRequestFiles(owner, repo, pullNumber, token) {

    const response =
      await axios.get(
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


  // =====================================================
  // Get file content
  // =====================================================

  async getFileContent(owner, repo, path, ref, token) {

    try {

      const response =
        await axios.get(
          `${this.baseURL}/repos/${owner}/${repo}/contents/${path}?ref=${ref}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json'
            }
          }
        );

      return Buffer.from(
        response.data.content,
        'base64'
      ).toString('utf8');

    }
    catch (error) {

      logger.warn("Skipping file", path);

      return null;
    }
  }


  // =====================================================
  // NEW: Get ALL PR code (CRITICAL FUNCTION)
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

      logger.info("PR code fetched", {
        files: results.length
      });

      return results;

    }
    catch (error) {

      logger.error("Failed to fetch PR code", error);

      throw error;
    }
  }


  // =====================================================
  // Create PR comment
  // =====================================================

  async createPRComment(owner, repo, pullNumber, body, installationId) {

    const token =
      await this.getInstallationToken(installationId);

    const response =
      await axios.post(
        `${this.baseURL}/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
        { body },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json'
          }
        }
      );

    return response.data;
  }

}

module.exports = new GitHubService();