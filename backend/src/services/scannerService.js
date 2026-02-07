const axios = require('axios');
const LLMService = require('./llmService');
const { quickPatternScan } = require('../utils/patterns');
const { generateId, hashData } = require('../utils/crypto');
const { getDb, memoryStore } = require('../config/database');
const logger = require('../utils/logger');

class ScannerService {

  constructor() {
    this.db = null;
    this.githubToken = process.env.GITHUB_TOKEN;

    if (!this.githubToken) {
      logger.warn("GITHUB_TOKEN not set — GitHub PR scanning will fail");
    }

    this.init();
  }

  async init() {
    this.db = await require('../config/database').connectDatabase();
  }

  // =====================================================
  // NEW: MAIN ENTRY FOR GITHUB PR SCAN
  // =====================================================
  async scanPullRequest(repoFullName, prNumber) {

    const scanSessionId = generateId();

    logger.info("Starting PR scan", {
      repo: repoFullName,
      pr: prNumber,
      scanSessionId
    });

    try {

      const files = await this.fetchPRFiles(repoFullName, prNumber);

      logger.info(`Fetched ${files.length} PR files`);

      const results = [];

      for (const file of files) {

        if (!file.patch) continue;

        const result = await this.scanCode(
          file.patch,
          file.filename,
          repoFullName,
          prNumber,
          this.detectLanguage(file.filename)
        );

        results.push(result);

      }

      logger.info("PR scan complete", {
        repo: repoFullName,
        pr: prNumber,
        filesScanned: results.length
      });

      return results;

    } catch (error) {

      logger.error("PR scan failed", {
        repo: repoFullName,
        pr: prNumber,
        error: error.message
      });

      throw error;
    }

  }

  // =====================================================
  // NEW: FETCH FILES FROM GITHUB API
  // =====================================================
  async fetchPRFiles(repoFullName, prNumber) {

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
  // EXISTING MAIN SCAN METHOD (UNCHANGED CORE)
  // =====================================================
  async scanCode(code, filename, repo, prNumber, language = 'javascript') {

    const scanId = generateId();
    const startTime = Date.now();

    logger.info('Scanning file', {
      scanId,
      filename
    });

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

      // Apply learning
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

        userFeedback: null,
        accuracyScore: null,
        status: 'completed'

      };

      await this.saveScan(scan);

      logger.info("Scan completed", {
        scanId,
        findings: filteredFindings.length
      });

      return scan;

    } catch (error) {

      logger.error("Scan failed", {
        scanId,
        error: error.message
      });

      return {

        id: scanId,
        repo,
        filename,
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
  // EXISTING METHODS (UNCHANGED)
  // =====================================================

  mergeFindings(patternFindings, llmFindings) {

    const merged = [...llmFindings];
    const seen = new Set(llmFindings.map(f => f.line));

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

  async getLearnedPatterns(repo) {

    if (this.db)
      return await this.db.collection("patterns")
        .find({ repo })
        .toArray();

    return memoryStore.patterns
      .filter(p => p.repo === repo);

  }

  async saveScan(scan) {

    if (this.db)
      await this.db.collection("scans").insertOne(scan);

    else
      memoryStore.scans.push(scan);

  }

}

module.exports = new ScannerService();