const express = require('express');
const router = express.Router();

const WebhookController =
  require('../controllers/webhookController');


// ======================================================
// GitHub Webhook Endpoint
// FINAL URL:
// https://zerofalse-production.up.railway.app/api/webhook/github
// ======================================================
//
// IMPORTANT:
// - Uses express.raw for signature verification
// - Must match GitHub webhook URL EXACTLY
// - Must be mounted under /api in app.js
// ======================================================

router.post(
  '/webhook/github',

  // CRITICAL: raw body required for GitHub signature validation
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


// ======================================================
// Health test endpoint (optional but useful)
// ======================================================

router.get(
  '/webhook/test',
  (req, res) => {

    res.status(200).json({
      success: true,
      message: "Webhook route working",
      timestamp: new Date().toISOString()
    });

  }
);


module.exports = router;