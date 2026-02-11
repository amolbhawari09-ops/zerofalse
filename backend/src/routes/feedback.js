const express = require('express');
const router = express.Router();
const FeedbackController = require('../controllers/feedbackController');

// =====================================================
// FEEDBACK ROUTES (Functional Pattern)
// =====================================================

// POST /api/feedback - Submits user confirmation/denial of vulnerabilities
router.post('/', async (req, res) => {
  // Direct execution removes the context trap and stops the reboot loop
  await FeedbackController.submitFeedback(req, res);
});

module.exports = router;
