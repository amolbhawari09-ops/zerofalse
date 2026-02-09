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

  // =====================================================
  // VERIFY SIGNATURE
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

  // =====================================================
  // MAIN WEBHOOK ENTRY
  // =====================================================

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
      logger.info(`Event: ${event}, Action: ${payload.action}`);

      if (event === "pull_request") {
        await this.safeHandlePullRequest(payload);
      }

      return res.status(200).send("OK");

    } catch (fatalError) {
      logger.error("Webhook fatal crash", fatalError);
      return res.status(200).send("Recovered");
    }
  }

  // =====================================================
  // SAFE WRAPPER
  // =====================================================

  async safeHandlePullRequest(payload) {
    try {
      await this.handlePullRequest(payload);
    } catch (err) {
      logger.error("PR handler crash:", err.message);
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
    if (!installationId) {
      throw new Error("Missing installation ID");
    }

    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const repoFullName = payload.repository.full_name;
    const prNumber = payload.pull_request.number;
    const ref = payload.pull_request.head.sha;

    logger.info("========== PR SCAN START ==========");
    logger.info(`Repository: ${repoFullName}`);
    logger.info(`PR #: ${prNumber}`);
    logger.info(`Installation ID: ${installationId}`);

    // =====================================================
    // GET INSTALLATION TOKEN
    // =====================================================

    const token = await GitHubService.getInstallationToken(installationId);
    
    if (!token) {
      throw new Error("Installation token failed");
    }

    logger.info("Token acquired successfully");

    // =====================================================
    // GET FILE LIST
    // =====================================================

    const files = await GitHubService.getPullRequestFiles(
      owner,
      repo,
      prNumber,
      token
    );

    if (!files || files.length === 0) {
      logger.info("No files found in PR");
      return;
    }

    logger.info(`Found ${files.length} total files`);

    // Filter to code files only
    const codeFiles = files.filter(f => shouldScanFile(f.filename));
    logger.info(`Code files to scan: ${codeFiles.length}`);

    if (codeFiles.length === 0) {
      logger.info("No code files to scan");
      return;
    }

    // =====================================================
    // SCAN FILES
    // =====================================================

    const results = [];
    let totalFindings = 0;

    for (const file of codeFiles) {
      try {
        if (file.status === "removed") continue;

        logger.info(`Scanning: ${file.filename}`);

        const content = await GitHubService.getFileContent(
          owner,
          repo,
          file.filename,
          ref,
          token
        );

        if (!content) {
          logger.warn(`No content for: ${file.filename}`);
          continue;
        }

        const language = this.getLanguage(file.filename);
        
        const scan = await ScannerService.scanCode(
          content,
          file.filename,
          repoFullName,
          prNumber,
          language
        );

        const findingCount = scan?.findings?.length || 0;
        totalFindings += findingCount;

        results.push({
          filename: file.filename,
          findings: scan?.findings || [],
          scanId: scan?.id
        });

        logger.info(`Found ${findingCount} issues in ${file.filename}`);

      } catch (fileErr) {
        logger.error(`File scan failed: ${file.filename}`, fileErr.message);
      }
    }

    logger.info(`Scan complete: ${results.length} files, ${totalFindings} total findings`);

    // =====================================================
    // POST COMMENT (FIXED - PASS TOKEN)
    // =====================================================

    try {
      const comment = this.formatComment(results, totalFindings);
      
      logger.info("Posting PR comment...");

      // FIXED: Pass token, not installationId
      await GitHubService.createPRComment(
        owner,
        repo,
        prNumber,
        comment,
        token  // ✅ CORRECT: passing token
      );

      logger.info("✅ PR comment posted successfully");

    } catch (commentErr) {
      logger.error("❌ Comment posting failed:", commentErr.message);
      // Don't throw - prevent webhook crash
    }

    logger.info("========== PR SCAN COMPLETE ==========");
  }

  // =====================================================
  // GET LANGUAGE FROM FILENAME
  // =====================================================

  getLanguage(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    
    const langMap = {
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rb': 'ruby',
      'php': 'php',
      'c': 'c',
      'cpp': 'cpp',
      'cs': 'csharp',
      'swift': 'swift',
      'kt': 'kotlin',
      'rs': 'rust',
      'scala': 'scala',
      'ts': 'typescript',
      'tsx': 'typescript',
      'jsx': 'javascript'
    };

    return langMap[ext] || 'javascript';
  }

  // =====================================================
  // COMMENT FORMATTER
  // =====================================================

  formatComment(results, totalFindings) {
    if (totalFindings === 0) {
      return `## 🛡️ ZeroFalse Security Scan

✅ **No vulnerabilities found** in this PR.

All scanned files passed security checks.

---
*Powered by [ZeroFalse](https://zerofalse.vercel.app) - AI security for AI-generated code*`;
    }

    let comment = `## 🛡️ ZeroFalse Security Scan

⚠️ **Found ${totalFindings} potential security issue(s)**

`;

    for (const result of results) {
      if (!result.findings || result.findings.length === 0) continue;

      comment += `### 📄 \`${result.filename}\`\n\n`;

      for (let i = 0; i < result.findings.length; i++) {
        const f = result.findings[i];
        
        const severityEmoji = {
          'critical': '🔴',
          'high': '🟠',
          'medium': '🟡',
          'low': '🔵'
        }[f.severity] || '⚪';

        comment += `${severityEmoji} **${f.severity?.toUpperCase() || 'UNKNOWN'}**: ${f.type || 'Unknown Issue'}\n`;
        comment += `- **Line ${f.line || '?'}**: ${f.description || 'No description'}\n`;
        
        if (f.fix) {
          comment += `- **Suggested Fix**:\n  \`\`\`\n  ${f.fix.replace(/\n/g, '\n  ')}\n  \`\`\`\n`;
        }
        
        comment += `\n`;
      }
    }

    comment += `---
🔒 **Action Required**: Please review these findings before merging.

*Powered by [ZeroFalse](https://zerofalse.vercel.app) - AI security for AI-generated code*`;

    return comment;
  }

}

module.exports = new WebhookController();
