// ./backend/controllers/authController.js

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { createErrors } = require('../utils/errorHandler');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { isValidEmail } = require('../utils/validators');
const logger = require('../utils/logger');

/**
 * Generate JWT Token
 */
const generateToken = (id, role = 'user') => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '24h',
    issuer: 'deep-research-assistant',
    audience: 'users'
  });
};

/**
 * Register a new user
 * POST /api/v1/auth/signup
 */
exports.signup = asyncHandler(async (req, res, next) => {
  const { name, email, password, passwordConfirm } = req.body;

  // Validation
  if (!name || !email || !password) {
    return next(createErrors.badRequest('Name, email, and password are required'));
  }

  if (!isValidEmail(email)) {
    return next(createErrors.badRequest('Invalid email format'));
  }

  if (password.length < 8) {
    return next(createErrors.badRequest('Password must be at least 8 characters'));
  }

  if (password !== passwordConfirm) {
    return next(createErrors.badRequest('Passwords do not match'));
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    logger.warn('Signup attempt with existing email', { email });
    return next(createErrors.conflict('User with this email already exists'));
  }

  // Create user
  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase(),
    password
  });

  // Generate token
  const token = generateToken(user._id, user.role);

  logger.info('User registered successfully', { userId: user._id, email: user.email });

  res.status(201).json({
    success: true,
    statusCode: 201,
    message: 'User registered successfully',
    data: {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    }
  });
});

/**
 * Login user
 * POST /api/v1/auth/login
 */
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    return next(createErrors.badRequest('Email and password are required'));
  }

  if (!isValidEmail(email)) {
    return next(createErrors.badRequest('Invalid email format'));
  }

  // Find user
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) {
    logger.warn('Login attempt with non-existent user', { email });
    return next(createErrors.unauthorized('Invalid email or password'));
  }

  // Check if account is locked
  if (user.isAccountLocked()) {
    logger.warn('Login attempt to locked account', { userId: user._id });
    return next(createErrors.forbidden('Account is temporarily locked due to multiple failed login attempts'));
  }

  // Check if account is active
  if (!user.isActive) {
    logger.warn('Login attempt to inactive account', { userId: user._id });
    return next(createErrors.forbidden('This account has been deactivated'));
  }

  // Verify password
  const isPasswordCorrect = await user.matchPassword(password);
  if (!isPasswordCorrect) {
    await user.incrementLoginAttempts();
    logger.warn('Failed login attempt', { userId: user._id, loginAttempts: user.loginAttempts });

    if (user.isAccountLocked()) {
      return next(createErrors.forbidden('Account locked due to multiple failed login attempts'));
    }

    return next(createErrors.unauthorized('Invalid email or password'));
  }

  // Reset login attempts on successful login
  await user.resetLoginAttempts();

  // Generate token
  const token = generateToken(user._id, user.role);

  logger.info('User logged in successfully', { userId: user._id, email: user.email });

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Login successful',
    data: {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin
      }
    }
  });
});

/**
 * Refresh token
 * POST /api/v1/auth/refresh
 */
exports.refreshToken = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return next(createErrors.unauthorized('User not authenticated'));
  }

  const token = generateToken(req.user._id, req.user.role);

  res.status(200).json({
    success: true,
    data: { token }
  });
});

/**
 * Verify token
 * GET /api/v1/auth/verify
 */
exports.verifyToken = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return next(createErrors.unauthorized('Token is invalid or expired'));
  }

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      }
    }
  });
});
