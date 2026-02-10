const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/webhookController');

router.post('/github', async (req, res) => {
  try {
    console.log("📩 GitHub webhook received");

    // FIX: Explicitly bind the 'this' context so the controller can 
    // find 'this.verifySignature' and other internal methods.
    const handler = WebhookController.handleGitHubWebhook.bind(WebhookController);
    
    await handler(req, res);

  } catch (error) {
    console.error("❌ Webhook route fatal error:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: "Internal Error" });
    }
  }
});

module.exports = router;
