const LLMService = require('./llmService');
const { quickPatternScan } = require('../utils/patterns');
const { generateId } = require('../utils/crypto');
const { getDb, memoryStore } = require('../config/database');
const logger = require('../utils/logger');

class ScannerService {
  constructor() {
    this.db = null;
    this.init();
  }
  
  async init() {
    this.db = await require('../config/database').connectDatabase();
  }
  
  /**
   * Main scan method - combines pattern matching + LLM analysis
   */
  async scanCode(code, filename, repo, prNumber, language = 'javascript') {
    const scanId = generateId();
    const startTime = Date.now();
    
    logger.info('Starting scan', { scanId, filename, repo });
    
    try {
      // Step 1: Quick pattern scan (fast, catches obvious issues)
      const patternFindings = quickPatternScan(code, language);
      
      // Step 2: LLM deep analysis (thorough, catches subtle issues)
      const llmResult = await LLMService.analyzeCode(code, filename, language);
      
      // Step 3: Merge findings (deduplicate, prioritize)
      const mergedFindings = this.mergeFindings(patternFindings, llmResult.findings);
      
      // Step 4: Apply learned patterns (reduce false positives)
      const filteredFindings = await this.applyLearnedPatterns(repo, mergedFindings);
      
      const scan = {
        id: scanId,
        repo,
        prNumber,
        filename,
        language,
        code: code.substring(0, 2000), // Store snippet only
        codeHash: require('../utils/crypto').hashData(code),
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
      
      // Save to database
      await this.saveScan(scan);
      
      logger.info('Scan completed', { 
        scanId, 
        findingsCount: scan.findings.length,
        duration: scan.scanDuration 
      });
      
      return scan;
      
    } catch (error) {
      logger.error('Scan failed', { scanId, error: error.message });
      
      // Return failed scan record
      return {
        id: scanId,
        repo,
        prNumber,
        filename,
        error: error.message,
        timestamp: new Date(),
        status: 'failed'
      };
    }
  }
  
  mergeFindings(patternFindings, llmFindings) {
    const merged = [...llmFindings];
    const seenLines = new Set(llmFindings.map(f => f.line));
    
    // Add pattern findings that LLM missed
    for (const pf of patternFindings) {
      if (!seenLines.has(pf.line)) {
        merged.push(pf);
      }
    }
    
    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return merged.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }
  
  async applyLearnedPatterns(repo, findings) {
    const learnedPatterns = await this.getLearnedPatterns(repo);
    
    return findings.map(finding => {
      // Check if similar pattern was marked false positive
      const similarPattern = learnedPatterns.find(lp => 
        lp.type === finding.type &&
        Math.abs(lp.line - finding.line) < 5 &&
        lp.confidenceReduction > 0.5
      );
      
      if (similarPattern) {
        return {
          ...finding,
          originalConfidence: finding.confidence,
          confidence: finding.confidence * (1 - similarPattern.confidenceReduction),
          warning: 'Similar pattern previously marked as false positive',
          learned: true
        };
      }
      
      return finding;
    });
  }
  
  async getLearnedPatterns(repo) {
    if (this.db) {
      return await this.db.collection('patterns')
        .find({ repo })
        .sort({ learnedAt: -1 })
        .limit(100)
        .toArray();
    }
    
    return memoryStore.patterns.filter(p => p.repo === repo);
  }
  
  async saveScan(scan) {
    if (this.db) {
      await this.db.collection('scans').insertOne(scan);
    } else {
      memoryStore.scans.push(scan);
    }
    
    // Update stats
    await this.updateStats();
  }
  
  async updateStats() {
    const stats = await this.calculateStats();
    
    if (this.db) {
      await this.db.collection('stats').updateOne(
        { type: 'global' },
        { $set: stats },
        { upsert: true }
      );
    } else {
      memoryStore.stats = stats;
    }
  }
  
  async calculateStats() {
    const scans = this.db 
      ? await this.db.collection('scans').find({ status: 'completed' }).toArray()
      : memoryStore.scans.filter(s => s.status === 'completed');
    
    const withFeedback = scans.filter(s => s.userFeedback);
    const correct = withFeedback.filter(s => 
      (s.userFeedback.isReal && s.findings.length > 0) ||
      (!s.userFeedback.isReal && s.findings.length === 0)
    );
    
    const totalVulns = scans.reduce((sum, s) => sum + (s.findings?.length || 0), 0);
    const falsePositivesPrevented = withFeedback.filter(s => !s.userFeedback.isReal).length;
    
    return {
      totalScans: scans.length,
      totalVulns,
      accuracy: withFeedback.length > 0 ? (correct / withFeedback.length) * 100 : 0,
      falsePositivesPrevented,
      avgScanDuration: scans.reduce((sum, s) => sum + (s.scanDuration || 0), 0) / scans.length || 0,
      lastUpdated: new Date()
    };
  }
  
  async recordFeedback(scanId, isRealVulnerability, comment = '') {
    const scan = await this.getScan(scanId);
    if (!scan) throw new Error('Scan not found');
    
    scan.userFeedback = {
      isReal: isRealVulnerability,
      comment,
      providedAt: new Date()
    };
    scan.accuracyScore = isRealVulnerability ? 100 : 0;
    
    // Update in storage
    if (this.db) {
      await this.db.collection('scans').updateOne(
        { id: scanId },
        { $set: { userFeedback: scan.userFeedback, accuracyScore: scan.accuracyScore } }
      );
    } else {
      const idx = memoryStore.scans.findIndex(s => s.id === scanId);
      if (idx >= 0) memoryStore.scans[idx] = scan;
    }
    
    // Learn pattern if false positive
    if (!isRealVulnerability && scan.findings.length > 0) {
      await this.learnPattern(scan);
    }
    
    await this.updateStats();
    
    return scan;
  }
  
  async learnPattern(scan) {
    const pattern = {
      id: generateId(),
      repo: scan.repo,
      type: scan.findings[0].type,
      line: scan.findings[0].line,
      filename: scan.filename,
      language: scan.language,
      codeSnippet: scan.code.substring(0, 300),
      confidenceReduction: 0.7,
      learnedAt: new Date()
    };
    
    if (this.db) {
      await this.db.collection('patterns').insertOne(pattern);
    } else {
      memoryStore.patterns.push(pattern);
    }
    
    logger.info('Learned new pattern', { 
      repo: pattern.repo, 
      type: pattern.type 
    });
  }
  
  async getScan(scanId) {
    if (this.db) {
      return await this.db.collection('scans').findOne({ id: scanId });
    }
    return memoryStore.scans.find(s => s.id === scanId);
  }
  
  async getAllScans(limit = 50) {
    const scans = this.db
      ? await this.db.collection('scans')
          .find({ status: 'completed' })
          .sort({ timestamp: -1 })
          .limit(limit)
          .toArray()
      : memoryStore.scans
          .filter(s => s.status === 'completed')
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, limit);
    
    return scans;
  }
  
  async getStats() {
    if (this.db) {
      return await this.db.collection('stats').findOne({ type: 'global' }) || {
        totalScans: 0,
        totalVulns: 0,
        accuracy: 0,
        falsePositivesPrevented: 0
      };
    }
    return memoryStore.stats;
  }
}

module.exports = new ScannerService();
