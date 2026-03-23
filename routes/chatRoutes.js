const express = require('express');
const mongoose = require('mongoose');
const {
  sendMessage,
  getChatHistory,
  getChatById,
  updateFeedback,
  deleteChat,
  deleteSession,
} = require('../controllers/chatController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const { chatLimiter } = require('../middleware/securityMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Validates that a route param is a proper MongoDB ObjectId.
 * Used on chatId routes only — session IDs are UUIDs, not ObjectIds.
 */
const validateObjectId = (paramName = 'chatId') => {
  return (req, res, next) => {
    const id = req.params[paramName];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.warn('Invalid ObjectId received', {
        paramName,
        received: id,
        path: req.path,
      });

      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName}. Expected a MongoDB ObjectId but received: "${id}".`,
      });
    }
    next();
  };
};

// ── Chat message (guests allowed for demo) ───────────────────────────────────
router.post('/', optionalAuth, chatLimiter, sendMessage);

// ── History / management (auth required) ────────────────────────────────────
router.get('/history', protect, getChatHistory);

// NOTE: /session/:sessionId MUST be declared BEFORE /:chatId, otherwise Express
// matches "session" as the chatId param and validateObjectId rejects it.
router.delete('/session/:sessionId', protect, deleteSession);

router.get('/:chatId', protect, validateObjectId('chatId'), getChatById);
router.patch('/:chatId/feedback', protect, validateObjectId('chatId'), updateFeedback);
router.delete('/:chatId', protect, validateObjectId('chatId'), deleteChat);

module.exports = router;