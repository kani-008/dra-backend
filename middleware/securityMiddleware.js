const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * Enterprise standard security headers
 */
const securityHeaders = helmet();

/**
 * Configure CORS for restricted domain access
 */
const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      "http://localhost:5173",
      process.env.FRONTEND_URL
    ];

    // Allow requests with no origin (like Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed"));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 3600
});

/**
 * General API rate limiting
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes.'
  },
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`, { path: req.path });
    res.status(options.statusCode).send(options.message);
  }
});

/**
 * Strict rate limiting for authentication (prevent brute force)
 */
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 signup/login attempts per hour
  message: {
    success: false,
    message: 'Too many login or signup attempts. Please try again after an hour.'
  }
});

/**
 * Chat/RAG specific rate limiting (cost control)
 */
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // 5 AI queries per minute per IP
  message: {
    success: false,
    message: 'Deep Research Assistant rate limit: Maximum 5 queries per minute.'
  }
});

/**
 * Upload specific rate limiting
 */
const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100, // 🔥 increase for dev
  message: {
    success: false,
    message: 'Upload frequency limit reached. Please wait a few minutes.'
  }
});

module.exports = {
  securityHeaders,
  corsMiddleware,
  apiLimiter,
  authLimiter,
  chatLimiter,
  uploadLimiter
};
