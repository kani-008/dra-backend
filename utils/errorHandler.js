/**
 * Standard Operational Error class
 */
class ErrorHandler extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // Distinguish operational errors from programming bugs
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Factory for creating enterprise-standard error responses
 */
const createErrors = {
  // 400 - Bad Request
  badRequest: (message = 'Bad Request') => new ErrorHandler(message, 400),
  
  // 401 - Unauthorized
  unauthorized: (message = 'Unauthorized access. Please log in.') => new ErrorHandler(message, 401),
  
  // 403 - Forbidden
  forbidden: (message = 'Access denied. You do not have permissions.') => new ErrorHandler(message, 403),
  
  // 404 - Not Found
  notFound: (message = 'The requested resource was not found') => new ErrorHandler(message, 404),
  
  // 409 - Conflict
  conflict: (message = 'Conflict with the current state of resources') => new ErrorHandler(message, 409),
  
  // 500 - Server Error
  serverError: (message = 'Internal server error occurred') => new ErrorHandler(message, 500),
  
  // 503 - Service Unavailable
  serviceUnavailable: (message = 'Service is temporarily unavailable') => new ErrorHandler(message, 503)
};

module.exports = { ErrorHandler, createErrors };
