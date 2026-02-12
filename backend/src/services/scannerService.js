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
 * 🎯 THE ULTIMATE DEDUPLICATION ENGINE
 * Merges Pattern and AI findings by checking Line Proximity + Semantic Similarity.
 */
function mergeFindings(patternFindings, llmFindings) {
  const aiResults = Array.isArray(llmFindings) ? llmFindings : [];
  const patternResults = Array.isArray(patternFindings) ? patternFindings : [];

  // Start with AI findings as the Source of Truth
  const merged = [...aiResults];

  // Helper to normalize types for comparison
  const getBaseType = (type) => {
    const t = type.toLowerCase();
    if (t.includes('execution') || t.includes('eval') || t.includes('rce') || t.includes('injection')) return 'code_exec';
    if (t.includes('sql')) return 'sql_inj';
    if (t.includes('secret') || t.includes('password') || t.includes('key')) return 'credential';
    return t;
  };

  for (const pf of patternResults) {
    const pBase = getBaseType(pf.type);

    // Check if any AI finding is already covering this exact issue
    const isDuplicate = aiResults.some(af => {
      const isLineMatch = Math.abs(af.line - pf.line) <= 2;
      const aBase = getBaseType(af.type);
      
      // It's a duplicate if it's on the same line AND same general category
      return isLineMatch && (aBase === pBase);
    });

    if (!isDuplicate) {
      merged.push({
        ...pf,
        issue: pf.description || "Security pattern match detected.",
        fix_instruction: pf.fix || "Follow secure coding practices."
      });
    }
  }

  // Final sort by line number for a professional report
  return merged.sort((a, b) => a.line - b.line);
}

module.exports = {
  scanCode: async (code, filename = "input.js", repo = "manual", prNumber = null, language = "javascript") => {
    const scanId = generateId();
    const startTime = Date.now();
    logger.info(`🔍 Scan started: ${filename}`);

    try {
      if (!code) throw new Error("Empty code provided");

      // 1. Run Engines
      const patternFindings = quickPatternScan(code, language) || [];
      const llmResult = await LLMService.analyzeCode(code, filename, language);
      
      const aiFindings = llmResult?.findings || [];
      
      // 2. SMART MERGE (Eliminates the "7 instead of 4" bug)
      const findings = mergeFindings(patternFindings, aiFindings).map(f => ({
        ...f,
        filename: f.filename || filename,
        type: f.type.toUpperCase() // Clean display
      }));

      // 3. Risk Score Calibration
      // We take the AI's risk score but cap it if no findings exist
      const riskScore = findings.length === 0 ? 0 : (llmResult?.riskScore || 0);

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
      
      logger.info(`✅ Scan finished: ${findings.length} UNIQUE findings. Score: ${riskScore}`);
      return scan; 

    } catch (error) {
      logger.error(`🚨 Scan fatal error: ${error.message}`);
      return { id: scanId, findings: [], riskScore: 0, status: "failed" };
    }
  }
};
