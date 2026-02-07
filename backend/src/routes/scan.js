const express = require('express');
const router = express.Router();
const ScanController = require('../controllers/scanController');

router.post('/', ScanController.manualScan.bind(ScanController));
router.get('/', ScanController.getScans.bind(ScanController));
router.get('/:id', ScanController.getScan.bind(ScanController));

module.exports = router;
