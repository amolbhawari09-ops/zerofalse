const express = require('express');
const router = express.Router();

const scanRoutes = require('./scan');
const feedbackRoutes = require('./feedback');
const webhookRoutes = require('./webhook');

router.use('/scan', scanRoutes);
router.use('/feedback', feedbackRoutes);

/*
CRITICAL FIX:
Do NOT add /webhook here
because webhook.js already contains /webhook/github
*/
router.use('/', webhookRoutes);

module.exports = router;