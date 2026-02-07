const { getDb, memoryStore } = require('../config/database');
const { generateId } = require('../utils/crypto');

/**
 * Scan Model - handles all database operations for security scans
 */
class Scan {
  constructor(data) {
    this.id = data.id || generateId();
    this.repo = data.repo;
    this.prNumber = data.prNumber;
    this.filename = data.filename;
    this.language = data.language || 'javascript';
    this.code = data.code; // Stored snippet (first 2000 chars)
    this.codeHash = data.codeHash;
    this.findings = data.findings || [];
    this.rawFindings = data.rawFindings || [];
    this.patternFindings = data.patternFindings || [];
    this.llmFindings = data.llmFindings || [];
    this.llmProvider = data.llmProvider || 'unknown';
    this.llmModel = data.llmModel || 'unknown';
    this.timestamp = data.timestamp || new Date();
    this.scanDuration = data.scanDuration || 0;
    this.userFeedback = data.userFeedback || null;
    this.accuracyScore = data.accuracyScore || null;
    this.status = data.status || 'completed';
    this.error = data.error || null;
  }

  /**
   * Save scan to database
   */
  async save() {
    const db = getDb();
    
    if (db) {
      // MongoDB
      await db.collection('scans').insertOne(this.toJSON());
    } else {
      // In-memory fallback
      memoryStore.scans.push(this.toJSON());
    }
    
    return this;
  }

  /**
   * Update scan with feedback
   */
  async updateFeedback(isReal, comment = '') {
    this.userFeedback = {
      isReal,
      comment,
      providedAt: new Date()
    };
    this.accuracyScore = isReal ? 100 : 0;
    
    const db = getDb();
    
    if (db) {
      await db.collection('scans').updateOne(
        { id: this.id },
        { $set: { userFeedback: this.userFeedback, accuracyScore: this.accuracyScore } }
      );
    } else {
      const idx = memoryStore.scans.findIndex(s => s.id === this.id);
      if (idx >= 0) {
        memoryStore.scans[idx] = this.toJSON();
      }
    }
    
    return this;
  }

  /**
   * Find scan by ID
   */
  static async findById(id) {
    const db = getDb();
    
    let data;
    if (db) {
      data = await db.collection('scans').findOne({ id });
    } else {
      data = memoryStore.scans.find(s => s.id === id);
    }
    
    return data ? new Scan(data) : null;
  }

  /**
   * Find all scans with optional filters
   */
  static async findAll(filters = {}, limit = 50, skip = 0) {
    const db = getDb();
    
    let scans;
    if (db) {
      scans = await db.collection('scans')
        .find(filters)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
    } else {
      scans = memoryStore.scans
        .filter(s => {
          // Apply filters
          if (filters.repo && s.repo !== filters.repo) return false;
          if (filters.status && s.status !== filters.status) return true;
          return true;
        })
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(skip, skip + limit);
    }
    
    return scans.map(s => new Scan(s));
  }

  /**
   * Find scans by repository
   */
  static async findByRepo(repo, limit = 100) {
    return Scan.findAll({ repo }, limit);
  }

  /**
   * Get scans with feedback (for accuracy calculation)
   */
  static async findWithFeedback() {
    const db = getDb();
    
    let scans;
    if (db) {
      scans = await db.collection('scans')
        .find({ userFeedback: { $exists: true } })
        .toArray();
    } else {
      scans = memoryStore.scans.filter(s => s.userFeedback);
    }
    
    return scans.map(s => new Scan(s));
  }

  /**
   * Get global statistics
   */
  static async getStats() {
    const db = getDb();
    
    if (db) {
      const stats = await db.collection('stats').findOne({ type: 'global' });
      return stats || {
        totalScans: 0,
        totalVulns: 0,
        accuracy: 0,
        falsePositivesPrevented: 0
      };
    }
    
    // Calculate from memory
    const scans = memoryStore.scans.filter(s => s.status === 'completed');
    const withFeedback = scans.filter(s => s.userFeedback);
    const correct = withFeedback.filter(s => 
      (s.userFeedback.isReal && s.findings.length > 0) ||
      (!s.userFeedback.isReal && s.findings.length === 0)
    );
    
    return {
      totalScans: scans.length,
      totalVulns: scans.reduce((sum, s) => sum + (s.findings?.length || 0), 0),
      accuracy: withFeedback.length > 0 ? (correct / withFeedback.length) * 100 : 0,
      falsePositivesPrevented: withFeedback.filter(s => !s.userFeedback.isReal).length,
      lastUpdated: new Date()
    };
  }

  /**
   * Update global statistics
   */
  static async updateStats() {
    const stats = await Scan.getStats();
    const db = getDb();
    
    if (db) {
      await db.collection('stats').updateOne(
        { type: 'global' },
        { $set: stats },
        { upsert: true }
      );
    } else {
      memoryStore.stats = stats;
    }
    
    return stats;
  }

  /**
   * Delete old scans (cleanup)
   */
  static async deleteOld(days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    const db = getDb();
    
    if (db) {
      await db.collection('scans').deleteMany({
        timestamp: { $lt: cutoff }
      });
    } else {
      memoryStore.scans = memoryStore.scans.filter(s => 
        new Date(s.timestamp) > cutoff
      );
    }
  }

  /**
   * Convert to plain object
   */
  toJSON() {
    return {
      id: this.id,
      repo: this.repo,
      prNumber: this.prNumber,
      filename: this.filename,
      language: this.language,
      code: this.code,
      codeHash: this.codeHash,
      findings: this.findings,
      rawFindings: this.rawFindings,
      patternFindings: this.patternFindings,
      llmFindings: this.llmFindings,
      llmProvider: this.llmProvider,
      llmModel: this.llmModel,
      timestamp: this.timestamp,
      scanDuration: this.scanDuration,
      userFeedback: this.userFeedback,
      accuracyScore: this.accuracyScore,
      status: this.status,
      error: this.error
    };
  }
}

module.exports = Scan;
