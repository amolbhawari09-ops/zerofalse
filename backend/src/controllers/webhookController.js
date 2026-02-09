const crypto = require('crypto');
const GitHubService = require('../services/githubService');
const ScannerService = require('../services/scannerService');
const logger = require('../utils/logger');

// Code file extensions to scan
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
  return CODE_EXTENSIONS.some(ext => 
    filename.toLowerCase().endsWith(ext)
  );
}

class WebhookController {

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

      const expectedSignature = 'sha256=' +
        crypto
          .createHmac('sha256', secret)
          .update(req.body)
          .digest('hex');

      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);

      if (sigBuffer.length !== expectedBuffer.length)
        return false;

      return crypto.timingSafeEqual(sigBuffer, expectedBuffer);

    } catch (err) {
      logger.error("Signature verification crash", err);
      return false;
    }
  }

  async handleGitHubWebhook(req, res) {
    logger.info("📩 GitHub webhook received");

    try {
      if (!this.verifySignature(req)) {
        logger.warn("Invalid webhook signature");
        return res.status(200).send("Ignored");
      }

      let payload;
      try {
        payload = JSON.parse(req.body.toString());
      } catch (parseError) {
        logger.error("Payload parse failed", parseError);
        return res.status(200).send("Invalid payload");
      }

      const event = req.headers['x-github-event'];
      logger.info(`Event: ${event}, Action: ${payload?.action}`);

      if (event === "pull_request") {
        // DEBUG: Don't use safe wrapper, let errors bubble up
        logger.info("🔥 About to handle PR - entering handler");
        await this.handlePullRequest(payload);
        logger.info("✅ PR handler completed successfully");
      }

      return res.status(200).send("OK");

    } catch (fatalError) {
      // DEBUG: Log full error
      logger.error("💀 WEBHOOK FATAL ERROR:");
      logger.error(fatalError.message);
      logger.error(fatalError.stack);
      return res.status(200).send("Error: " + fatalError.message);
    }
  }

  async handlePullRequest(payload) {
    logger.info("🚀 PR HANDLER STARTED");

    const action = payload.action;
    logger.info(`Action: ${action}`);

    if (!["opened", "synchronize"].includes(action)) {
      logger.info(`Skipping action: ${action}`);
      return;
    }

    // DEBUG: Check all required fields
    logger.info("Checking payload fields...");
    logger.info(`repository: ${!!payload.repository}`);
    logger.info(`repository.owner: ${!!payload.repository?.owner}`);
    logger.info(`installation: ${!!payload.installation}`);
    logger.info(`pull_request: ${!!payload.pull_request}`);

    const installationId = payload.installation?.id;
    if (!installationId) {
      throw new Error("Missing installation ID");
    }
    logger.info(`Installation ID: ${installationId}`);

    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const repoFullName = payload.repository.full_name;
    const prNumber = payload.pull_request.number;
    const ref = payload.pull_request.head.sha;

    logger.info(`Repo: ${repoFullName}, PR: #${prNumber}`);

    // =====================================================
    // GET TOKEN
    // =====================================================

    logger.info("🔑 Getting installation token...");
    let token;
    try {
      token = await GitHubService.getInstallationToken(installationId);
      logger.info(`✅ Token acquired: ${token.substring(0, 10)}...`);
    } catch (tokenErr) {
      logger.error("❌ Token failed:", tokenErr.message);
      throw tokenErr;
    }

    // =====================================================
    // GET FILES
    // =====================================================

    logger.info("📁 Getting PR files...");
    let files;
    try {
      files = await GitHubService.getPullRequestFiles(owner, repo, prNumber, token);
      logger.info(`✅ Found ${files.length} files`);
    } catch (filesErr) {
      logger.error("❌ Get files failed:", filesErr.message);
      throw filesErr;
    }

    // Filter to code files
    const codeFiles = files.filter(f => shouldScanFile(f.filename));
    logger.info(`Code files to scan: ${codeFiles.length}`);

    if (codeFiles.length === 0) {
      logger.info("No code files to scan - skipping");
      return;
    }

    // =====================================================
    // SCAN FILES
    // =====================================================

    const results = [];
    let totalFindings = 0;

    for (const file of codeFiles) {
      try {
        logger.info(`🔍 Scanning: ${file.filename}`);

        const content = await GitHubService.getFileContent(
          owner, repo, file.filename, ref, token
        );

        if (!content) {
          logger.warn(`No content for: ${file.filename}`);
          continue;
        }

        logger.info(`Content length: ${content.length} chars`);

        const scan = await ScannerService.scanCode(
          content,
          file.filename,
          repoFullName,
          prNumber,
          'javascript'
        );

        const findingCount = scan?.findings?.length || 0;
        totalFindings += findingCount;

        results.push({
          filename: file.filename,
          findings: scan?.findings || []
        });

        logger.info(`✅ Scanned ${file.filename}: ${findingCount} findings`);

      } catch (fileErr) {
        logger.error(`❌ File scan failed ${file.filename}:`, fileErr.message);
        // Continue with other files
      }
    }

    logger.info(`Scan complete: ${results.length} files, ${totalFindings} total findings`);

    // =====================================================
    // POST COMMENT
    // =====================================================

    try {
      const comment = this.formatComment(results, totalFindings);
      logger.info("💬 Posting comment...");
      logger.info(`Comment length: ${comment.length} chars`);

      await GitHubService.createPRComment(
        owner, repo, prNumber, comment, token
      );

      logger.info("✅ Comment posted successfully");

    } catch (commentErr) {
      logger.error("❌ Comment posting failed:", commentErr.message);
      logger.error(commentErr.stack);
      throw commentErr;
    }

    logger.info("🎉 PR HANDLER COMPLETED");
  }

  formatComment(results, totalFindings) {
    if (totalFindings === 0) {
      return `## 🛡️ ZeroFalse Security Scan

✅ **No vulnerabilities found** in this PR.

---
*Powered by [ZeroFalse](https://zerofalse.vercel.app)*`;
    }

    let comment = `## 🛡️ ZeroFalse Security Scan

⚠️ **Found ${totalFindings} potential security issue(s)**

`;

    for (const result of results) {
      if (!result.findings || result.findings.length === 0) continue;

      comment += `### 📄 \`${result.filename}\`\n\n`;

      for (const f of result.findings) {
        const severityEmoji = {
          'critical': '🔴',
          'high': '🟠',
          'medium': '🟡',
          'low': '🔵'
        }[f.severity] || '⚪';

        comment += `${severityEmoji} **${f.severity?.toUpperCase() || 'UNKNOWN'}**: ${f.type || 'Unknown'}\n`;
        comment += `- Line ${f.line || '?'}: ${f.description || 'No description'}\n\n`;
      }
    }

    comment += `---
*Powered by [ZeroFalse](https://zerofalse.vercel.app)*`;

    return comment;
  }

}

module.exports = new WebhookController();
