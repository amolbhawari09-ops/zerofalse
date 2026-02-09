const crypto = require('crypto');
const GitHubService = require('../services/githubService');
const ScannerService = require('../services/scannerService');
const logger = require('../utils/logger');

class WebhookController {

  // =====================================================
  // VERIFY SIGNATURE (FIXED + SAFE)
  // =====================================================

  verifySignature(req) {

    try {

      const signature = req.headers['x-hub-signature-256'];
      const secret = process.env.GITHUB_WEBHOOK_SECRET;

      if (!signature) {
        logger.warn("Missing signature header");
        return false;
      }

      if (!secret) {
        logger.warn("Missing webhook secret in env");
        return false;
      }

      // MUST use raw buffer exactly as received
      const rawBody = req.body;

      if (!Buffer.isBuffer(rawBody)) {
        logger.error("Body is not raw buffer");
        return false;
      }

      const expectedSignature =
        'sha256=' +
        crypto
          .createHmac('sha256', secret)
          .update(rawBody)
          .digest('hex');

      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);

      if (sigBuffer.length !== expectedBuffer.length)
        return false;

      return crypto.timingSafeEqual(
        sigBuffer,
        expectedBuffer
      );

    }
    catch (err) {

      logger.error("Signature verification error:", err);

      return false;

    }

  }


  // =====================================================
  // MAIN ENTRY
  // =====================================================

  async handleGitHubWebhook(req, res) {

    try {

      logger.info("📩 GitHub webhook received");

      // VERIFY SIGNATURE
      if (!this.verifySignature(req)) {

        logger.warn("❌ Invalid webhook signature");

        return res.status(401).send("Unauthorized");

      }

      // Parse payload safely
      const payload = JSON.parse(req.body.toString());

      const event = req.headers['x-github-event'];

      logger.info(`GitHub event: ${event}`);
      logger.info(`Action: ${payload.action}`);

      if (event === "pull_request") {

        await this.handlePullRequest(payload);

      }

      return res.status(200).send("OK");

    }
    catch (error) {

      logger.error("Webhook fatal error:", error);

      return res.status(500).send("Webhook error");

    }

  }


  // =====================================================
  // HANDLE PULL REQUEST
  // =====================================================

  async handlePullRequest(payload) {

    try {

      const action = payload.action;

      // Only scan when PR opened or updated
      if (!["opened", "synchronize"].includes(action)) {

        logger.info(`Skipping action: ${action}`);
        return;

      }

      const installationId = payload.installation?.id;

      if (!installationId)
        throw new Error("Missing installation ID");

      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      const repoFullName = payload.repository.full_name;

      const prNumber = payload.pull_request.number;
      const ref = payload.pull_request.head.sha;

      logger.info(`🔍 Scanning PR ${repoFullName} #${prNumber}`);

      // =====================================================
      // STEP 1: INSTALLATION TOKEN
      // =====================================================

      const token =
        await GitHubService.getInstallationToken(
          installationId
        );

      if (!token)
        throw new Error("Failed to get installation token");


      // =====================================================
      // STEP 2: FILE LIST
      // =====================================================

      const files =
        await GitHubService.getPullRequestFiles(
          owner,
          repo,
          prNumber,
          token
        );

      if (!files || files.length === 0) {

        logger.info("No files found in PR");

        return;

      }

      logger.info(`Found ${files.length} files`);


      // =====================================================
      // STEP 3: SCAN FILES
      // =====================================================

      const results = [];

      for (const file of files) {

        try {

          if (file.status === "removed")
            continue;

          logger.info(`Scanning file: ${file.filename}`);

          const content =
            await GitHubService.getFileContent(
              owner,
              repo,
              file.filename,
              ref,
              token
            );

          if (!content)
            continue;

          const scanResult =
            await ScannerService.scanCode(
              content,
              file.filename,
              repoFullName,
              prNumber,
              "javascript"
            );

          results.push({
            filename: file.filename,
            findings: scanResult.findings || []
          });

        }
        catch (fileError) {

          logger.error(
            `File scan error: ${file.filename}`,
            fileError
          );

        }

      }


      // =====================================================
      // STEP 4: COMMENT
      // =====================================================

      const comment =
        this.formatComment(results);

      await GitHubService.createPRComment(
        owner,
        repo,
        prNumber,
        comment,
        token
      );

      logger.info("✅ PR comment posted");

    }
    catch (error) {

      logger.error("PR processing error:", error);

    }

  }


  // =====================================================
  // FORMAT COMMENT
  // =====================================================

  formatComment(results) {

    let comment =
`## 🛡️ ZeroFalse Security Report

Automated scan results:

`;

    let totalFindings = 0;

    for (const result of results) {

      if (!result.findings || result.findings.length === 0)
        continue;

      comment += `### ${result.filename}\n`;

      for (const finding of result.findings) {

        totalFindings++;

        comment +=
`- **${finding.severity || "UNKNOWN"}**
  - Type: ${finding.type || "Unknown"}
  - Fix: ${finding.fix || "No fix provided"}

`;

      }

    }

    if (totalFindings === 0) {

      comment +=
`✅ No vulnerabilities found.
Your code is secure.
`;

    }
    else {

      comment +=
`⚠️ Total issues found: ${totalFindings}
`;

    }

    comment +=
`
---
ZeroFalse Security Bot
`;

    return comment;

  }

}

module.exports =
  new WebhookController();