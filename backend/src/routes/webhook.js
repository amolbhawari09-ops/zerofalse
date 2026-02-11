const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/webhookController');

router.post('/github', async (req, res) => {
  console.log("📩 GitHub hit - Entering Handler");
  // No .bind() needed anymore because the Class is gone
  await WebhookController.handleGitHubWebhook(req, res);
});

module.exports = router;
