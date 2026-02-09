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

      const signature = req.headers['x-hub-signature-256'];
      const secret = process.env.GITHUB_WEBHOOK_SECRET;

      if (!signature) {
        logger.warn("Missing signature header");
        return false;
      }

      if (!secret) {
        logger.warn("Missing webhook secret");
        return false;
      }

      if (!Buffer.isBuffer(req.body)) {
        logger.error("Body is not raw buffer");
        return false;
      }

      const expected =
        'sha256=' +
        crypto
          .createHmac('sha256', secret)
          .update(req.body)
          .digest('hex');

      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);

      if (sigBuf.length !== expBuf.length)
        return false;

      return crypto.timingSafeEqual(sigBuf, expBuf);

    }
    catch (err) {

      logger.error("Signature verification crash:", err);

      return false;

    }

  }


  // =====================================================
  // MAIN ENTRY
  // =====================================================

  async handleGitHubWebhook(req, res) {

    logger.info("📩 GitHub webhook received");

    try {

      // Always verify signature first
      const valid = this.verifySignature(req);

      if (!valid) {

        logger.warn("Invalid webhook signature");

        // IMPORTANT: still return 200 to stop GitHub retries
        return res.status(200).send("Ignored");

      }

      let payload;

      try {

        payload = JSON.parse(req.body.toString());

      }
      catch (parseError) {

        logger.error("Payload parse failed:", parseError);

        return res.status(200).send("Invalid payload");

      }

      const event = req.headers['x-github-event'];

      logger.info("Event:", event);
      logger.info("Action:", payload.action);

      if (event === "pull_request") {

        await this.safeHandlePullRequest(payload);

      }

      return res.status(200).send("OK");

    }
    catch (fatalError) {

      logger.error("Webhook fatal crash:", fatalError);

      // Always return 200 to GitHub
      return res.status(200).send("Recovered");

    }

  }


  // =====================================================
  // SAFE PR HANDLER
  // =====================================================

  async safeHandlePullRequest(payload) {

    try {

      await this.handlePullRequest(payload);

    }
    catch (err) {

      logger.error("PR handler crash:");
      logger.error(err.message);
      logger.error(err.stack);

    }

  }


  // =====================================================
  // HANDLE PULL REQUEST
  // =====================================================

  async handlePullRequest(payload) {

    const action = payload.action;

    if (!["opened", "synchronize"].includes(action)) {

      logger.info("Skipping action:", action);

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

    logger.info(`Scanning PR ${repoFullName} #${prNumber}`);


    // =====================================================
    // INSTALLATION TOKEN
    // =====================================================

    const token =
      await GitHubService.getInstallationToken(
        installationId
      );

    if (!token)
      throw new Error("Installation token failed");


    // =====================================================
    // GET FILES
    // =====================================================

    const files =
      await GitHubService.getPullRequestFiles(
        owner,
        repo,
        prNumber,
        token
      );

    if (!files || files.length === 0) {

      logger.info("No files found");

      return;

    }


    // =====================================================
    // SCAN FILES
    // =====================================================

    const results = [];

    for (const file of files) {

      try {

        if (file.status === "removed")
          continue;

        logger.info("Scanning:", file.filename);

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

        logger.error("File scan failed:", file.filename);
        logger.error(fileErr.message);

      }

    }


    // =====================================================
    // COMMENT
    // =====================================================

    try {

      const comment =
        this.formatComment(results);

      await GitHubService.createPRComment(
        owner,
        repo,
        prNumber,
        comment,
        token
      );

      logger.info("PR comment posted");

    }
    catch (commentErr) {

      logger.error("PR comment failed:");
      logger.error(commentErr.message);

    }

  }


  // =====================================================
  // FORMAT COMMENT
  // =====================================================

  formatComment(results) {

    let comment =
`## 🛡️ ZeroFalse Security Report

`;

    let total = 0;

    for (const result of results) {

      if (!result.findings?.length)
        continue;

      comment += `### ${result.filename}\n`;

      for (const finding of result.findings) {

        total++;

        comment +=
`- ${finding.severity || "UNKNOWN"} : ${finding.type || "Unknown"}
`;

      }

      comment += "\n";

    }

    if (total === 0)
      comment += "✅ No vulnerabilities found.";

    comment += "\n\nZeroFalse Security Bot";

    return comment;

  }

}

module.exports = new WebhookController();