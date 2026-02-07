const express = require('express');
const router = express.Router();

const WebhookController = require('../controllers/webhookController');

router.post('/github', WebhookController.handleGitHubWebhook.bind(WebhookController));

module.exports = router;