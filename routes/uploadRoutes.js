// ./backend/routes/uploadRoutes.js

const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const { uploadFile, getUploadHistory, getUploadById, deleteUpload } = require('../controllers/uploadController');
const { protect } = require('../middleware/authMiddleware');
const { uploadLimiter } = require('../middleware/securityMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

// Setup Multer — PDF only, stored in memory buffer
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      // Pass error as first arg — multer will attach it to req
      cb(new Error('Only PDF files are allowed for RAG ingestion'), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// All upload routes require a valid JWT
router.use(protect);

/**
 * Middleware to validate MongoDB ObjectId
 * Handles invalid IDs with helpful error messages
 */
const validateObjectId = (paramName = 'uploadId') => {
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
        message: `Invalid ${paramName}. Expected MongoDB ObjectId format, but received: "${id}". Please check if the ID is correct.`
      });
    }
    next();
  };
};

/**
 * Multer error handler middleware.
 * Multer throws synchronously inside fileFilter — this catches it BEFORE
 * the request reaches the controller, returning a clean 400 instead of 500.
 */
const handleMulterError = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Multer-specific errors (file size, unexpected field, etc.)
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 10 MB.',
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`,
      });
    }

    if (err) {
      // fileFilter rejection ("Only PDF files are allowed")
      return res.status(400).json({
        success: false,
        message: err.message || 'Invalid file type. Only PDF files are accepted.',
      });
    }

    // No error — file is on req.file, proceed to controller
    next();
  });
};

// Upload file with rate limiting + multer error handling
router.post('/', uploadLimiter, handleMulterError, uploadFile);

// Upload management
router.get('/', getUploadHistory);
router.get('/:uploadId', validateObjectId('uploadId'), getUploadById);
router.delete('/:uploadId', validateObjectId('uploadId'), deleteUpload);

module.exports = router;