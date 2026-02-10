const crypto = require('crypto');
const GitHubService = require('../services/githubService');
const ScannerService = require('../services/scannerService');
const logger = require('../utils/logger');

const CODE_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx',
  '.py', '.pyw',
  '.java',
  '.go',
  '.rb',
  '.php',
  '.c', '.cpp', '.h',
  '.cs',
  '.swift',
  '.kt', '.kts',
  '.rs',
  '.scala', '.sc'
];

function shouldScanFile(filename) {
  if (!filename) return false;
  return CODE_EXTENSIONS.some(ext =>
    filename.toLowerCase().endsWith(ext)
  );
}

class WebhookController {

  // ========================================
  // SIGNATURE VERIFY WITH DEBUG
  // ========================================

  verifySignature(req) {

    logger.info("🔐 Starting signature verification");

    try {

      const signature =
        req.headers['x-hub-signature-256'];

      const secret =
        process.env.GITHUB_WEBHOOK_SECRET;

      logger.info("Signature exists:", !!signature);
      logger.info("Secret exists:", !!secret);

      if (!signature) {
        logger.warn("❌ Missing GitHub signature header");
        return false;
      }

      if (!secret) {
        logger.warn("❌ Missing webhook secret env");
        return false;
      }

      if (!Buffer.isBuffer(req.body)) {
        logger.error("❌ Body is NOT raw buffer");
        logger.error("Body type:", typeof req.body);
        return false;
      }

      logger.info("Body is valid raw buffer");

      const expectedSignature =
        'sha256=' +
        crypto
          .createHmac('sha256', secret)
          .update(req.body)
          .digest('hex');

      const valid =
        crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(expectedSignature)
        );

      logger.info("Signature valid:", valid);

      return valid;

    }
    catch (error) {

      logger.error("💥 Signature verification crash");
      logger.error(error.message);
      logger.error(error.stack);

      return false;

    }

  }


  // ========================================
  // MAIN WEBHOOK ENTRY
  // ========================================

  async handleGitHubWebhook(req, res) {

    logger.info("=================================");
    logger.info("📩 WEBHOOK RECEIVED");
    logger.info("Time:", new Date().toISOString());
    logger.info("=================================");

    try {

      logger.info("Step 1: Verifying signature...");

      if (!this.verifySignature(req)) {

        logger.warn("❌ Signature invalid");
        return res.status(200).send("Ignored");

      }

      logger.info("✅ Signature verified");


      logger.info("Step 2: Parsing payload...");

      let payload;

      try {

        payload =
          JSON.parse(req.body.toString());

        logger.info("✅ Payload parsed");

      }
      catch (parseError) {

        logger.error("❌ Payload parse failed");
        logger.error(parseError.message);

        return res.status(200).send("Invalid payload");

      }


      const event =
        req.headers['x-github-event'];

      logger.info("Event type:", event);
      logger.info("Action:", payload?.action);


      // ========================================
      // INSTALL EVENT DEBUG
      // ========================================

      if (event === "installation") {

        logger.info("🔥 INSTALL EVENT DETECTED");

        const installationId =
          payload.installation?.id;

        logger.info("Installation ID:", installationId);

      }


      // ========================================
      // PR EVENT DEBUG
      // ========================================

      if (event === "pull_request") {

        logger.info("🔥 PULL REQUEST EVENT DETECTED");

        await this.handlePullRequest(payload);

      }


      logger.info("✅ Webhook completed");

      return res.status(200).send("OK");

    }
    catch (fatalError) {

      logger.error("💀 WEBHOOK FATAL ERROR");
      logger.error("Message:", fatalError.message);
      logger.error("Stack:", fatalError.stack);

      return res.status(200).send("Error");

    }

  }


  // ========================================
  // PR HANDLER WITH FULL DEBUG
  // ========================================

  async handlePullRequest(payload) {

    logger.info("=================================");
    logger.info("🚀 PR HANDLER STARTED");
    logger.info("=================================");

    try {

      const action = payload.action;

      logger.info("PR Action:", action);

      if (!["opened", "synchronize"].includes(action)) {

        logger.info("Skipping unsupported action");
        return;

      }

      const installationId =
        payload.installation?.id;

      logger.info("Installation ID:", installationId);

      if (!installationId)
        throw new Error("Installation ID missing");


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


      logger.info("Repository:", repoFullName);
      logger.info("PR Number:", prNumber);
      logger.info("Commit SHA:", ref);


      // ========================================
      // TOKEN DEBUG
      // ========================================

      logger.info("Step 3: Requesting installation token");

      const token =
        await GitHubService.getInstallationToken(
          installationId
        );

      logger.info("✅ Token received");


      // ========================================
      // FILE FETCH DEBUG
      // ========================================

      logger.info("Step 4: Fetching PR files");

      const files =
        await GitHubService.getPullRequestFiles(
          owner,
          repo,
          prNumber,
          token
        );

      logger.info("Files received:", files.length);


      const codeFiles =
        files.filter(f =>
          shouldScanFile(f.filename)
        );

      logger.info("Code files count:", codeFiles.length);


      if (codeFiles.length === 0) {

        logger.info("No code files to scan");
        return;

      }


      // ========================================
      // SCAN DEBUG
      // ========================================

      let totalFindings = 0;
      const results = [];

      for (const file of codeFiles) {

        logger.info("Scanning file:", file.filename);

        const content =
          await GitHubService.getFileContent(
            owner,
            repo,
            file.filename,
            ref,
            token
          );

        if (!content) {

          logger.warn("No content:", file.filename);
          continue;

        }

        const scan =
          await ScannerService.scanCode(
            content,
            file.filename,
            repoFullName,
            prNumber
          );

        const findings =
          scan?.findings || [];

        totalFindings += findings.length;

        results.push({
          filename: file.filename,
          findings
        });

        logger.info(
          "Findings:",
          findings.length
        );

      }


      logger.info("Total findings:", totalFindings);


      // ========================================
      // COMMENT DEBUG
      // ========================================

      logger.info("Step 5: Posting PR comment");

      const comment =
        this.formatComment(
          results,
          totalFindings
        );

      await GitHubService.createPRComment(
        owner,
        repo,
        prNumber,
        comment,
        token
      );

      logger.info("✅ Comment posted successfully");

    }
    catch (error) {

      logger.error("💥 PR HANDLER CRASH");
      logger.error("Message:", error.message);
      logger.error("Stack:", error.stack);

      throw error;

    }

  }


  formatComment(results, totalFindings) {

    logger.info("Formatting comment");

    if (totalFindings === 0) {

      return `## 🛡️ ZeroFalse Security Scan

No vulnerabilities found.

Powered by ZeroFalse`;

    }

    return `## 🛡️ ZeroFalse Security Scan

Found ${totalFindings} issues.

Powered by ZeroFalse`;

  }

}

module.exports =
  new WebhookController();