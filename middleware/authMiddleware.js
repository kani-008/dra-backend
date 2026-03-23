// ./backend/middleware/authMiddleware.js

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { createErrors } = require('../utils/errorHandler');
const logger = require('../utils/logger');

/**
 * Fixed Authentication Middleware
 * Issue: Previous version had logic flaw - would send response even after calling next()
 * Solution: Added early return after next(), proper error handling flow
 */
const protect = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return next(createErrors.unauthorized('No token provided. Please log in.'));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to request
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return next(createErrors.unauthorized('User not found'));
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid token attempted', { error: error.message });
      return next(createErrors.unauthorized('Invalid token'));
    }
    if (error.name === 'TokenExpiredError') {
      logger.warn('Expired token used', { expiredAt: error.expiredAt });
      return next(createErrors.unauthorized('Token expired. Please log in again.'));
    }
    logger.error('Auth middleware error', { error: error.message });
    return next(createErrors.serverError('Authentication error'));
  }
};

/**
 * Role-Based Authorization Middleware
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(createErrors.unauthorized('User not authenticated'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Unauthorized role access attempt', {
        userId: req.user._id,
        requiredRole: allowedRoles,
        userRole: req.user.role
      });
      return next(createErrors.forbidden(`Access denied. Required roles: ${allowedRoles.join(', ')}`));
    }

    next();
  };
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      req.user = user || null;
    }
  } catch (error) {
    logger.debug('Optional auth failed', { error: error.message });
  }
  next();
};

/**
 * Helper function to extract token from various sources
 */
const extractToken = (req) => {
  // Check Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.substring(7);
  }

  // Check cookies (for future enhancement)
  if (req.cookies?.token) {
    return req.cookies.token;
  }

  // Check query string (not recommended for production, but useful for testing)
  if (req.query.token) {
    return req.query.token;
  }

  return null;
};

module.exports = {
  protect,
  authorize,
  optionalAuth,
  extractToken
};
