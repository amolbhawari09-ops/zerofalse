/**
 * Auth Controller
 * Handles user synchronization and profile
 */

const logger = require('../utils/logger');
const { getDB } = require('../config/database');

/**
 * Sync user from Clerk to our database
 * Called when user signs in
 */
async function syncUser(req, res) {
    try {
        const { clerkId, email, firstName, lastName, imageUrl } = req.body;
        
        if (!clerkId || !email) {
            return res.status(400).json({
                success: false,
                error: 'clerkId and email are required'
            });
        }
        
        const db = getDB();
        const usersCollection = db.collection('users');
        
        // Check if user exists
        let user = await usersCollection.findOne({ clerkId });
        
        if (user) {
            // Update existing user
            await usersCollection.updateOne(
                { clerkId },
                {
                    $set: {
                        email,
                        firstName: firstName || user.firstName,
                        lastName: lastName || user.lastName,
                        imageUrl: imageUrl || user.imageUrl,
                        lastLoginAt: new Date(),
                        updatedAt: new Date()
                    }
                }
            );
            
            logger.info(`User updated: ${email}`);
        } else {
            // Create new user
            user = {
                clerkId,
                email,
                firstName: firstName || '',
                lastName: lastName || '',
                imageUrl: imageUrl || '',
                createdAt: new Date(),
                lastLoginAt: new Date(),
                plan: 'free',
                scanCount: 0,
                repositories: [],
                settings: {
                    notifications: true,
                    autoScan: true
                }
            };
            
            await usersCollection.insertOne(user);
            logger.info(`New user created: ${email}`);
        }
        
        // Get updated user
        const updatedUser = await usersCollection.findOne({ clerkId });
        
        res.json({
            success: true,
            user: {
                id: updatedUser._id,
                clerkId: updatedUser.clerkId,
                email: updatedUser.email,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                imageUrl: updatedUser.imageUrl,
                plan: updatedUser.plan,
                scanCount: updatedUser.scanCount
            }
        });
        
    } catch (error) {
        logger.error('Sync user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync user'
        });
    }
}

/**
 * Get current user profile
 */
async function getProfile(req, res) {
    try {
        const db = getDB();
        const user = await db.collection('users').findOne(
            { clerkId: req.user.clerkId },
            { 
                projection: { 
                    _id: 0, 
                    clerkId: 1, 
                    email: 1, 
                    firstName: 1, 
                    lastName: 1, 
                    imageUrl: 1, 
                    plan: 1, 
                    scanCount: 1,
                    createdAt: 1 
                } 
            }
        );
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        res.json({
            success: true,
            user
        });
        
    } catch (error) {
        logger.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get profile'
        });
    }
}

/**
 * Check authentication status
 */
async function checkAuth(req, res) {
    // If middleware passed, user is authenticated
    res.json({
        success: true,
        authenticated: true,
        user: req.user
    });
}

module.exports = {
    syncUser,
    getProfile,
    checkAuth
};
