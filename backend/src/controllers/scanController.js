const ScannerService = require('../services/scannerService');
const logger = require('../utils/logger');

class ScanController {

  // =====================================================
  // MANUAL SCAN (Frontend "Scan for Vulnerabilities" button)
  // POST /api/scan
  // =====================================================
  async manualScan(req, res) {

    try {

      const {
        code,
        filename,
        language,
        repo,
        prNumber
      } = req.body;

      // Validate input
      if (!code) {

        return res.status(400).json({
          success: false,
          error: "Code is required"
        });

      }

      const safeFilename =
        filename || "input.js";

      const safeLanguage =
        language || "javascript";

      const safeRepo =
        repo || "manual";

      const safePrNumber =
        prNumber || null;

      logger.info("Manual scan requested", {
        filename: safeFilename,
        language: safeLanguage
      });

      const scan =
        await ScannerService.scanCode(
          code,
          safeFilename,
          safeRepo,
          safePrNumber,
          safeLanguage
        );

      return res.status(200).json({
        success: true,
        scan
      });

    }
    catch (error) {

      logger.error(
        "Manual scan failed",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: error.message
      });

    }

  }

  // =====================================================
  // GET ALL SCANS
  // GET /api/scan
  // =====================================================
  async getScans(req, res) {

    try {

      const limit =
        parseInt(req.query.limit) || 50;

      const scans =
        await ScannerService.getAllScans(limit);

      const stats =
        await ScannerService.getStats();

      return res.status(200).json({

        success: true,
        scans,
        stats,
        count: scans.length

      });

    }
    catch (error) {

      logger.error(
        "Get scans failed",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: error.message
      });

    }

  }

  // =====================================================
  // GET SINGLE SCAN
  // GET /api/scan/:id
  // =====================================================
  async getScan(req, res) {

    try {

      const { id } = req.params;

      if (!id) {

        return res.status(400).json({
          success: false,
          error: "Scan ID required"
        });

      }

      const scan =
        await ScannerService.getScanById(id);

      if (!scan) {

        return res.status(404).json({
          success: false,
          error: "Scan not found"
        });

      }

      return res.status(200).json({
        success: true,
        scan
      });

    }
    catch (error) {

      logger.error(
        "Get scan failed",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: error.message
      });

    }

  }

  // =====================================================
  // GET SCAN STATS
  // GET /api/scan/stats
  // =====================================================
  async getStats(req, res) {

    try {

      const stats =
        await ScannerService.getStats();

      return res.status(200).json({
        success: true,
        stats
      });

    }
    catch (error) {

      logger.error(
        "Get stats failed",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: error.message
      });

    }

  }

}

module.exports = new ScanController();