const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/webhookController');

router.post('/github', async (req, res) => {
  try {
    console.log("📩 GitHub webhook received - Entering Handler");

    // SENIOR FIX: Using .bind ensures 'this' inside the controller 
    // correctly points to the WebhookController instance.
    const handler = WebhookController.handleGitHubWebhook.bind(WebhookController);
    
    await handler(req, res);

  } catch (error) {
    // This will now catch the error instead of crashing the server
    console.error("❌ WEBHOOK CRITICAL FAILURE:", error.message);
    console.error(error.stack);
    
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: "Internal Server Error" });
    }
  }
});

module.exports = router;
