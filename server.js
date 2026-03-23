// ./backend/server.js

const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

// Load environment variables first
dotenv.config();

const { validateEnvVariables } = require('./utils/validators');
const logger = require('./utils/logger');

try {
  validateEnvVariables();
} catch (error) {
  logger.error('Environment validation failed:', error.message);
  process.exit(1);
}

const {
  securityHeaders,
  corsMiddleware,
  apiLimiter,
} = require('./middleware/securityMiddleware');
const {
  errorHandler,
  notFound,
} = require('./middleware/errorMiddleware');

const authRoutes      = require('./routes/authRoutes');
const chatRoutes      = require('./routes/chatRoutes');
const uploadRoutes    = require('./routes/uploadRoutes');
const contactRoutes   = require('./routes/contactRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

const connectDB = require('./config/db');

const app = express();

// ============================================================
// ENVIRONMENT SETUP
// ============================================================
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT     = process.env.PORT || 5000;

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ============================================================
// DATABASE CONNECTION
// ============================================================
if (NODE_ENV !== 'test') {
  connectDB().catch((error) => {
    logger.error('Failed to connect to database:', error.message);
    process.exit(1);
  });
}

// ============================================================
// SECURITY MIDDLEWARE
// Must come before routes so CORS headers are set on every response,
// including the 404s that the notFound handler generates.
// ============================================================
app.use(securityHeaders);
app.use(corsMiddleware);

// ── Explicitly handle preflight OPTIONS requests ──────────────────────────────
// Some browsers (and the Vercel edge) send an OPTIONS preflight before POST/DELETE.
// Without this, the preflight gets a 404 from the notFound handler and the actual
// request is blocked by the browser's CORS check.
app.options('*', corsMiddleware);

app.use(apiLimiter);

// ============================================================
// LOGGING MIDDLEWARE
// ============================================================
const morganFormat = NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(
  morgan(morganFormat, {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// ============================================================
// BODY PARSER
// ============================================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  req.startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    logger.debug(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ============================================================
// HEALTH CHECK — must respond quickly so Render's health monitor
// doesn't think the instance is down during heavy n8n requests.
// ============================================================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    uptime: process.uptime(),
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'Deep Research Assistant Backend API Online',
    version: '2.1.0',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// API ROUTES — v1 only
// The legacy /api/* aliases were removed because they caused
// duplicate route registrations that broke rate limiting counters
// and made request logging ambiguous.
// The frontend api.js now always uses /api/v1/* paths.
// ============================================================
app.use('/api/v1/auth',      authRoutes);
app.use('/api/v1/chat',      chatRoutes);
app.use('/api/v1/uploads',   uploadRoutes);
app.use('/api/v1/contact',   contactRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

// ============================================================
// ERROR HANDLING
// ============================================================
app.use(notFound);
app.use(errorHandler);

// ============================================================
// START SERVER
// ============================================================
const server = app.listen(PORT, () => {
  logger.info(`🚀 Backend Server running on port ${PORT} in ${NODE_ENV} mode`);
  logger.info(`📚 API Documentation: http://localhost:${PORT}`);
  logger.info(`🏥 Health Check: http://localhost:${PORT}/health`);
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    logger.info('Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

module.exports = app;