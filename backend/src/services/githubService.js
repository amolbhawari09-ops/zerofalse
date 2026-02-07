const axios = require('axios');
const logger = require('../utils/logger');

class GitHubService {
  constructor() {
    this.baseURL = 'https://api.github.com';
  }
  
  async getInstallationToken(installationId) {
    // Generate JWT for GitHub App
    const jwt = this.generateJWT();
    
    const response = await axios.post(
      `${this.baseURL}/app/installations/${installationId}/access_tokens`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    return response.data.token;
  }
  
  generateJWT() {
    // Implementation for GitHub App JWT
    // Requires private key from GITHUB_PRIVATE_KEY
    const crypto = require('crypto');
    
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now,
      exp: now + 600, // 10 minutes
      iss: process.env.GITHUB_APP_ID
    };
    
    // Sign with private key
    const privateKey = process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n');
    
    // Simplified - use jsonwebtoken in production
    return require('jsonwebtoken').sign(payload, privateKey, { algorithm: 'RS256' });
  }
  
  async getPullRequestFiles(owner, repo, pullNumber, token) {
    const response = await axios.get(
      `${this.baseURL}/repos/${owner}/${repo}/pulls/${pullNumber}/files`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    return response.data;
  }
  
  async getFileContent(owner, repo, path, ref, token) {
    const response = await axios.get(
      `${this.baseURL}/repos/${owner}/${repo}/contents/${path}?ref=${ref}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    // Decode base64 content
    const content = Buffer.from(response.data.content, 'base64').toString('utf8');
    return content;
  }
  
  async createPRComment(owner, repo, pullNumber, body, token) {
    const response = await axios.post(
      `${this.baseURL}/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
      { body },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    return response.data;
  }
}

module.exports = new GitHubService();
