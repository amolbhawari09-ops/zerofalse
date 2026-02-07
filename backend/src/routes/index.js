const express = require('express');
const router = express.Router();

const scanRoutes = require('./scan');
const feedbackRoutes = require('./feedback');
const webhookRoutes = require('./webhook');

router.use('/scan', scanRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/webhook', webhookRoutes);

module.exports = router;
