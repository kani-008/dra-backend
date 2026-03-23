// ./backend/routes/analyticsRoutes.js
const express = require('express');
const router = express.Router();
const { getUserAnalytics } = require('../controllers/analyticsController');
const { protect } = require('../middleware/authMiddleware');

/**
 * All analytics routes require authentication
 * User stats, activity, and historical logs
 */
router.get('/', protect, getUserAnalytics);

module.exports = router;
