const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/webhookController');

router.post('/github', async (req, res) => {
  try {
    console.log("📩 GitHub webhook received");

    // FIX: We must bind the context so the controller can find "this.verifySignature"
    const handler = WebhookController.handleGitHubWebhook.bind(WebhookController);
    
    await handler(req, res);

  } catch (error) {
    console.error("❌ Webhook route fatal error:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
});

module.exports = router;
