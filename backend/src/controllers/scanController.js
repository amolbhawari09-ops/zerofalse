const ScannerService = require('../services/scannerService');
const logger = require('../utils/logger');

// =====================================================
// EXPORTED CONTROLLER (Functional Object)
// =====================================================

module.exports = {
  // POST /api/scan
  manualScan: async (req, res) => {
    try {
      const { code, filename, language, repo, prNumber } = req.body;

      if (!code) {
        return res.status(400).json({ success: false, error: "Code is required" });
      }

      logger.info(`🔍 Manual scan requested for: ${filename || "input.js"}`);

      // Call functional ScannerService
      const scan = await ScannerService.scanCode(
        code,
        filename || "input.js",
        repo || "manual",
        prNumber || null,
        language || "javascript"
      );

      return res.status(200).json({ success: true, scan });
    } catch (error) {
      logger.error("Manual scan failed:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  // GET /api/scan
  getScans: async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      
      // These calls rely on the now-functional ScannerService
      const scans = await ScannerService.getAllScans ? 
                    await ScannerService.getAllScans(limit) : [];
      
      const stats = await ScannerService.getStats();

      return res.status(200).json({
        success: true,
        scans,
        stats,
        count: scans.length
      });
    } catch (error) {
      logger.error("Get scans failed:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  // GET /api/scan/:id
  getScan: async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ success: false, error: "ID required" });

      const scan = await ScannerService.getScanById ? 
                   await ScannerService.getScanById(id) : null;

      if (!scan) return res.status(404).json({ success: false, error: "Scan not found" });

      return res.status(200).json({ success: true, scan });
    } catch (error) {
      logger.error("Get scan failed:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  // GET /api/scan/stats
  getStats: async (req, res) => {
    try {
      const stats = await ScannerService.getStats();
      return res.status(200).json({ success: true, stats });
    } catch (error) {
      logger.error("Get stats failed:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
};
