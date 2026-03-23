const logger = require('./logger');

/**
 * Standard enterprise email validation
 */
const isValidEmail = (email) => {
  const re = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  return re.test(String(email).toLowerCase());
};

/**
 * Validates required environment variables for the core system
 */
const validateEnvVariables = () => {
  const required = [
    'PORT',
    'MONGO_URI',
    'JWT_SECRET',
    'N8N_CHAT_WEBHOOK',
    'N8N_UPLOAD_WEBHOOK'
  ];

  const missing = required.filter((env) => !process.env[env]);

  if (missing.length > 0) {
    const errorMsg = `CRITICAL: Missing required environment variables: ${missing.join(', ')}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  logger.info('Environment variables successfully validated');
};

module.exports = {
  isValidEmail,
  validateEnvVariables
};
