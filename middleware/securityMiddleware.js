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
      connectSrc: [
        "'self'",
        "https://kanish08.app.n8n.cloud",
        "https://deep-research-assistant-rag.vercel.app",
        "https://dra-backend-z8sd.onrender.com",
      ],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny',
  },
});

/**
 * Returns the list of allowed CORS origins.
 * Always includes the hardcoded production Vercel URL so the app works
 * even if the CLIENT_ORIGIN env var is missing on Render.
 */
const getAllowedOrigins = () => {
  const clientOrigin = process.env.CLIENT_ORIGIN || '';
  const nodeEnv = process.env.NODE_ENV || 'development';

  // These are always allowed — hardcoded as a safety net
  const origins = [
    'https://deep-research-assistant-rag.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ];

  // Also add whatever is set in the env var (handles custom domains / preview URLs)
  if (clientOrigin && !origins.includes(clientOrigin)) {
    origins.push(clientOrigin);
  }

  logger.info('CORS allowed origins configured', {
    environment: nodeEnv,
    totalOrigins: origins.length,
  });

  return origins;
};

const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowed = getAllowedOrigins();

    // Allow requests with no origin (Render health checks, mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (allowed.includes(origin)) {
      return callback(null, true);
    }

    // In development, allow all localhost variants
    if (
      process.env.NODE_ENV !== 'production' &&
      (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))
    ) {
      return callback(null, true);
    }

    logger.warn('CORS blocked origin', { origin });
    callback(new Error(`CORS policy: origin ${origin} is not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
  credentials: true,
  maxAge: 3600,
  optionsSuccessStatus: 200,
});

/**
 * General API rate limiting — raised limits for production
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 300 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`, { path: req.path });
    res.status(options.statusCode).send(options.message);
  },
});

/**
 * Strict rate limiting for authentication (prevent brute force)
 */
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: {
    success: false,
    message: 'Too many login or signup attempts. Please try again after an hour.',
  },
});

/**
 * Chat/RAG specific rate limiting
 */
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // raised from 5 — avoids hitting limit during normal use
  message: {
    success: false,
    message: 'Deep Research Assistant rate limit: Maximum 10 queries per minute.',
  },
});

/**
 * Upload specific rate limiting
 */
const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'Upload frequency limit reached. Please wait a few minutes.',
  },
});

module.exports = {
  securityHeaders,
  corsMiddleware,
  apiLimiter,
  authLimiter,
  chatLimiter,
  uploadLimiter,
};