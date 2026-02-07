const express = require('express');
const router = express.Router();
const FeedbackController = require('../controllers/feedbackController');

router.post('/', FeedbackController.submitFeedback.bind(FeedbackController));

module.exports = router;
