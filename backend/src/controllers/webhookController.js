const crypto = require('crypto');
const GitHubService = require('../services/githubService');
const ScannerService = require('../services/scannerService');
const logger = require('../utils/logger');

class WebhookController {

  // =====================================================
  // VERIFY SIGNATURE (SAFE + REQUIRED)
  // =====================================================

  verifySignature(req) {

    try {

      const signature = req.headers['x-hub-signature-256'];
      const secret = process.env.GITHUB_WEBHOOK_SECRET;

      if (!signature) {
        logger.warn("Missing GitHub signature header");
        return false;
      }

      if (!secret) {
        logger.warn("Missing GITHUB_WEBHOOK_SECRET env");
        return false;
      }

      if (!Buffer.isBuffer(req.body)) {
        logger.error("Webhook body is not raw buffer");
        return false;
      }

      const expectedSignature =
        'sha256=' +
        crypto
          .createHmac('sha256', secret)
          .update(req.body)
          .digest('hex');

      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);

      if (sigBuffer.length !== expectedBuffer.length)
        return false;

      return crypto.timingSafeEqual(sigBuffer, expectedBuffer);

    }
    catch (err) {

      logger.error("Signature verification crash", err);
      return false;

    }

  }


  // =====================================================
  // MAIN WEBHOOK ENTRY
  // =====================================================

  async handleGitHubWebhook(req, res) {

    logger.info("📩 GitHub webhook received");

    try {

      // Verify signature
      if (!this.verifySignature(req)) {

        logger.warn("Invalid webhook signature");

        // Return 200 to prevent GitHub retry loop
        return res.status(200).send("Ignored");

      }

      let payload;

      try {

        payload = JSON.parse(req.body.toString());

      }
      catch (parseError) {

        logger.error("Payload parse failed", parseError);

        return res.status(200).send("Invalid payload");

      }

      const event = req.headers['x-github-event'];

      logger.info(`Event: ${event}`);
      logger.info(`Action: ${payload.action}`);

      if (event === "pull_request") {

        await this.safeHandlePullRequest(payload);

      }

      return res.status(200).send("OK");

    }
    catch (fatalError) {

      logger.error("Webhook fatal crash", fatalError);

      return res.status(200).send("Recovered");

    }

  }


  // =====================================================
  // SAFE WRAPPER (prevents crashes)
  // =====================================================

  async safeHandlePullRequest(payload) {

    try {

      await this.handlePullRequest(payload);

    }
    catch (err) {

      logger.error("PR handler crash");
      logger.error(err.message);
      logger.error(err.stack);

    }

  }


  // =====================================================
  // MAIN PR HANDLER
  // =====================================================

  async handlePullRequest(payload) {

    const action = payload.action;

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
    // GET INSTALLATION TOKEN
    // =====================================================

    const token =
      await GitHubService.getInstallationToken(
        installationId
      );

    if (!token)
      throw new Error("Installation token failed");


    // =====================================================
    // GET FILE LIST
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
    // SCAN FILES
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

        const scan =
          await ScannerService.scanCode(
            content,
            file.filename,
            repoFullName,
            prNumber,
            "javascript"
          );

        results.push({

          filename: file.filename,
          findings: scan?.findings || []

        });

      }
      catch (fileErr) {

        logger.error(`File scan failed: ${file.filename}`);
        logger.error(fileErr.message);

      }

    }


    // =====================================================
    // POST COMMENT
    // =====================================================

    try {

      const comment =
        this.formatComment(results);

      await GitHubService.createPRComment(
        owner,
        repo,
        prNumber,
        comment,
        installationId
      );

      logger.info("✅ PR comment posted");

    }
    catch (commentErr) {

      logger.error("Comment failed");
      logger.error(commentErr.message);

    }

  }


  // =====================================================
  // COMMENT FORMATTER (FIXED VERSION)
  // =====================================================

  formatComment(results) {

    let comment =
`## 🛡️ ZeroFalse Security Report

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

module.exports = new WebhookController();