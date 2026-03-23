// ./backend/routes/authRoutes.js

const express = require('express');
const { login, signup, refreshToken, verifyToken } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/securityMiddleware');

const router = express.Router();

// Auth endpoints with rate limiting
router.post('/signup', authLimiter, signup);
router.post('/login', authLimiter, login);
router.post('/refresh', protect, refreshToken);
router.get('/verify', protect, verifyToken);

module.exports = router;
