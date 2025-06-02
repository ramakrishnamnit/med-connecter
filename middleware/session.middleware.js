const logger = require('../utils/logger');
const Session = require('../models/session.model');

const SESSION_EXPIRY = 30 * 60 * 1000; // 30 minutes in milliseconds
const REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds

const sessionMiddleware = async (req, res, next) => {
  try {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId) {
      return next();
    }

    const session = await Session.findById(sessionId);
    
    if (!session) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid session'
      });
    }

    const now = Date.now();
    const sessionAge = now - session.lastActivity;
    
    // Check if session is expired
    if (sessionAge > SESSION_EXPIRY) {
      await Session.findByIdAndDelete(sessionId);
      return res.status(401).json({
        status: 'error',
        message: 'Session expired'
      });
    }

    // Check if session needs refresh
    if (sessionAge > (SESSION_EXPIRY - REFRESH_THRESHOLD)) {
      // Extend session expiry
      session.lastActivity = now;
      await session.save();
      
      // Add refresh header to response
      res.setHeader('X-Session-Refresh', 'true');
    }

    // Update last activity
    session.lastActivity = now;
    await session.save();

    // Add session info to request
    req.session = session;
    next();
  } catch (error) {
    logger.error('Session middleware error:', error);
    next(error);
  }
};

module.exports = sessionMiddleware; 