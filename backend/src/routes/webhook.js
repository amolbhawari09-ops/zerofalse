const express = require('express');
const router = express.Router();

const WebhookController =
  require('../controllers/webhookController');

router.post(
  '/github',

  express.raw({
    type: 'application/json',
    limit: '10mb'
  }),

  async (req, res) => {

    try {

      console.log("📩 GitHub webhook received");

      await WebhookController.handleGitHubWebhook(
        req,
        res
      );

    }
    catch (error) {

      console.error(
        "❌ Webhook route fatal error:",
        error
      );

      if (!res.headersSent) {

        res.status(500).json({
          success: false,
          error: "Webhook processing failed"
        });

      }

    }

  }
);


router.get('/test', (req, res) => {

  res.status(200).json({
    success: true,
    message: "Webhook route working",
    timestamp: new Date().toISOString()
  });

});

module.exports = router;