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

/**
 * 🎯 THE PERFECT FIX: Semantic & Proximity Merging
 * Eliminates duplicates by checking both line distance AND vulnerability type.
 */
function mergeFindings(patternFindings, llmFindings) {
  const safeLLM = Array.isArray(llmFindings) ? llmFindings : [];
  const safePattern = Array.isArray(patternFindings) ? patternFindings : [];

  // 1. AI findings are the Master (Source of Truth)
  const merged = [...safeLLM];
  
  // 2. Identify "Danger Zones" already flagged by the AI
  // We use a larger 3-line buffer to account for multi-line function calls
  const coveredZones = safeLLM.map(f => ({
    line: f.line,
    type: f.type.toLowerCase()
  }));
  
  for (const pf of safePattern) {
    const pType = pf.type.toLowerCase();
    
    // 3. Smart Filter: Check if a pattern match is already covered by an AI finding
    const isDuplicate = coveredZones.some(zone => {
      const isLineMatch = Math.abs(zone.line - pf.line) <= 2; // Check +/- 2 lines
      
      // Check if the security meanings are the same (Semantic Check)
      const isSemanticMatch = 
        (pType.includes('injection') && zone.type.includes('execution')) ||
        (pType.includes('execution') && zone.type.includes('injection')) ||
        (pType.includes('secret') && zone.type.includes('password')) ||
        (pType === zone.type);

      return isLineMatch && isSemanticMatch;
    });

    if (!isDuplicate) {
      merged.push({
        ...pf,
        issue: pf.issue || pf.description || "Security pattern match detected.",
        fix_instruction: pf.fix_instruction || pf.fix || "Follow secure coding practices."
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

      // A. Pattern Engine (The Guard) - Fast but basic
      const patternFindings = quickPatternScan(code, language) || [];
      
      // B. AI Engine (The Brain) - Slow but deep
      const llmResult = await LLMService.analyzeCode(code, filename, language);
      
      const aiFindings = Array.isArray(llmResult?.findings) ? llmResult.findings : [];
      const riskScore = llmResult?.riskScore || 0;

      // C. Perform the "Perfect" Smart Merge
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
        riskScore, 
        timestamp: new Date(),
        scanDuration: Date.now() - startTime,
        status: "completed"
      };

      await saveScan(scan);
      
      logger.info(`✅ Scan finished: ${findings.length} UNIQUE findings. Score: ${riskScore}`); //
      return scan; 

    } catch (error) {
      logger.error(`🚨 Scan fatal error: ${error.message}`);
      return { id: scanId, findings: [], riskScore: 0, status: "failed" };
    }
  }
};
