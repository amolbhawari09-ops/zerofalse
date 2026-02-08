const axios = require('axios');
const LLMService = require('./llmService');
const { quickPatternScan } = require('../utils/patterns');
const { generateId, hashData } = require('../utils/crypto');
const { connectDatabase, memoryStore } = require('../config/database');
const logger = require('../utils/logger');

class ScannerService {

  constructor() {

    this.db = null;
    this.githubToken = process.env.GITHUB_TOKEN;

    if (!this.githubToken) {
      logger.warn("⚠️ GITHUB_TOKEN not set — PR scanning will fail");
    }

  }

  // =====================================================
  // SAFE DATABASE ACCESS (Lazy connection)
  // =====================================================
  async getDbSafe() {

    try {

      if (!this.db) {

        logger.info("📦 Initializing database connection...");
        this.db = await connectDatabase();

      }

      return this.db;

    } catch (error) {

      logger.error("Database init failed", {
        error: error.message
      });

      return null;

    }

  }

  // =====================================================
  // MAIN ENTRY — SCAN FULL PR
  // =====================================================
  async scanPullRequest(repoFullName, prNumber) {

    const scanSessionId = generateId();

    logger.info("🚀 Starting PR scan", {
      repo: repoFullName,
      pr: prNumber,
      scanSessionId
    });

    try {

      const files =
        await this.fetchPRFiles(repoFullName, prNumber);

      logger.info(`📁 ${files.length} files fetched`);

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

      logger.info("✅ PR scan completed", {
        filesScanned: results.length
      });

      return results;

    } catch (error) {

      logger.error("❌ PR scan failed", {
        error: error.message
      });

      throw error;

    }

  }

  // =====================================================
  // FETCH PR FILES FROM GITHUB
  // =====================================================
  async fetchPRFiles(repoFullName, prNumber) {

    if (!this.githubToken)
      throw new Error("GITHUB_TOKEN missing");

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
  // MAIN SCAN ENGINE
  // =====================================================
  async scanCode(code, filename, repo, prNumber, language = "javascript") {

    const scanId = generateId();
    const startTime = Date.now();

    logger.info("🔍 Scanning file", { filename });

    try {

      // Pattern scan
      const patternFindings =
        quickPatternScan(code, language);

      // LLM scan
      const llmResult =
        await LLMService.analyzeCode(code, filename, language);

      // Merge findings
      const mergedFindings =
        this.mergeFindings(
          patternFindings,
          llmResult.findings
        );

      // Apply learned patterns
      const filteredFindings =
        await this.applyLearnedPatterns(repo, mergedFindings);

      const scan = {

        id: scanId,
        repo,
        prNumber,
        filename,
        language,

        code: code.substring(0, 2000),
        codeHash: hashData(code),

        findings: filteredFindings,
        rawFindings: mergedFindings,

        patternFindings,
        llmFindings: llmResult.findings,

        llmProvider: llmResult.provider,
        llmModel: llmResult.model,

        timestamp: new Date(),
        scanDuration: Date.now() - startTime,

        status: "completed"

      };

      await this.saveScan(scan);

      logger.info("✅ Scan completed", {
        findings: filteredFindings.length
      });

      return scan;

    } catch (error) {

      logger.error("❌ Scan failed", {
        error: error.message
      });

      return {

        id: scanId,
        error: error.message,
        status: "failed"

      };

    }

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

    const severityOrder =
      { critical: 0, high: 1, medium: 2, low: 3 };

    return merged.sort(
      (a, b) =>
        severityOrder[a.severity] -
        severityOrder[b.severity]
    );

  }

  // =====================================================
  // APPLY LEARNED PATTERNS
  // =====================================================
  async applyLearnedPatterns(repo, findings) {

    const learned =
      await this.getLearnedPatterns(repo);

    return findings.map(f => {

      const similar =
        learned.find(lp =>
          lp.type === f.type &&
          Math.abs(lp.line - f.line) < 5
        );

      if (similar) {

        return {
          ...f,
          confidence: f.confidence * 0.3,
          learned: true
        };

      }

      return f;

    });

  }

  // =====================================================
  // GET LEARNED PATTERNS
  // =====================================================
  async getLearnedPatterns(repo) {

    const db =
      await this.getDbSafe();

    if (db)
      return await db.collection("patterns")
        .find({ repo })
        .toArray();

    return memoryStore.patterns
      .filter(p => p.repo === repo);

  }

  // =====================================================
  // SAVE SCAN
  // =====================================================
  async saveScan(scan) {

    const db =
      await this.getDbSafe();

    if (db) {

      await db.collection("scans")
        .insertOne(scan);

    } else {

      memoryStore.scans.push(scan);

    }

  }

}

module.exports = new ScannerService();