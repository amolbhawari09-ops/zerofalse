const crypto = require('crypto');
const GitHubService = require('../services/githubService');
const ScannerService = require('../services/scannerService');
const logger = require('../utils/logger');

// ======================================================
// HELPERS
// ======================================================
const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.py', '.pyw', '.java', '.go', '.rb', '.php', '.c', '.cpp', '.h', '.cs', '.swift', '.kt', '.kts', '.rs', '.scala', '.sc'];

function shouldScanFile(filename) {
  if (!filename) return false;
  return CODE_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext));
}

// ======================================================
// INTERNAL LOGIC (Direct Functions - No 'this' needed)
// ======================================================

async function verifySignature(req) {
  logger.info("🔐 SIGNATURE VERIFICATION START");
  try {
    const signature = req.headers['x-hub-signature-256'];
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!signature || !secret || !req.rawBody) {
      logger.warn("❌ Missing signature, secret, or rawBody");
      return false;
    }

    const expectedSignature = 'sha256=' + 
      crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');

    const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    logger.info("Signature valid:", valid);
    return valid;
  } catch (error) {
    logger.error("💥 Signature verification crash:", error.message);
    return false;
  }
}

async function handlePullRequest(payload) {
  logger.info("🚀 PR HANDLER START");
  try {
    const action = payload.action;
    if (!["opened", "synchronize"].includes(action)) return;

    const installationId = payload.installation?.id;
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const prNumber = payload.pull_request.number;
    const ref = payload.pull_request.head.sha;

    const token = await GitHubService.getInstallationToken(installationId);
    const files = await GitHubService.getPullRequestFiles(owner, repo, prNumber, token);
    const codeFiles = files.filter(f => shouldScanFile(f.filename));

    if (codeFiles.length === 0) return;

    let results = [];
    for (const file of codeFiles) {
      const content = await GitHubService.getFileContent(owner, repo, file.filename, ref, token);
      if (!content) continue;

      const scanResult = await ScannerService.scanCode(content, file.filename, payload.repository.full_name, prNumber);
      results.push({ filename: file.filename, findings: scanResult?.findings || [] });
    }

    const totalFindings = results.reduce((sum, res) => sum + res.findings.length, 0);
    const comment = `## 🛡️ ZeroFalse Security Scan\nFound ${totalFindings} vulnerabilities.\n\nPowered by ZeroFalse`;
    
    await GitHubService.createPRComment(owner, repo, prNumber, comment, token);
    logger.info("✅ Comment posted successfully");
  } catch (error) {
    logger.error("PR HANDLER ERROR:", error.message);
  }
}

// ======================================================
// MAIN EXPORT (Exported as a clean object)
// ======================================================

module.exports = {
  handleGitHubWebhook: async (req, res) => {
    logger.info("📩 WEBHOOK RECEIVED");
    try {
      // Step 1: Verify Signature (No 'this' required)
      const valid = await verifySignature(req);
      if (!valid) {
        logger.warn("❌ Invalid signature");
        return res.status(200).send("Ignored");
      }

      // Step 2: Parse Payload
      const payload = JSON.parse(req.rawBody.toString());
      const event = req.headers['x-github-event'];

      // Step 3: Route Event
      if (event === "pull_request") {
        await handlePullRequest(payload);
      }

      return res.status(200).send("OK");
    } catch (fatalError) {
      logger.error("FATAL WEBHOOK ERROR:", fatalError.message);
      return res.status(200).send("Error");
    }
  }
};
