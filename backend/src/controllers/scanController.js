const ScannerService = require('../services/scannerService');
const logger = require('../utils/logger');

class ScanController {
  async manualScan(req, res) {
    try {
      const { code, filename, language, repo, prNumber } = req.body;
      
      if (!code || !filename) {
        return res.status(400).json({ 
          error: 'Missing required fields: code, filename' 
        });
      }
      
      // Validate code length
      const maxLength = parseInt(process.env.MAX_CODE_LENGTH) || 50000;
      if (code.length > maxLength) {
        return res.status(400).json({
          error: `Code exceeds maximum length of ${maxLength} characters`
        });
      }
      
      const scan = await ScannerService.scanCode(
        code,
        filename,
        repo || 'manual-test',
        prNumber || 1,
        language || 'javascript'
      );
      
      res.json(scan);
      
    } catch (error) {
      logger.error('Manual scan error:', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
  
  async getScans(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const scans = await ScannerService.getAllScans(limit);
      const stats = await ScannerService.getStats();
      
      res.json({
        scans,
        stats,
        count: scans.length
      });
      
    } catch (error) {
      logger.error('Get scans error:', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
  
  async getScan(req, res) {
    try {
      const { id } = req.params;
      const scan = await ScannerService.getScan(id);
      
      if (!scan) {
        return res.status(404).json({ error: 'Scan not found' });
      }
      
      res.json(scan);
      
    } catch (error) {
      logger.error('Get scan error:', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new ScanController();
