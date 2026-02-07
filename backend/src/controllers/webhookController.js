const crypto = require('crypto');
const logger = require('../utils/logger');
const ScannerService = require('../services/scannerService');

class WebhookController {

  verifySignature(rawBody, signature, secret) {

    if (!signature || !secret) return false;

    const hmac = crypto.createHmac('sha256', secret);

    const digest =
      'sha256=' +
      hmac.update(rawBody).digest('hex');

    try {

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(digest)
      );

    } catch {

      return false;

    }

  }

  async handleGitHubWebhook(req, res) {

    try {

      const signature =
        req.headers['x-hub-signature-256'];

      const secret =
        process.env.GITHUB_WEBHOOK_SECRET;

      const rawBody = req.body;

      // Verify webhook is from GitHub
      const valid =
        this.verifySignature(rawBody, signature, secret);

      if (!valid) {

        logger.warn('Invalid GitHub webhook signature');

        return res.status(401).send('Unauthorized');

      }

      const payload =
        JSON.parse(rawBody.toString());

      const event =
        req.headers['x-github-event'];

      logger.info('GitHub webhook received', {
        event,
        action: payload.action
      });

      if (event === 'pull_request') {

        await this.handlePullRequest(payload);

      }

      res.status(200).send('OK');

    } catch (error) {

      logger.error('Webhook error', {
        error: error.message
      });

      res.status(500).send('Error');

    }

  }

  async handlePullRequest(payload) {

    const { action, pull_request, repository } = payload;

    if (!['opened', 'synchronize'].includes(action)) {

      return;

    }

    logger.info('Scanning PR', {

      repo: repository.full_name,

      prNumber: pull_request.number,

      branch: pull_request.head.ref

    });

    // Call scanner service
    await ScannerService.scanCode({

      code: `
        PR: ${repository.full_name}
        Branch: ${pull_request.head.ref}
      `,

      filename: 'pull_request',

      language: 'text',

      repo: repository.full_name,

      prNumber: pull_request.number

    });

    logger.info('PR scan completed');

  }

}

module.exports = new WebhookController();