const express = require('express');
const router = express.Router();

const WebhookController =
  require('../controllers/webhookController');

/**
 * GitHub webhook endpoint
 *
 * CRITICAL FIX:
 * Use express.raw ONLY for this route
 * so signature verification works
 */
router.post(
  '/github',

  express.raw({
    type: 'application/json',
    limit: '10mb'
  }),

  async (req, res) => {

    try {

      await WebhookController
        .handleGitHubWebhook(req, res);

    } catch (error) {

      console.error('Webhook route error:', error);

      res.status(500).json({
        error: 'Webhook failed'
      });

    }

  }
);

module.exports = router;