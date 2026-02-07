const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/webhookController');

// Raw body parser for signature verification
router.post('/', 
  express.raw({ type: 'application/json' }),
  WebhookController.handleGitHubWebhook.bind(WebhookController)
);

module.exports = router;
