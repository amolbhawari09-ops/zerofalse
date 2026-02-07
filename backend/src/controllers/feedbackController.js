const ScannerService = require('../services/scannerService');
const logger = require('../utils/logger');

class FeedbackController {
  async submitFeedback(req, res) {
    try {
      const { scanId, isReal, comment } = req.body;
      
      if (!scanId || typeof isReal !== 'boolean') {
        return res.status(400).json({
          error: 'Missing required fields: scanId, isReal (boolean)'
        });
      }
      
      const scan = await ScannerService.recordFeedback(scanId, isReal, comment);
      
      res.json({
        success: true,
        scan,
        message: isReal 
          ? 'Thank you for confirming this vulnerability'
          : 'Thank you for the feedback. We will learn from this pattern.'
      });
      
    } catch (error) {
      logger.error('Feedback error:', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new FeedbackController();
