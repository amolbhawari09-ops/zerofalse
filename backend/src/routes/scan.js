const express = require('express');
const router = express.Router();
const ScanController = require('../controllers/scanController');

// =====================================================
// SCAN ROUTES (Functional Pattern)
// =====================================================

// POST /api/scan - Triggered by the "Scan" button
router.post('/', async (req, res) => {
  // Direct execution stops the 'this' context crash
  await ScanController.manualScan(req, res);
});

// GET /api/scan - Fetch recent scan history
router.get('/', async (req, res) => {
  await ScanController.getScans(req, res);
});

// GET /api/scan/:id - Fetch details of a specific scan
router.get('/:id', async (req, res) => {
  await ScanController.getScan(req, res);
});

module.exports = router;
