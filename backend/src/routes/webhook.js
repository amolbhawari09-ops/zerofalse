const express = require('express');
const router = express.Router();

const WebhookController = require('../controllers/webhookController');

// ======================================================
// GITHUB WEBHOOK ROUTE
// ======================================================

router.post('/github', async (req, res) => {
  try {
    // Standard console log for Railway visibility
    console.log("📩 GitHub webhook received");

    // CRITICAL: We use .call() or .bind() or just call the instance 
    // to ensure 'this' inside the controller refers to the WebhookController.
    await WebhookController.handleGitHubWebhook(req, res);

  } catch (error) {
    console.error("❌ Webhook route fatal error:", error.message);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Webhook processing failed"
      });
    }
  }
});


// ======================================================
// TEST ROUTE
// ======================================================

router.get('/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: "Webhook route working",
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
