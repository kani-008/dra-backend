const express = require('express');
const { sendMessage, getChatHistory, getChatById, updateFeedback, deleteChat, deleteSession } = require('../controllers/chatController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const { chatLimiter } = require('../middleware/securityMiddleware');

const router = express.Router();

/**
 * Chat Messaging - Open to both authenticated users and guests for demo
 */
router.post('/', optionalAuth, chatLimiter, sendMessage);

/**
 * Management Routes - Protected
 */
router.get('/history', protect, getChatHistory);
router.get('/:chatId', protect, getChatById);
router.patch('/:chatId/feedback', protect, updateFeedback);
router.delete('/:chatId', protect, deleteChat);
router.delete('/session/:sessionId', protect, deleteSession);

module.exports = router;
