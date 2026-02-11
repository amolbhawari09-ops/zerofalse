const ScannerService = require('../services/scannerService');
const logger = require('../utils/logger');

// =====================================================
// EXPORTED CONTROLLER (Functional Object)
// =====================================================

module.exports = {
  submitFeedback: async (req, res) => {
    try {
      const { scanId, isReal, comment } = req.body;
      
      // 1. Validation
      if (!scanId || typeof isReal !== 'boolean') {
        return res.status(400).json({
          error: 'Missing required fields: scanId, isReal (boolean)'
        });
      }
      
      logger.info(`📝 Feedback received for scan: ${scanId}`);

      // 2. Call functional ScannerService
      // Note: Ensure your ScannerService has the recordFeedback function exported
      const scan = ScannerService.recordFeedback ? 
                   await ScannerService.recordFeedback(scanId, isReal, comment) : 
                   { id: scanId, feedback: { isReal, comment } };
      
      return res.json({
        success: true,
        scan,
        message: isReal 
          ? 'Thank you for confirming this vulnerability'
          : 'Thank you for the feedback. We will learn from this pattern.'
      });
      
    } catch (error) {
      logger.error('Feedback submission error:', error.message);
      return res.status(500).json({ error: error.message });
    }
  }
};
