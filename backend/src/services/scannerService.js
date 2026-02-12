const axios = require('axios');
const LLMService = require('./llmService');
const { quickPatternScan } = require('../utils/patterns');
const { generateId, hashData } = require('../utils/crypto');
const { connectDatabase, memoryStore } = require('../config/database');
const logger = require('../utils/logger');

// =====================================================
// STATE MANAGEMENT
// =====================================================
let dbInstance = null;

if (!memoryStore.scans) memoryStore.scans = [];

// =====================================================
// INTERNAL HELPERS
// =====================================================

async function getDbSafe() {
  try {
    if (!dbInstance) {
      dbInstance = await connectDatabase();
    }
    return dbInstance;
  } catch (error) {
    logger.error("Database connection failed:", error.message);
    return null;
  }
}

async function saveScan(scan) {
  try {
    const db = await getDbSafe();
    if (db) {
      await db.collection("scans").insertOne(scan);
    } else {
      memoryStore.scans.push(scan);
    }
  } catch (error) {
    logger.error("saveScan failed:", error.message);
  }
}

/**
 * UPGRADED: Smart Merge
 * Ensures AI findings (with rich Impact/Description data) take priority.
 */
function mergeFindings(patternFindings, llmFindings) {
  const safeLLM = Array.isArray(llmFindings) ? llmFindings : [];
  const safePattern = Array.isArray(patternFindings) ? patternFindings : [];

  // Start with AI findings as they have the new "Security Engineer" context
  const merged = [...safeLLM];
  const seenLines = new Set(safeLLM.map(f => f.line));
  
  for (const pf of safePattern) {
    // Only add pattern findings if the AI missed that specific line
    if (!seenLines.has(pf.line)) {
      merged.push({
        ...pf,
        impact: pf.impact || "Potential security compromise.", // Fallback if pattern has no impact
        description: pf.description || `Pattern match for ${pf.type}`
      });
    }
  }
  return merged;
}

// =====================================================
// EXPORTED SERVICE FUNCTIONS
// =====================================================

module.exports = {
  scanCode: async (code, filename = "input.js", repo = "manual", prNumber = null, language = "javascript") => {
    const scanId = generateId();
    const startTime = Date.now();
    logger.info(`🔍 Scan started: ${filename}`);

    try {
      if (!code) throw new Error("Empty code provided for analysis");

      // 1. Run Pattern Scan (The Safety Net)
      const patternFindings = quickPatternScan(code, language) || [];

      // 2. Run LLM Scan (The Brain)
      let llmFindings = [];
      try {
        const llmResult = await LLMService.analyzeCode(code, filename, language);
        
        // Use the Data Normalizer to prevent crashes
        if (llmResult && Array.isArray(llmResult.findings)) {
          llmFindings = llmResult.findings;
          logger.info(`🤖 AI detected ${llmFindings.length} issues in ${filename}`);
        } else if (llmResult && llmResult.findings) {
          llmFindings = [llmResult.findings];
          logger.warn(`⚠️ AI returned single finding object, normalized to array.`);
        }
      } catch (llmError) {
        logger.error(`❌ LLM Service Failure: ${llmError.message}`);
      }

      // 3. Merge results and inject metadata
      const rawFindings = mergeFindings(patternFindings, llmFindings);
      
      // Ensure every finding has the filename attached for the GitHub report
      const findings = rawFindings.map(f => ({
        ...f,
        filename: f.filename || filename
      }));

      const scan = {
        id: scanId,
        repo,
        prNumber,
        filename,
        language,
        codeHash: hashData(code),
        findings,
        timestamp: new Date(),
        scanDuration: Date.now() - startTime,
        status: "completed"
      };

      // 4. Persistence
      await saveScan(scan);
      
      logger.info(`✅ Scan finished for ${filename}: ${findings.length} total findings`);
      return scan;

    } catch (error) {
      logger.error(`🚨 Scan fatal error: ${error.message}`);
      return { 
        id: scanId, 
        findings: [], 
        error: error.message, 
        status: "failed",
        timestamp: new Date()
      };
    }
  },

  getStats: async () => {
    try {
      const db = await getDbSafe();
      const scans = db ? await db.collection("scans").find({}).toArray() : memoryStore.scans;
      const totalScans = scans.length;
      const totalFindings = scans.reduce((sum, s) => sum + (s.findings?.length || 0), 0);

      return {
        totalScans,
        completedScans: scans.filter(s => s.status === "completed").length,
        totalFindings,
        avgFindings: totalScans === 0 ? 0 : Math.round(totalFindings / totalScans),
        lastScan: totalScans > 0 ? scans.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0].timestamp : null
      };
    } catch (error) {
      logger.error("getStats failed:", error.message);
      return { totalScans: 0, totalFindings: 0 };
    }
  }
};
