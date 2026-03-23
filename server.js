// ./backend/server.js

const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

// Load environment variables as first thing
dotenv.config();

// Import validators for env check
const { validateEnvVariables } = require('./utils/validators');
const logger = require('./utils/logger');

// Validate required environment variables
try {
  validateEnvVariables();
} catch (error) {
  logger.error('Environment validation failed:', error.message);
  process.exit(1);
}

// Import middleware & utilities
const {
  securityHeaders,
  corsMiddleware,
  apiLimiter
} = require('./middleware/securityMiddleware');
const {
  errorHandler,
  notFound,
  asyncHandler
} = require('./middleware/errorMiddleware');

// Import routes
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const contactRoutes = require('./routes/contactRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

// Import database connection
const connectDB = require('./config/db');

// Initialize Express app
const app = express();

// ============================================================
// ENVIRONMENT SETUP
// ============================================================
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 5000;

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
// ============================================================
app.use(securityHeaders); // Helmet security headers
app.use(corsMiddleware); // CORS configuration
app.use(apiLimiter); // General rate limiting

// ============================================================
// LOGGING MIDDLEWARE
// ============================================================
const morganFormat = NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(
  morgan(morganFormat, {
    stream: {
      write: (message) => {
        // Log HTTP requests
        logger.info(message.trim());
      }
    }
  })
);

// ============================================================
// BODY PARSER & REQUEST MIDDLEWARE
// ============================================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Add request metadata
app.use((req, res, next) => {
  req.startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    logger.debug(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ============================================================
// HEALTH CHECK ENDPOINTS
// ============================================================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    uptime: process.uptime()
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'Deep Research Assistant Backend API Online',
    version: '2.0.0',
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// N8N DEBUG ENDPOINT — remove after fixing
// ============================================================
app.get('/debug/n8n', async (req, res) => {
  const axios = require('axios');
  const uploadWebhook = process.env.N8N_UPLOAD_WEBHOOK;
  const chatWebhook = process.env.N8N_CHAT_WEBHOOK;

  const results = { uploadWebhook, chatWebhook, tests: {} };

  try {
    await axios.get(uploadWebhook.replace('/webhook/', '/').split('/upload')[0], { timeout: 3000 });
    results.tests.n8n_reachable = 'YES';
  } catch (e) {
    results.tests.n8n_reachable = `NO — ${e.code || e.message}`;
  }

  try {
    // Send a tiny test ping to upload webhook
    const FormData = require('form-data');
    const fd = new FormData();
    fd.append('test', 'ping');
    await axios.post(uploadWebhook, fd, { headers: fd.getHeaders(), timeout: 5000 });
    results.tests.upload_webhook = 'REACHABLE ✅';
  } catch (e) {
    results.tests.upload_webhook = e.response
      ? `HTTP ${e.response.status} — webhook exists but rejected test ping (expected)`
      : `UNREACHABLE ❌ — ${e.code || e.message}`;
  }

  res.json(results);
});

// ============================================================
// API ROUTES (v1 VERSIONING)
// ============================================================
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/uploads', uploadRoutes);
app.use('/api/v1/contact', contactRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

// Backward compatibility - route old endpoints to v1
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/uploads', uploadRoutes); 
app.use('/api/analytics', analyticsRoutes);

// ============================================================
// ERROR HANDLING
// ============================================================
// 404 handler - must be before error handler
app.use(notFound);

// Global error handling middleware - must be last
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

    if (global.db) {
      try {
        await global.db.disconnect();
        logger.info('Database disconnected');
      } catch (error) {
        logger.error('Error disconnecting database:', error.message);
      }
    }

    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================================
// UNHANDLED REJECTIONS & EXCEPTIONS
// ============================================================
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

module.exports = app;