const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/webhookController');

router.post('/github', async (req, res) => {
  try {
    console.log("📩 GitHub webhook received");

    // We use .handleGitHubWebhook(req, res) directly on the instance
    // since it was exported as 'new WebhookController()'
    await WebhookController.handleGitHubWebhook(req, res);

  } catch (error) {
    console.error("❌ Webhook route fatal error:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: "Internal Error" });
    }
  }
});

module.exports = router;
