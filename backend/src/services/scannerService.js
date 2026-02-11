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

// Initialize memory store if missing (fallback mechanism)
if (!memoryStore.scans) memoryStore.scans = [];
if (!memoryStore.patterns) memoryStore.patterns = [];

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

function mergeFindings(patternFindings, llmFindings) {
  const merged = [...llmFindings];
  const seenLines = new Set(llmFindings.map(f => f.line));
  for (const pf of patternFindings) {
    if (!seenLines.has(pf.line)) merged.push(pf);
  }
  return merged;
}

// =====================================================
// EXPORTED SERVICE FUNCTIONS
// =====================================================

module.exports = {
  // THE MAIN SCAN ENGINE
  scanCode: async (code, filename = "input.js", repo = "manual", prNumber = null, language = "javascript") => {
    const scanId = generateId();
    const startTime = Date.now();
    logger.info(`🔍 Scan started: ${filename}`);

    try {
      if (!code) throw new Error("Empty code");

      // 1. Run Pattern Scan
      const patternFindings = quickPatternScan(code, language) || [];

      // 2. Run LLM Scan
      let llmFindings = [];
      try {
        const llmResult = await LLMService.analyzeCode(code, filename, language);
        llmFindings = llmResult?.findings || [];
      } catch (llmError) {
        logger.warn("LLM analysis failed:", llmError.message);
      }

      // 3. Merge and Save
      const findings = mergeFindings(patternFindings, llmFindings);

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

      await saveScan(scan);
      logger.info(`✅ Scan finished for ${filename}: ${findings.length} findings`);
      return scan;

    } catch (error) {
      logger.error("Scan fatal error:", error.message);
      return { id: scanId, error: error.message, status: "failed" };
    }
  },

  // FEEDBACK LOGIC (Moved from the old class-based Model)
  recordFeedback: async (scanId, isReal, comment) => {
    try {
      const db = await getDbSafe();
      const feedback = {
        userFeedback: { isReal, comment, providedAt: new Date() },
        accuracyScore: isReal ? 100 : 0
      };

      if (db) {
        await db.collection("scans").updateOne({ id: scanId }, { $set: feedback });
      } else {
        const idx = memoryStore.scans.findIndex(s => s.id === scanId);
        if (idx >= 0) memoryStore.scans[idx] = { ...memoryStore.scans[idx], ...feedback };
      }
      
      return feedback;
    } catch (error) {
      logger.error("recordFeedback failed:", error.message);
      throw error;
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
