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

  if (!signature || !secret || !req.rawBody) return false;

  const expectedSignature = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

async function handlePullRequest(payload) {
  logger.info("🚀 PR HANDLER START");
  const { action, installation, repository, pull_request } = payload;
  if (!["opened", "synchronize"].includes(action)) return;

  const token = await GitHubService.getInstallationToken(installation.id);
  const files = await GitHubService.getPullRequestFiles(repository.owner.login, repository.name, pull_request.number, token);
  
  for (const file of files.filter(f => shouldScanFile(f.filename))) {
    const content = await GitHubService.getFileContent(repository.owner.login, repository.name, file.filename, pull_request.head.sha, token);
    if (content) await ScannerService.scanCode(content, file.filename, repository.full_name, pull_request.number);
  }
  
  await GitHubService.createPRComment(repository.owner.login, repository.name, pull_request.number, "## 🛡️ ZeroFalse Scan Complete", token);
  logger.info("✅ Comment posted");
}

// EXPORT
module.exports = {
  handleGitHubWebhook: async (req, res) => {
    logger.info("📩 WEBHOOK RECEIVED");
    try {
      if (!(await verifySignature(req))) return res.status(200).send("Ignored");
      
      const payload = JSON.parse(req.rawBody.toString());
      if (req.headers['x-github-event'] === "pull_request") await handlePullRequest(payload);
      
      return res.status(200).send("OK");
    } catch (err) {
      logger.error("FATAL ERROR:", err.message);
      return res.status(200).send("Error");
    }
  }
};
