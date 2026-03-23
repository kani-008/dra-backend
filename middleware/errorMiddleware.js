const { ErrorHandler } = require('../utils/errorHandler');
const logger = require('../utils/logger');

/**
 * Higher-order function to catch async errors in routes
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Handle 404 - Not Found
 */
const notFound = (req, res, next) => {
  const error = new ErrorHandler(`Not Found - ${req.originalUrl}`, 404);
  next(error);
};

/**
 * Standard enterprise global error handler
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log detailed error for system admins
  const isProd = process.env.NODE_ENV === 'production';
  const logMsg = `${err.name}: ${err.message} stack: ${isProd ? '[REDACTED]' : err.stack}`;
  logger.error(logMsg, { 
    path: req.path, 
    method: req.method, 
    statusCode: err.statusCode || 500 
  });

  // Specific Error Type Handling
  // Mongoose Cast Error (Bad ID)
  if (err.name === 'CastError') {
    const message = `Resource not found. Invalid: ${err.path}`;
    error = new ErrorHandler(message, 404);
  }

  // Mongoose Duplicate Key Error
  if (err.code === 11000) {
    const message = `Duplicate field value entered. Please check your data.`;
    error = new ErrorHandler(message, 409);
  }

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error = new ErrorHandler(message, 400);
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    const message = `Invalid token. Please log in again.`;
    error = new ErrorHandler(message, 401);
  }

  if (err.name === 'TokenExpiredError') {
    const message = `Token expired. Please log in again.`;
    error = new ErrorHandler(message, 401);
  }

  const statusCode = error.statusCode || 500;
  const errorResponse = {
    success: false,
    statusCode: statusCode,
    message: error.message || 'Server Error. Internal server fault.',
  };

  // Add stack trace in development
  if (!isProd) {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
};

module.exports = {
  asyncHandler,
  notFound,
  errorHandler
};
