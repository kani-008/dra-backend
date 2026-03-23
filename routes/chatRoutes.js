const express = require('express');
const mongoose = require('mongoose');
const { sendMessage, getChatHistory, getChatById, updateFeedback, deleteChat, deleteSession } = require('../controllers/chatController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const { chatLimiter } = require('../middleware/securityMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Middleware to validate MongoDB ObjectId
 * Handles invalid IDs with helpful error messages
 */
const validateObjectId = (paramName = 'chatId') => {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    // Check if it's a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.warn('Invalid ObjectId received', {
        paramName,
        received: id,
        format: typeof id,
        path: req.path
      });
      
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName}. Expected MongoDB ObjectId format, but received: "${id}". Please ensure the ID is in the correct format.`
      });
    }
    next();
  };
};

/**
 * Chat Messaging - Open to both authenticated users and guests for demo
 */
router.post('/', optionalAuth, chatLimiter, sendMessage);

/**
 * Management Routes - Protected
 */
router.get('/history', protect, getChatHistory);
router.get('/:chatId', protect, validateObjectId('chatId'), getChatById);
router.patch('/:chatId/feedback', protect, validateObjectId('chatId'), updateFeedback);
router.delete('/:chatId', protect, validateObjectId('chatId'), deleteChat);
router.delete('/session/:sessionId', protect, validateObjectId('sessionId'), deleteSession);

module.exports = router;
