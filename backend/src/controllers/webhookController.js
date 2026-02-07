const ScannerService = require('../services/scannerService');
const { verifyGitHubSignature } = require('../utils/crypto');
const logger = require('../utils/logger');

class WebhookController {
  async handleGitHubWebhook(req, res) {
    try {
      // Verify signature
      const signature = req.headers['x-hub-signature-256'];
      const payload = req.body; // Raw body
      const secret = process.env.GITHUB_WEBHOOK_SECRET;
      
      if (!verifyGitHubSignature(payload, signature, secret)) {
        logger.warn('Invalid webhook signature');
        return res.status(401).send('Unauthorized');
      }
      
      const event = req.headers['x-github-event'];
      const body = JSON.parse(payload);
      
      logger.info('GitHub webhook received', { event, action: body.action });
      
      // Handle pull request events
      if (event === 'pull_request') {
        await this.handlePullRequest(body);
      }
      
      res.status(200).send('OK');
      
    } catch (error) {
      logger.error('Webhook error:', { error: error.message });
      res.status(500).send('Error');
    }
  }
  
  async handlePullRequest(payload) {
    const { action, pull_request, repository } = payload;
    
    // Only scan on PR open or synchronize
    if (!['opened', 'synchronize'].includes(action)) {
      return;
    }
    
    logger.info('Processing PR', {
      repo: repository.full_name,
      pr: pull_request.number,
      action
    });
    
    // For MVP: Simulate scanning (in production, fetch files from GitHub API)
    // This would require GitHub App installation token
    
    // Placeholder: In production, implement:
    // 1. Get installation token
    // 2. Fetch changed files
    // 3. Scan each file
    // 4. Post PR comment with results
    
    logger.info('PR processing complete (simulated)');
  }
}

module.exports = new WebhookController();
