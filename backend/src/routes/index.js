const express = require('express');
const router = express.Router();

// --- Existing Imports ---
const scanRoutes = require('./scan');
const feedbackRoutes = require('./feedback');
const webhookRoutes = require('./webhook');

// --- New Imports ---
const authRoutes = require('./auth');
const { clerkAuth } = require('../middleware/clerkAuth');

// --- Routes ---

router.use('/scan', scanRoutes);
router.use('/feedback', feedbackRoutes);

// New: Auth routes
router.use('/auth', authRoutes);

/* CRITICAL */
router.use('/webhook', webhookRoutes);

// New: Protected dashboard stats
router.get('/dashboard/stats', clerkAuth, async (req, res) => {
    try {
        const db = require('../config/database').getDB();
        
        const stats = await db.collection('scans').aggregate([
            { $match: { userId: req.user.clerkId } },
            {
                $group: {
                    _id: null,
                    prs: { $sum: 1 },
                    vulnerabilities: { 
                        $sum: { 
                            $cond: [{ $isArray: '$findings' }, { $size: '$findings' }, 0]
                        } 
                    },
                    repositories: { $addToSet: '$repo' }
                }
            }
        ]).toArray();
        
        const result = stats[0] || { prs: 0, vulnerabilities: 0, repositories: [] };
        
        res.json({
            success: true,
            stats: {
                prs: result.prs,
                vulnerabilities: result.vulnerabilities,
                repositories: result.repositories.length
            }
        });
    } catch (error) {
        // Changed 'logger' to 'console' to ensure it runs if logger isn't imported here
        console.error('Dashboard stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
