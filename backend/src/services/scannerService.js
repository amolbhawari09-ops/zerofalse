const axios = require('axios');
const LLMService = require('./llmService');
const { quickPatternScan } = require('../utils/patterns');
const { generateId, hashData } = require('../utils/crypto');
const { connectDatabase, memoryStore } = require('../config/database');
const logger = require('../utils/logger');

let dbInstance = null;
if (!memoryStore.scans) memoryStore.scans = [];

async function getDbSafe() {
  try {
    if (!dbInstance) dbInstance = await connectDatabase();
    return dbInstance;
  } catch (error) {
    logger.error("Database connection failed:", error.message);
    return null;
  }
}

async function saveScan(scan) {
  try {
    const db = await getDbSafe();
    if (db) await db.collection("scans").insertOne(scan);
    else memoryStore.scans.push(scan);
  } catch (error) {
    logger.error("saveScan failed:", error.message);
  }
}

function mergeFindings(patternFindings, llmFindings) {
  const safeLLM = Array.isArray(llmFindings) ? llmFindings : [];
  const safePattern = Array.isArray(patternFindings) ? patternFindings : [];
  const merged = [...safeLLM];
  const seenLines = new Set(safeLLM.map(f => f.line));
  
  for (const pf of safePattern) {
    if (!seenLines.has(pf.line)) {
      merged.push({
        ...pf,
        issue: pf.issue || pf.description || "Potential security compromise.",
        fix_instruction: pf.fix_instruction || pf.fix || "Update implementation."
      });
    }
  }
  return merged;
}

module.exports = {
  scanCode: async (code, filename = "input.js", repo = "manual", prNumber = null, language = "javascript") => {
    const scanId = generateId();
    const startTime = Date.now();
    logger.info(`🔍 Scan started: ${filename}`);

    try {
      if (!code) throw new Error("Empty code provided");

      const patternFindings = quickPatternScan(code, language) || [];
      
      // ✅ UPGRADE: Capture the full result (including riskScore)
      const llmResult = await LLMService.analyzeCode(code, filename, language);
      
      const aiFindings = Array.isArray(llmResult?.findings) ? llmResult.findings : [];
      const riskScore = llmResult?.riskScore || 0; // Capture the 0-10 score

      const rawFindings = mergeFindings(patternFindings, aiFindings);
      const findings = rawFindings.map(f => ({ ...f, filename: f.filename || filename }));

      const scan = {
        id: scanId,
        repo,
        prNumber,
        filename,
        language,
        codeHash: hashData(code),
        findings,
        riskScore, // ✅ Store the score in the final scan object
        timestamp: new Date(),
        scanDuration: Date.now() - startTime,
        status: "completed"
      };

      await saveScan(scan);
      
      logger.info(`✅ Scan finished for ${filename}: ${findings.length} findings. Score: ${riskScore}`);
      return scan; // Returns the full object for the controller to use

    } catch (error) {
      logger.error(`🚨 Scan fatal error: ${error.message}`);
      return { id: scanId, findings: [], riskScore: 0, status: "failed" };
    }
  }
};
