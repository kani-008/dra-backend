// ./backend/controllers/chatController.js

const Chat = require('../models/Chat');
const { sendChatToN8n } = require('../services/n8nService');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { createErrors } = require('../utils/errorHandler');
const logger = require('../utils/logger');

/**
 * Send chat message with session context
 * POST /api/v1/chat
 * Enhanced: Includes previous chat context for better RAG responses
 */
exports.sendMessage = asyncHandler(async (req, res, next) => {
  const { message, sessionId } = req.body;
  const isGuest = !req.user;

  // Validation
  if (!message || message.trim().length === 0) {
    return next(createErrors.badRequest('Message cannot be empty'));
  }

  try {
    const startTime = Date.now();
    
    // Identity: For guests, the sessionId IS the primary unique identifier for isolation
    const userIdStr = isGuest ? `guest-${sessionId || 'demo'}` : req.user._id.toString();

    // Get previous chat context strictly isolated to THIS session
    const previousChats = (!isGuest && sessionId)
      ? await Chat.getSessionContext(req.user._id, sessionId, 8) // Limit to 8 for deep context
      : [];

    // Send to n8n with context and strict RAG instructions
    const n8nResponse = await sendChatToN8n(message, previousChats, {
      userId: userIdStr,
      sessionId: sessionId || 'demo-session',
      systemInstructions: "Answer ONLY using the provided document context. If the answer is not contained within the documents, state that you cannot find the information in the current research context. Do not use general knowledge.",
      isGuest,
      strictRAG: true
    });

    // Extract answer
    let answer = "I'm sorry, I'm having trouble connecting to my research engine right now.";
    if (n8nResponse.success) {
      const raw = n8nResponse.data;
      if (typeof raw === 'string') answer = raw.trim();
      else if (typeof raw === 'object' && raw !== null) {
        answer = raw.output || raw.answer || raw.response || raw.text || raw.message || JSON.stringify(raw);
      }
    } else if (n8nResponse.fallback) {
      answer = n8nResponse.message;
    }

    let chatId = null;
    let finalSessionId = sessionId || (isGuest ? 'demo-' + Date.now() : Date.now().toString());

    // Store in DB ONLY if authenticated
    if (!isGuest) {
      const chatEntry = await Chat.create({
        userId: req.user._id,
        sessionId: finalSessionId,
        question: message.trim(),
        answer: answer,
        metadata: { processingTime: n8nResponse.processingTime, model: 'n8n-rag' },
        status: n8nResponse.success ? 'completed' : 'failed'
      });
      chatId = chatEntry._id;
      finalSessionId = chatEntry.sessionId;
      
      logger.info('Chat message saved to cloud', { userId: req.user._id, chatId });
    } else {
      logger.info('Guest demo message processed (not saved)', { sessionId: finalSessionId });
    }

    const totalTime = Date.now() - startTime;

    res.status(200).json({
      success: true,
      message: isGuest ? 'Guest demo response generated' : 'Message processed successfully',
      data: {
        response: answer,
        chatId,
        sessionId: finalSessionId,
        processingTime: totalTime,
        isGuest,
        warning: isGuest ? 'This is a demo session. Register to save your research history.' : null
      }
    });
  } catch (error) {
    logger.error('Chat processing error', { userId: isGuest ? 'GUEST' : req.user?._id, error: error.message });
    return next(createErrors.serverError('Failed to process research query'));
  }
});

/**
 * Get chat history with pagination
 * GET /api/v1/chat/history?page=1&limit=20&sessionId=xxx
 */
exports.getChatHistory = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20, sessionId } = req.query;

  try {
    const history = await Chat.getChatHistory(req.user._id, parseInt(page), parseInt(limit), sessionId);

    logger.info('Chat history retrieved', {
      userId: req.user._id,
      page,
      limit,
      count: history.data.length
    });

    res.status(200).json({
      success: true,
      data: history.data,
      pagination: history.pagination
    });
  } catch (error) {
    logger.error('Error retrieving chat history', { error: error.message });
    return next(createErrors.serverError('Failed to retrieve chat history'));
  }
});

/**
 * Get single chat by ID
 * GET /api/v1/chat/:chartId
 */
exports.getChatById = asyncHandler(async (req, res, next) => {
  const { chatId } = req.params;

  const chat = await Chat.findOne({
    _id: chatId,
    userId: req.user._id
  });

  if (!chat) {
    return next(createErrors.notFound('Chat message not found'));
  }

  res.status(200).json({
    success: true,
    data: chat
  });
});

/**
 * Update chat feedback/rating
 * PATCH /api/v1/chat/:chatId/feedback
 */
exports.updateFeedback = asyncHandler(async (req, res, next) => {
  const { chatId } = req.params;
  const { rating, comment, isAccurate } = req.body;

  // Validate rating
  if (rating && (rating < 1 || rating > 5)) {
    return next(createErrors.badRequest('Rating must be between 1 and 5'));
  }

  const chat = await Chat.findOneAndUpdate(
    { _id: chatId, userId: req.user._id },
    {
      feedback: {
        rating,
        comment,
        isAccurate,
        flaggedAt: isAccurate === false ? Date.now() : null
      }
    },
    { new: true }
  );

  if (!chat) {
    return next(createErrors.notFound('Chat message not found'));
  }

  logger.info('Chat feedback updated', {
    chatId,
    userId: req.user._id,
    rating
  });

  res.status(200).json({
    success: true,
    message: 'Feedback updated successfully',
    data: chat
  });
});

/**
 * Delete a single chat message
 * DELETE /api/v1/chat/:chatId
 */
exports.deleteChat = asyncHandler(async (req, res, next) => {
  const { chatId } = req.params;

  const chat = await Chat.findOneAndDelete({
    _id: chatId,
    userId: req.user._id
  });

  if (!chat) {
    return next(createErrors.notFound('Chat message not found'));
  }

  logger.info('Chat message deleted', { chatId, userId: req.user._id });

  res.status(200).json({
    success: true,
    message: 'Message deleted successfully'
  });
});

/**
 * Delete entire session history
 * DELETE /api/v1/chat/session/:sessionId
 */
exports.deleteSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;

  const result = await Chat.deleteMany({
    userId: req.user._id,
    sessionId: sessionId
  });

  if (result.deletedCount === 0) {
    return next(createErrors.notFound('Session not found or already deleted'));
  }

  logger.info('Chat session deleted from cloud', { sessionId, userId: req.user._id, deletedCount: result.deletedCount });

  res.status(200).json({
    success: true,
    message: `Session deleted successfully. ${result.deletedCount} items removed.`,
    data: { deletedCount: result.deletedCount }
  });
});