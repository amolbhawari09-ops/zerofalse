const crypto = require('crypto');
const ScannerService = require('../services/scannerService');

class WebhookController {

  // =====================================================
  // SAFE SIGNATURE VERIFICATION
  // =====================================================

  verifySignature(req) {

    try {

      const signature =
        req.headers['x-hub-signature-256'];

      const secret =
        process.env.GITHUB_WEBHOOK_SECRET;

      if (!signature) {

        console.error("❌ Missing signature header");
        return false;

      }

      if (!secret) {

        console.error("❌ Missing webhook secret");
        return false;

      }

      // CRITICAL: ensure raw Buffer
      const rawBody =
        Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(req.body);

      const expectedSignature =
        'sha256=' +
        crypto
          .createHmac('sha256', secret)
          .update(rawBody)
          .digest('hex');

      const sigBuffer =
        Buffer.from(signature);

      const expectedBuffer =
        Buffer.from(expectedSignature);

      if (sigBuffer.length !== expectedBuffer.length) {

        console.error("❌ Signature length mismatch");
        return false;

      }

      const valid =
        crypto.timingSafeEqual(
          sigBuffer,
          expectedBuffer
        );

      if (!valid) {

        console.error("❌ Invalid signature");
        return false;

      }

      console.log("✅ Signature verified");

      return true;

    }
    catch (error) {

      console.error(
        "❌ Signature verification error:",
        error
      );

      return false;

    }

  }


  // =====================================================
  // MAIN WEBHOOK HANDLER
  // =====================================================

  async handleGitHubWebhook(req, res) {

    console.log("\n==============================");
    console.log("🚀 GitHub Webhook Received");
    console.log("==============================");

    try {

      const event =
        req.headers['x-github-event'];

      console.log("📌 Event:", event);

      // VERIFY SIGNATURE
      if (!this.verifySignature(req)) {

        return res
          .status(401)
          .send("Invalid signature");

      }

      // Parse payload safely
      const payload =
        Buffer.isBuffer(req.body)
          ? JSON.parse(req.body.toString())
          : req.body;

      console.log(
        "📦 Repository:",
        payload.repository?.full_name
      );

      console.log(
        "⚡ Action:",
        payload.action
      );


      // HANDLE PR EVENT
      if (event === "pull_request") {

        await this.handlePullRequest(payload);

      }

      console.log("✅ Webhook processed");

      res.status(200).send("OK");

    }
    catch (error) {

      console.error(
        "❌ Webhook fatal error:",
        error
      );

      res.status(500)
        .send("Internal Server Error");

    }

  }


  // =====================================================
  // HANDLE PULL REQUEST
  // =====================================================

  async handlePullRequest(payload) {

    try {

      const {
        action,
        pull_request,
        repository
      } = payload;

      console.log("\n🔍 Pull Request Event");

      console.log("Action:", action);
      console.log("Repo:", repository.full_name);
      console.log("PR:", pull_request.number);

      if (!["opened", "synchronize"].includes(action)) {

        console.log("⏭️ Skipping:", action);
        return;

      }

      console.log("🧠 Starting scan...");

      await ScannerService.scanCode(

        `Repository: ${repository.full_name}
PR: ${pull_request.number}
Branch: ${pull_request.head.ref}`,

        "pull_request",
        repository.full_name,
        pull_request.number,
        "text"

      );

      console.log("✅ Scan completed");

    }
    catch (error) {

      console.error(
        "❌ PR handling error:",
        error
      );

    }

  }

}

module.exports =
  new WebhookController();