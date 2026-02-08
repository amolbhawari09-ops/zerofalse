const crypto = require('crypto');
const GitHubService = require('../services/githubService');
const ScannerService = require('../services/scannerService');

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
    catch {

      return false;

    }

  }


  // =====================================================
  // MAIN WEBHOOK
  // =====================================================

  async handleGitHubWebhook(req, res) {

    try {

      if (!this.verifySignature(req)) {

        console.error("Invalid webhook signature");

        return res.status(401).send("Unauthorized");

      }

      const payload =
        Buffer.isBuffer(req.body)
          ? JSON.parse(req.body.toString())
          : req.body;

      const event =
        req.headers['x-github-event'];

      if (event === "pull_request") {

        await this.handlePullRequest(payload);

      }

      res.status(200).send("OK");

    }
    catch (error) {

      console.error("Webhook error:", error);

      res.status(500).send("Error");

    }

  }


  // =====================================================
  // HANDLE PR
  // =====================================================

  async handlePullRequest(payload) {

    const action =
      payload.action;

    if (
      action !== "opened" &&
      action !== "synchronize"
    )
      return;


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

    const branch =
      payload.pull_request.head.ref;


    console.log("Scanning PR:", repoFullName);


    // =====================================================
    // STEP 1 — GET REAL FILES
    // =====================================================

    const files =
      await GitHubService.getPullRequestCode(
        owner,
        repo,
        prNumber,
        branch,
        installationId
      );


    if (!files.length) {

      console.log("No files to scan");

      return;

    }


    // =====================================================
    // STEP 2 — SCAN FILES
    // =====================================================

    const results = [];

    for (const file of files) {

      const scan =
        await ScannerService.scanCode(
          file.content,
          file.filename,
          repoFullName,
          prNumber
        );

      results.push(scan);

    }


    // =====================================================
    // STEP 3 — CREATE COMMENT
    // =====================================================

    const comment =
      this.formatComment(results);


    await GitHubService.createPRComment(
      owner,
      repo,
      prNumber,
      comment,
      installationId
    );


    console.log("PR scan completed");

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
          `**${finding.severity.toUpperCase()}** — ${finding.type}\n`;

        comment +=
          `File: ${scan.filename}\n`;

        comment +=
          `Fix: ${finding.fix}\n\n`;

      }

    }

    if (total === 0)
      comment += "✅ No vulnerabilities found.";

    return comment;

  }

}

module.exports =
  new WebhookController();