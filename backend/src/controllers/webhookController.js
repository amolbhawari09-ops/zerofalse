const crypto = require('crypto');
const GitHubService = require('../services/githubService');
const ScannerService = require('../services/scannerService');
const logger = require('../utils/logger');


// ======================================================
// FILE TYPES TO SCAN
// ======================================================

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


// ======================================================
// CONTROLLER CLASS
// ======================================================

class WebhookController {


  // ======================================================
  // SIGNATURE VERIFICATION (CRITICAL FIX)
  // ======================================================

  verifySignature(req) {

    logger.info("=================================");
    logger.info("🔐 SIGNATURE VERIFICATION START");
    logger.info("=================================");

    try {

      const signature =
        req.headers['x-hub-signature-256'];

      const secret =
        process.env.GITHUB_WEBHOOK_SECRET;

      logger.info("Signature exists:", !!signature);
      logger.info("Secret exists:", !!secret);
      logger.info("RawBody exists:", !!req.rawBody);

      if (!signature) {

        logger.warn("❌ Missing GitHub signature header");

        return false;

      }

      if (!secret) {

        logger.warn("❌ Missing webhook secret");

        return false;

      }

      if (!req.rawBody) {

        logger.error("❌ Missing rawBody");

        return false;

      }

      const expectedSignature =
        'sha256=' +
        crypto
          .createHmac('sha256', secret)
          .update(req.rawBody)
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


  // ======================================================
  // MAIN ENTRY
  // ======================================================

  async handleGitHubWebhook(req, res) {

    logger.info("=================================");
    logger.info("📩 WEBHOOK RECEIVED");
    logger.info("Time:", new Date().toISOString());
    logger.info("=================================");

    try {

      // ========================================
      // STEP 1: VERIFY SIGNATURE
      // ========================================

      logger.info("Step 1: Verifying signature...");

      const valid =
        this.verifySignature(req);

      if (!valid) {

        logger.warn("❌ Invalid signature");

        return res.status(200).send("Ignored");

      }

      logger.info("✅ Signature verified");


      // ========================================
      // STEP 2: PARSE PAYLOAD
      // ========================================

      logger.info("Step 2: Parsing payload...");

      let payload;

      try {

        payload =
          JSON.parse(req.rawBody.toString());

        logger.info("Payload parsed successfully");

      }
      catch (parseError) {

        logger.error("Payload parse failed");

        logger.error(parseError.message);

        return res.status(200).send("Invalid payload");

      }


      const event =
        req.headers['x-github-event'];

      logger.info("Event:", event);
      logger.info("Action:", payload?.action);


      // ========================================
      // INSTALL EVENT
      // ========================================

      if (event === "installation") {

        logger.info("INSTALL EVENT DETECTED");

        const installationId =
          payload.installation?.id;

        logger.info("Installation ID:", installationId);

      }


      // ========================================
      // PR EVENT
      // ========================================

      if (event === "pull_request") {

        logger.info("PULL REQUEST EVENT DETECTED");

        await this.handlePullRequest(payload);

      }


      logger.info("Webhook processing complete");

      return res.status(200).send("OK");

    }
    catch (fatalError) {

      logger.error("FATAL WEBHOOK ERROR");

      logger.error(fatalError.message);
      logger.error(fatalError.stack);

      return res.status(200).send("Error");

    }

  }


  // ======================================================
  // HANDLE PR
  // ======================================================

  async handlePullRequest(payload) {

    logger.info("=================================");
    logger.info("🚀 PR HANDLER START");
    logger.info("=================================");

    try {

      const action =
        payload.action;

      logger.info("PR Action:", action);

      if (!["opened", "synchronize"].includes(action)) {

        logger.info("Skipping unsupported PR action");

        return;

      }


      const installationId =
        payload.installation?.id;

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
      // GET INSTALL TOKEN
      // ========================================

      logger.info("Requesting installation token...");

      const token =
        await GitHubService.getInstallationToken(
          installationId
        );

      logger.info("Token acquired");


      // ========================================
      // FETCH FILES
      // ========================================

      logger.info("Fetching PR files...");

      const files =
        await GitHubService.getPullRequestFiles(
          owner,
          repo,
          prNumber,
          token
        );

      logger.info("Total files:", files.length);


      const codeFiles =
        files.filter(file =>
          shouldScanFile(file.filename)
        );

      logger.info("Code files:", codeFiles.length);


      if (codeFiles.length === 0) {

        logger.info("No scannable files");

        return;

      }


      // ========================================
      // SCAN FILES
      // ========================================

      let totalFindings = 0;

      const results = [];


      for (const file of codeFiles) {

        logger.info("Scanning:", file.filename);

        const content =
          await GitHubService.getFileContent(
            owner,
            repo,
            file.filename,
            ref,
            token
          );

        if (!content) {

          logger.warn("Empty content:", file.filename);

          continue;

        }

        const scanResult =
          await ScannerService.scanCode(
            content,
            file.filename,
            repoFullName,
            prNumber
          );

        const findings =
          scanResult?.findings || [];

        totalFindings += findings.length;

        results.push({
          filename: file.filename,
          findings
        });

        logger.info(
          "Findings in file:",
          findings.length
        );

      }


      logger.info("Total findings:", totalFindings);


      // ========================================
      // CREATE COMMENT
      // ========================================

      logger.info("Posting PR comment...");

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

      logger.info("Comment posted successfully");

    }
    catch (error) {

      logger.error("PR HANDLER ERROR");

      logger.error(error.message);
      logger.error(error.stack);

      throw error;

    }

  }


  // ======================================================
  // FORMAT COMMENT
  // ======================================================

  formatComment(results, totalFindings) {

    logger.info("Formatting comment...");

    if (totalFindings === 0) {

      return `## 🛡️ ZeroFalse Security Scan

No vulnerabilities found.

Powered by ZeroFalse`;

    }

    return `## 🛡️ ZeroFalse Security Scan

Found ${totalFindings} vulnerabilities.

Powered by ZeroFalse`;

  }

}


// ======================================================
// EXPORT INSTANCE
// ======================================================

module.exports =
  new WebhookController();