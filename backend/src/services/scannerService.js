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

  const merged = [...aiResults];

  const getBaseType = (type) => {
    const t = type.toLowerCase();
    if (t.includes('execution') || t.includes('eval') || t.includes('rce') || t.includes('injection')) return 'code_exec';
    if (t.includes('sql')) return 'sql_inj';
    if (t.includes('secret') || t.includes('password') || t.includes('key')) return 'credential';
    return t;
  };

  for (const pf of patternResults) {
    const pBase = getBaseType(pf.type);
    const isDuplicate = aiResults.some(af => {
      const isLineMatch = Math.abs(af.line - pf.line) <= 2;
      const aBase = getBaseType(af.type);
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

  return merged.sort((a, b) => a.line - b.line);
}

/**
 * 🛡️ HYBRID RISK SCORING ENGINE
 * Calculates score based on actual unique findings to prevent AI hallucinations.
 */
function calculateHybridScore(findings, aiScore) {
  if (!findings || findings.length === 0) return 0.0;

  const severityWeights = { 
    'CRITICAL': 2.5, 
    'HIGH': 1.5, 
    'MEDIUM': 0.7, 
    'LOW': 0.2 
  };

  // 1. Calculate base score from findings
  let baseScore = findings.reduce((total, f) => {
    const weight = severityWeights[f.severity.toUpperCase()] || 0.5;
    return total + weight;
  }, 0);

  // 2. Blend with AI Score (taking the highest of the two)
  // This ensures if AI says 9.5 and our math says 7.0, we stay cautious.
  // If AI says 0 but we found 4 Criticals, our math saves the report.
  const finalScore = Math.max(baseScore, aiScore || 0);

  // 3. Cap at 10.0 and round to 1 decimal place
  return Math.min(10, parseFloat(finalScore.toFixed(1)));
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
      
      // 2. SMART MERGE
      const rawFindings = mergeFindings(patternFindings, aiFindings);
      const findings = rawFindings.map(f => ({
        ...f,
        filename: f.filename || filename,
        type: f.type.toUpperCase()
      }));

      // 3. HYBRID RISK CALIBRATION (The Upgrade)
      const riskScore = calculateHybridScore(findings, llmResult?.riskScore);

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
