const crypto = require('crypto');
const ScannerService = require('../services/scannerService');

class WebhookController {

  // =====================================================
  // SIGNATURE VERIFICATION
  // =====================================================

  verifySignature(rawBody, signature, secret) {

    try {

      if (!signature) {
        console.error("❌ Missing GitHub signature header");
        return false;
      }

      if (!secret) {
        console.error("❌ Missing GITHUB_WEBHOOK_SECRET env variable");
        return false;
      }

      const hmac = crypto.createHmac('sha256', secret);

      const digest =
        'sha256=' +
        hmac.update(rawBody).digest('hex');

      const sigBuffer = Buffer.from(signature);
      const digestBuffer = Buffer.from(digest);

      if (sigBuffer.length !== digestBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(sigBuffer, digestBuffer);

    } catch (error) {

      console.error("❌ Signature verification error:", error);

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

      const signature =
        req.headers['x-hub-signature-256'];

      const event =
        req.headers['x-github-event'];

      console.log("📌 Event:", event);

      const secret =
        process.env.GITHUB_WEBHOOK_SECRET;

      const rawBody =
        req.body;

      // Verify signature
      const valid =
        this.verifySignature(rawBody, signature, secret);

      if (!valid) {

        console.error("❌ Invalid webhook signature");

        return res.status(401).send("Unauthorized");
      }

      console.log("✅ Signature verified");

      const payload =
        JSON.parse(rawBody.toString());

      console.log("📦 Repository:", payload.repository?.full_name);
      console.log("⚡ Action:", payload.action);


      // Handle Pull Request events
      if (event === "pull_request") {

        await this.handlePullRequest(payload);

      }

      console.log("✅ Webhook processing complete");

      res.status(200).send("OK");

    }
    catch (error) {

      console.error("❌ Webhook fatal error:", error);

      res.status(500).send("Internal Server Error");
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


      console.log("\n🔍 Pull Request Event Detected");

      console.log("Action:", action);
      console.log("Repo:", repository.full_name);
      console.log("PR Number:", pull_request.number);
      console.log("Branch:", pull_request.head.ref);


      // Only scan when opened or updated
      if (!["opened", "synchronize"].includes(action)) {

        console.log("⏭️ Skipping action:", action);

        return;
      }


      console.log("🧠 Starting scan...");


      await ScannerService.scanCode({

        code:
          `Repository: ${repository.full_name}
           PR: ${pull_request.number}
           Branch: ${pull_request.head.ref}`,

        filename: "pull_request",

        language: "text",

        repo: repository.full_name,

        prNumber: pull_request.number

      });


      console.log("✅ Scan completed successfully");


    }
    catch (error) {

      console.error("❌ Pull Request handling error:", error);
    }
  }

}

module.exports = new WebhookController();