const crypto = require('crypto');
const GitHubService = require('../services/githubService');
const ScannerService = require('../services/scannerService');
const logger = require('../utils/logger');

// HELPERS
const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.py', '.pyw', '.java', '.go', '.rb', '.php', '.c', '.cpp', '.h', '.cs', '.swift', '.kt', '.kts', '.rs', '.scala', '.sc'];

function shouldScanFile(filename) {
  return filename && CODE_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext));
}

// LOGIC FUNCTIONS
async function verifySignature(req) {
  logger.info("🔐 SIGNATURE VERIFICATION START");
  const signature = req.headers['x-hub-signature-256'];
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!signature || !secret || !req.rawBody) {
    logger.warn("❌ Missing signature, secret, or rawBody");
    return false;
  }

  const expectedSignature = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  
  try {
    const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    logger.info(`✅ Signature valid: ${isValid}`);
    return isValid;
  } catch (err) {
    logger.error("💥 Signature verification crashed:", err.message);
    return false;
  }
}

async function handlePullRequest(payload) {
  logger.info("🚀 PR HANDLER START");
  const { action, installation, repository, pull_request } = payload;
  
  if (!["opened", "synchronize"].includes(action)) {
    logger.info(`Action ${action} ignored`);
    return;
  }

  const token = await GitHubService.getInstallationToken(installation.id);
  const files = await GitHubService.getPullRequestFiles(repository.owner.login, repository.name, pull_request.number, token);
  
  const scanTargets = files.filter(f => shouldScanFile(f.filename));
  logger.info(`Found ${scanTargets.length} files to analyze`);

  for (const file of scanTargets) {
    const content = await GitHubService.getFileContent(repository.owner.login, repository.name, file.filename, pull_request.head.sha, token);
    if (content) {
      await ScannerService.scanCode(content, file.filename, repository.full_name, pull_request.number);
    }
  }
  
  await GitHubService.createPRComment(repository.owner.login, repository.name, pull_request.number, "## 🛡️ ZeroFalse Scan Complete", token);
  logger.info("✅ Comment posted to GitHub");
}

// EXPORT
module.exports = {
  handleGitHubWebhook: async (req, res) => {
    logger.info("📩 WEBHOOK RECEIVED");
    try {
      // 1. Signature Step
      const isValid = await verifySignature(req);
      if (!isValid) return res.status(200).send("Ignored");
      
      // 2. Event Step
      const payload = JSON.parse(req.rawBody.toString());
      if (req.headers['x-github-event'] === "pull_request") {
        await handlePullRequest(payload);
        // 3. Completion Step
        logger.info("✅ Scan finished");
      }
      
      return res.status(200).send("OK");
    } catch (err) {
      logger.error("💥 FATAL ERROR:", err.message);
      return res.status(200).send("Error");
    }
  }
};
