const axios = require('axios');
const LLMService = require('./llmService');
const { quickPatternScan } = require('../utils/patterns');
const { generateId, hashData } = require('../utils/crypto');
const { connectDatabase, memoryStore } = require('../config/database');
const logger = require('../utils/logger');

class ScannerService {

  constructor() {
    this.db = null;
    this.githubToken = process.env.GITHUB_TOKEN || null;

    if (!this.githubToken) {
      logger.warn("⚠️ GITHUB_TOKEN not set — PR scanning limited");
    }
  }

  // =====================================================
  // SAFE DATABASE ACCESS
  // =====================================================
  async getDbSafe() {

    try {

      if (!this.db) {

        logger.info("📦 Initializing database...");
        this.db = await connectDatabase();

      }

      return this.db;

    } catch (error) {

      logger.error("Database connection failed:", error.message);
      return null;

    }

  }

  // =====================================================
  // GET ALL SCANS  ⭐ FIXES YOUR ERROR
  // =====================================================
  async getAllScans(limit = 50) {

    try {

      const db = await this.getDbSafe();

      if (db) {

        return await db
          .collection("scans")
          .find({})
          .sort({ timestamp: -1 })
          .limit(limit)
          .toArray();

      }

      // fallback memory
      return memoryStore.scans
        .sort((a, b) =>
          new Date(b.timestamp) - new Date(a.timestamp)
        )
        .slice(0, limit);

    }
    catch (error) {

      logger.error("getAllScans failed:", error.message);
      return [];

    }

  }

  // =====================================================
  // GET SINGLE SCAN BY ID
  // =====================================================
  async getScanById(scanId) {

    try {

      const db = await this.getDbSafe();

      if (db) {

        return await db
          .collection("scans")
          .findOne({ id: scanId });

      }

      return memoryStore.scans
        .find(s => s.id === scanId);

    }
    catch (error) {

      logger.error("getScanById failed:", error.message);
      return null;

    }

  }

  // =====================================================
  // SCAN RAW CODE (Frontend scan button uses this)
  // =====================================================
  async scanCode(code, filename = "input.js", repo = "manual", prNumber = null, language = "javascript") {

    const scanId = generateId();
    const startTime = Date.now();

    logger.info("🔍 Starting scan", { filename });

    try {

      // Pattern scan
      const patternFindings =
        quickPatternScan(code, language) || [];

      // LLM scan
      let llmFindings = [];

      try {

        const llmResult =
          await LLMService.analyzeCode(code, filename, language);

        llmFindings = llmResult.findings || [];

      }
      catch (llmError) {

        logger.warn("LLM scan failed:", llmError.message);

      }

      // Merge findings
      const mergedFindings =
        this.mergeFindings(patternFindings, llmFindings);

      const scan = {

        id: scanId,
        repo,
        prNumber,
        filename,
        language,

        code: code.substring(0, 2000),
        codeHash: hashData(code),

        findings: mergedFindings,

        patternFindings,
        llmFindings,

        timestamp: new Date(),
        scanDuration: Date.now() - startTime,

        status: "completed"

      };

      await this.saveScan(scan);

      logger.info("✅ Scan complete", {
        findings: mergedFindings.length
      });

      return scan;

    }
    catch (error) {

      logger.error("Scan failed:", error.message);

      return {

        id: scanId,
        error: error.message,
        status: "failed"

      };

    }

  }

  // =====================================================
  // FETCH PR FILES
  // =====================================================
  async fetchPRFiles(repoFullName, prNumber) {

    if (!this.githubToken)
      throw new Error("Missing GITHUB_TOKEN");

    const url =
      `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/files`;

    const response = await axios.get(url, {

      headers: {

        Authorization: `Bearer ${this.githubToken}`,
        Accept: "application/vnd.github+json"

      }

    });

    return response.data;

  }

  // =====================================================
  // SCAN FULL PR
  // =====================================================
  async scanPullRequest(repoFullName, prNumber) {

    const files =
      await this.fetchPRFiles(repoFullName, prNumber);

    const results = [];

    for (const file of files) {

      if (!file.patch) continue;

      const result =
        await this.scanCode(
          file.patch,
          file.filename,
          repoFullName,
          prNumber,
          this.detectLanguage(file.filename)
        );

      results.push(result);

    }

    return results;

  }

  // =====================================================
  // LANGUAGE DETECTOR
  // =====================================================
  detectLanguage(filename) {

    if (filename.endsWith(".js")) return "javascript";
    if (filename.endsWith(".ts")) return "typescript";
    if (filename.endsWith(".py")) return "python";
    if (filename.endsWith(".java")) return "java";
    if (filename.endsWith(".cpp")) return "cpp";
    if (filename.endsWith(".go")) return "go";

    return "text";

  }

  // =====================================================
  // MERGE FINDINGS
  // =====================================================
  mergeFindings(patternFindings, llmFindings) {

    const merged = [...llmFindings];

    const seen =
      new Set(llmFindings.map(f => f.line));

    for (const pf of patternFindings) {

      if (!seen.has(pf.line))
        merged.push(pf);

    }

    return merged;

  }

  // =====================================================
  // SAVE SCAN
  // =====================================================
  async saveScan(scan) {

    try {

      const db = await this.getDbSafe();

      if (db) {

        await db.collection("scans")
          .insertOne(scan);

      }
      else {

        memoryStore.scans.push(scan);

      }

    }
    catch (error) {

      logger.error("saveScan failed:", error.message);

    }

  }

}

module.exports = new ScannerService();