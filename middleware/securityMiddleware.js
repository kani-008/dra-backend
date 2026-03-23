const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * Enterprise standard security headers
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https://kanish08.app.n8n.cloud", "https://deep-research-assistant-rag.vercel.app"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny',
  },
});

/**
 * Configure CORS for production and development
 * Allows requests from frontend and local development
 */
const getAllowedOrigins = () => {
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
  const nodeEnv = process.env.NODE_ENV || 'development';

  const origins = [
    clientOrigin,
    // Allow local development
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ];

  // In development, allow all localhost variants
  if (nodeEnv === 'development') {
    origins.push('http://localhost:*', 'http://127.0.0.1:*');
  }

  logger.info('CORS allowed origins configured', {
    environment: nodeEnv,
    primaryOrigin: clientOrigin,
    totalOrigins: origins.length,
  });

  return origins;
};

const corsMiddleware = cors({
  origin: getAllowedOrigins(),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
  credentials: true,
  maxAge: 3600, // 1 hour Preflight Cache
  optionsSuccessStatus: 200,
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
