/**
 * Clerk Authentication Middleware
 * Verifies JWT tokens from Clerk
 */

const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const logger = require('../utils/logger');

// Create JWKS client
const client = jwksClient({
    jwksUri: `${process.env.CLERK_ISSUER}/.well-known/jwks.json`,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 86400000 // 24 hours
});

/**
 * Get signing key from JWKS
 */
function getKey(header, callback) {
    client.getSigningKey(header.kid, (err, key) => {
        if (err) {
            logger.error('Error getting signing key:', err);
            return callback(err);
        }
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
}

/**
 * Extract token from request
 * Checks cookies first, then Authorization header
 */
function extractToken(req) {
    // Check cookies first
    if (req.cookies && req.cookies.__session) {
        return req.cookies.__session;
    }
    
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    
    return null;
}

/**
 * Main authentication middleware
 */
function clerkAuth(req, res, next) {
    try {
        const token = extractToken(req);
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Authentication required',
                code: 'NO_TOKEN'
            });
        }
        
        jwt.verify(token, getKey, {
            algorithms: ['RS256'],
            issuer: process.env.CLERK_ISSUER,
            audience: process.env.CLERK_PUBLISHABLE_KEY
        }, (err, decoded) => {
            if (err) {
                logger.error('Token verification failed:', err.message);
                return res.status(401).json({ 
                    success: false, 
                    error: 'Invalid or expired token',
                    code: 'INVALID_TOKEN'
                });
            }
            
            // Attach user info to request
            req.user = {
                id: decoded.sub,
                clerkId: decoded.sub,
                email: decoded.email || decoded.email_address,
                firstName: decoded.first_name,
                lastName: decoded.last_name,
                imageUrl: decoded.image_url
            };
            
            next();
        });
    } catch (error) {
        logger.error('Auth middleware error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Authentication error' 
        });
    }
}

/**
 * Optional auth - attaches user if token exists, but doesn't require it
 */
function optionalAuth(req, res, next) {
    const token = extractToken(req);
    
    if (!token) {
        return next();
    }
    
    jwt.verify(token, getKey, {
        algorithms: ['RS256'],
        issuer: process.env.CLERK_ISSUER,
        audience: process.env.CLERK_PUBLISHABLE_KEY
    }, (err, decoded) => {
        if (!err && decoded) {
            req.user = {
                id: decoded.sub,
                clerkId: decoded.sub,
                email: decoded.email || decoded.email_address,
                firstName: decoded.first_name,
                lastName: decoded.last_name,
                imageUrl: decoded.image_url
            };
        }
        next();
    });
}

module.exports = {
    clerkAuth,
    optionalAuth
};
