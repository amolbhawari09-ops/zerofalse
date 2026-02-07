const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/webhookController');

/*
IMPORTANT:
GitHub requires RAW body for signature verification
*/

router.post(
  '/github',
  express.raw({ type: 'application/json' }),
  WebhookController.handleGitHubWebhook.bind(WebhookController)
);

module.exports = router;