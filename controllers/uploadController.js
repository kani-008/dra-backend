// ./backend/controllers/uploadController.js

const { sendFileToN8n, deleteFileFromN8n, deleteFileByNameFromN8n } = require('../services/n8nService');
const Upload = require('../models/Upload');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { createErrors } = require('../utils/errorHandler');
const logger = require('../utils/logger');

/**
 * Upload PDF file for RAG ingestion
 * POST /api/v1/uploads
 */
exports.uploadFile = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(createErrors.badRequest('No file uploaded. Please attach a PDF.'));
  }
  if (req.file.mimetype !== 'application/pdf') {
    return next(createErrors.badRequest('Only PDF files are allowed'));
  }
  if (req.file.size > 10 * 1024 * 1024) {
    return next(createErrors.badRequest('File size exceeds 10MB limit'));
  }

  try {
    const startTime = Date.now();

    const upload = await Upload.create({
      userId:       req.user._id,
      filename:     `${Date.now()}-${req.file.originalname}`,
      originalName: req.file.originalname,
      fileSize:     req.file.size,
      mimeType:     req.file.mimetype,
      status:       'processing',
    });

    logger.info('Upload processing started', {
      uploadId: upload._id,
      userId:   req.user._id,
      filename: req.file.originalname,
    });

    const n8nResponse  = await sendFileToN8n(req.file, req.user._id);
    const processingTime = Date.now() - startTime;

    if (n8nResponse.success) {
      const driveFileId  = n8nResponse.driveFileId  || null;
      const driveFileName = n8nResponse.driveFileName || req.file.originalname;

      logger.info('Storing driveFileId in MongoDB', {
        uploadId:    upload._id,
        driveFileId: driveFileId || 'NULL — check Ingestion Workflow Respond node',
      });

      upload.status = 'completed';
      upload.ingestionMetadata = {
        processingTimeMs: processingTime,
        driveFileId,
        driveFileName,
      };
      await upload.save();

      return res.status(200).json({
        success: true,
        message: 'File uploaded and ingested successfully.',
        data: {
          uploadId:    upload._id,
          filename:    upload.originalName,
          status:      upload.status,
          driveFileId,
          processingTime,
        },
      });
    } else {
      upload.status = 'failed';
      upload.errorDetails = {
        message:   n8nResponse.message || 'n8n ingestion workflow failed',
        code:      n8nResponse.error   || 'N8N_ERROR',
        timestamp: new Date(),
      };
      await upload.save();

      logger.error('n8n ingestion failed', { uploadId: upload._id, reason: n8nResponse.message });

      return next(
        createErrors.serverError(n8nResponse.message || 'File upload failed: ingestion workflow not reachable.')
      );
    }
  } catch (error) {
    logger.error('Upload error', {
      userId:   req.user._id,
      filename: req.file.originalname,
      error:    error.message,
    });
    return next(createErrors.serverError('Failed to upload file'));
  }
});

/**
 * Get upload history with pagination
 * GET /api/v1/uploads
 */
exports.getUploadHistory = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 50 } = req.query;
  try {
    const history = await Upload.getUploadHistory(req.user._id, parseInt(page), parseInt(limit));
    logger.info('Upload history retrieved', { userId: req.user._id, count: history.data.length });
    res.status(200).json({ success: true, data: history.data, pagination: history.pagination });
  } catch (error) {
    logger.error('Error retrieving upload history', { error: error.message });
    return next(createErrors.serverError('Failed to retrieve upload history'));
  }
});

/**
 * Get upload by ID
 * GET /api/v1/uploads/:uploadId
 */
exports.getUploadById = asyncHandler(async (req, res, next) => {
  const { uploadId } = req.params;
  const upload = await Upload.findOne({ _id: uploadId, userId: req.user._id });
  if (!upload) return next(createErrors.notFound('Upload not found'));
  await upload.logAccess('viewed');
  res.status(200).json({ success: true, data: upload });
});

/**
 * Delete upload
 * DELETE /api/v1/uploads/:uploadId
 *
 * Strategy:
 *   1. If driveFileId is stored  → deleteFileFromN8n(driveFileId, ...)   [fast, direct]
 *   2. If driveFileId is missing → deleteFileByNameFromN8n(originalName)  [search-then-delete via n8n]
 *   3. Always delete from MongoDB regardless of n8n outcome
 */
exports.deleteUpload = asyncHandler(async (req, res, next) => {
  const { uploadId } = req.params;

  const upload = await Upload.findOne({ _id: uploadId, userId: req.user._id });
  if (!upload) return next(createErrors.notFound('Upload not found'));

  const driveFileId  = upload.ingestionMetadata?.driveFileId;
  const originalName = upload.originalName;

  logger.info('Delete request received', {
    uploadId,
    filename:    originalName,
    driveFileId: driveFileId || 'NOT STORED — will fallback to search-by-name',
  });

  let driveDeleted = false;
  let n8nError     = null;
  let deleteMethod = 'none';

  // ── Strategy 1: delete by stored driveFileId ────────────────────────────────
  if (driveFileId) {
    deleteMethod = 'by-id';
    const result = await deleteFileFromN8n(driveFileId, originalName, req.user._id);

    if (result.success) {
      driveDeleted = true;
      logger.info('✅ File deleted from Drive + Qdrant via n8n (by ID)', { driveFileId });
    } else {
      n8nError = result.error;
      logger.warn('⚠️  n8n delete-by-ID failed — trying delete-by-name fallback', {
        uploadId, driveFileId, error: n8nError,
      });

      // ── Fallback: search by name if direct ID delete fails ─────────────────
      const fallback = await deleteFileByNameFromN8n(originalName, req.user._id);
      if (fallback.success) {
        driveDeleted = true;
        deleteMethod = 'by-name-fallback';
        logger.info('✅ File deleted from Drive + Qdrant via n8n (fallback by name)', { originalName });
      } else {
        n8nError = fallback.error;
        logger.warn('⚠️  Both delete strategies failed — removing from DB only', {
          uploadId, originalName, error: n8nError,
        });
      }
    }
  } else {
    // ── Strategy 2: no driveFileId stored — search Drive by filename ──────────
    deleteMethod = 'by-name';
    logger.info('No driveFileId stored — using search-by-name delete', { originalName });

    const result = await deleteFileByNameFromN8n(originalName, req.user._id);
    if (result.success) {
      driveDeleted = true;
      logger.info('✅ File deleted from Drive + Qdrant via n8n (by name)', { originalName });
    } else {
      n8nError = result.error;
      logger.warn('⚠️  n8n delete-by-name failed — removing from DB only', {
        uploadId, originalName, error: n8nError,
      });
    }
  }

  // ── Always clean up MongoDB ──────────────────────────────────────────────────
  await Upload.findByIdAndDelete(uploadId);
  logger.info('Upload deleted from MongoDB', { uploadId, userId: req.user._id });

  res.status(200).json({
    success: true,
    driveDeleted,
    deleteMethod,
    message: driveDeleted
      ? `File fully deleted from Google Drive, Qdrant, and database (method: ${deleteMethod}).`
      : `File removed from database only. Drive/Qdrant deletion failed: ${n8nError}`,
  });
});