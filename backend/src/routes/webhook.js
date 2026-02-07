const express = require('express');
const router = express.Router();

const WebhookController = require('../controllers/webhookController');

// CHANGE IS HERE: '/' instead of '/github'
router.post('/', WebhookController.handleGitHubWebhook.bind(WebhookController));

module.exports = router;