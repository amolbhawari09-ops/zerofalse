const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/webhookController');

router.post('/github', async (req, res) => {
  try {
    console.log("📩 GitHub webhook received - Entering Handler");
    
    // Direct call - context issues are solved by the new controller structure
    await WebhookController.handleGitHubWebhook(req, res);

  } catch (error) {
    console.error("❌ WEBHOOK CRITICAL FAILURE:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: "Internal Server Error" });
    }
  }
});

module.exports = router;
