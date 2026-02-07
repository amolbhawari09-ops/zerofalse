const express = require('express');
const router = express.Router();

const WebhookController = require('../controllers/webhookController');

// GitHub webhook endpoint
router.post('/github', (req, res) => {
  WebhookController.handleGitHubWebhook(req, res);
});

module.exports = router;