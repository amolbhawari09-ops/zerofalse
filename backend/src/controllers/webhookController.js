const crypto = require('crypto');
const GitHubService = require('../services/githubService');
const ScannerService = require('../services/scannerService');
const logger = require('../utils/logger');

class WebhookController {

  // =====================================================
  // VERIFY SIGNATURE
  // =====================================================

  verifySignature(req) {

    try {

      const signature =
        req.headers['x-hub-signature-256'];

      const secret =
        process.env.GITHUB_WEBHOOK_SECRET;

      if (!signature || !secret)
        return false;

      const rawBody =
        Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(JSON.stringify(req.body));

      const expected =
        'sha256=' +
        crypto
          .createHmac('sha256', secret)
          .update(rawBody)
          .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      );

    }
    catch (err) {

      logger.error("Signature verification failed", err);

      return false;

    }

  }


  // =====================================================
  // MAIN WEBHOOK ENTRY
  // =====================================================

  async handleGitHubWebhook(req, res) {

    try {

      if (!this.verifySignature(req)) {

        logger.warn("Invalid webhook signature");

        return res.status(401).send("Unauthorized");

      }

      const payload =
        Buffer.isBuffer(req.body)
          ? JSON.parse(req.body.toString())
          : req.body;

      const event =
        req.headers['x-github-event'];

      logger.info("GitHub event received:", event);

      if (event === "pull_request") {

        await this.handlePullRequest(payload);

      }

      res.status(200).send("OK");

    }
    catch (error) {

      logger.error("Webhook fatal error", error);

      res.status(500).send("Error");

    }

  }


  // =====================================================
  // HANDLE PULL REQUEST EVENT
  // =====================================================

  async handlePullRequest(payload) {

    const action = payload.action;

    if (!["opened", "synchronize"].includes(action)) {

      logger.info("Skipping PR action:", action);

      return;

    }

    const installationId =
      payload.installation.id;

    const owner =
      payload.repository.owner.login;

    const repo =
      payload.repository.name;

    const repoFullName =
      payload.repository.full_name;

    const prNumber =
      payload.pull_request.number;

    const ref =
      payload.pull_request.head.sha;

    logger.info(`Scanning PR ${repoFullName} #${prNumber}`);


    // =====================================================
    // STEP 1 — GET INSTALLATION TOKEN
    // =====================================================

    const token =
      await GitHubService.getInstallationToken(
        installationId
      );


    // =====================================================
    // STEP 2 — GET FILE LIST
    // =====================================================

    const files =
      await GitHubService.getPullRequestFiles(
        owner,
        repo,
        prNumber,
        token
      );

    if (!files.length) {

      logger.info("No files to scan");

      return;

    }


    // =====================================================
    // STEP 3 — DOWNLOAD FILE CONTENT + SCAN
    // =====================================================

    const results = [];

    for (const file of files) {

      if (file.status === "removed")
        continue;

      const content =
        await GitHubService.getFileContent(
          owner,
          repo,
          file.filename,
          ref,
          token
        );

      const scan =
        await ScannerService.scanCode(
          content,
          file.filename,
          repoFullName,
          prNumber,
          "javascript"
        );

      results.push(scan);

    }


    // =====================================================
    // STEP 4 — COMMENT ON PR
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

    logger.info("PR scan completed");

  }


  // =====================================================
  // FORMAT COMMENT
  // =====================================================

  formatComment(results) {

    let comment =
      "## 🛡️ ZeroFalse Security Report\n\n";

    let total = 0;

    for (const scan of results) {

      if (!scan.findings)
        continue;

      for (const finding of scan.findings) {

        total++;

        comment +=
          `**${finding.severity?.toUpperCase() || "UNKNOWN"}** — ${finding.type}\n`;

        comment +=
          `File: ${scan.filename}\n`;

        if (finding.fix)
          comment += `Fix: ${finding.fix}\n`;

        comment += "\n";

      }

    }

    if (total === 0)
      comment += "✅ No vulnerabilities found.";

    return comment;

  }

}

module.exports =
  new WebhookController();