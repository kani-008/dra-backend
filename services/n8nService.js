// ./backend/services/n8nService.js

const axios = require('axios');
const FormData = require('form-data');
const logger = require('../utils/logger');

const N8N_CHAT_WEBHOOK   = process.env.N8N_CHAT_WEBHOOK   || 'http://localhost:5678/webhook/chat';
const N8N_UPLOAD_WEBHOOK = process.env.N8N_UPLOAD_WEBHOOK || 'http://localhost:5678/webhook/upload';
const N8N_DELETE_WEBHOOK = process.env.N8N_DELETE_WEBHOOK || 'http://localhost:5678/webhook/delete';

const RETRY_CONFIG = {
  maxRetries: parseInt(process.env.N8N_MAX_RETRIES || '3'),
  retryDelay: 1000,
  backoffMultiplier: 2,
  timeout: parseInt(process.env.N8N_REQUEST_TIMEOUT || '120000'),
};

// Log N8N configuration on startup (production safe)
logger.info('N8N Service configured', {
  chat_webhook: N8N_CHAT_WEBHOOK?.split('/webhook/')[0] + '/webhook/[hidden]',
  upload_webhook: N8N_UPLOAD_WEBHOOK?.split('/webhook/')[0] + '/webhook/[hidden]',
  timeout: RETRY_CONFIG.timeout,
  maxRetries: RETRY_CONFIG.maxRetries,
});

const retryWithBackoff = async (fn, retries = 0) => {
  try {
    return await fn();
  } catch (error) {
    if (retries < RETRY_CONFIG.maxRetries) {
      const delay = RETRY_CONFIG.retryDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, retries);
      logger.warn(`Retry attempt ${retries + 1}/${RETRY_CONFIG.maxRetries} after ${delay}ms`, { 
        error: error.message,
        status: error.response?.status 
      });
      await new Promise((r) => setTimeout(r, delay));
      return retryWithBackoff(fn, retries + 1);
    }
    throw error;
  }
};

// ─── Chat ─────────────────────────────────────────────────────────────────────

const sendChatToN8n = async (question, previousChats = null, metadata = {}) => {
  const startTime = Date.now();
  try {
    const payload = { message: question, timestamp: new Date().toISOString(), ...metadata };
    if (previousChats?.length > 0) {
      payload.context = previousChats.map((c) => ({ question: c.question, answer: c.answer }));
    }
    const response = await retryWithBackoff(() =>
      axios.post(N8N_CHAT_WEBHOOK, payload, {
        timeout: RETRY_CONFIG.timeout,
        headers: { 
          'Content-Type': 'application/json', 
          'User-Agent': 'Deep-Research-Assistant/2.0',
          'X-Request-ID': metadata.requestId || `req-${Date.now()}`,
        },
      })
    );
    const processingTime = Date.now() - startTime;
    logger.info('n8n chat request successful', { processingTime, contextSize: previousChats?.length || 0 });
    return { success: true, data: response.data, processingTime };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('n8n chat service failed after retries', { 
      error: error.message, 
      statusCode: error.response?.status,
      webhook: N8N_CHAT_WEBHOOK,
      processingTime,
      code: error.code
    });
    return generateFallbackResponse(error);
  }
};

// ─── Upload ───────────────────────────────────────────────────────────────────

const sendFileToN8n = async (file, userId) => {
  const startTime = Date.now();
  try {
    const formData = new FormData();
    formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype, knownLength: file.size });
    formData.append('userId', userId.toString());
    formData.append('originalName', file.originalname);
    formData.append('uploadedAt', new Date().toISOString());
    formData.append('fileSize', file.size.toString());

    const response = await retryWithBackoff(() =>
      axios.post(N8N_UPLOAD_WEBHOOK, formData, {
        headers: { ...formData.getHeaders(), 'User-Agent': 'Deep-Research-Assistant/2.0' },
        timeout: RETRY_CONFIG.timeout,
        maxContentLength: 100 * 1024 * 1024,
        maxBodyLength: 100 * 1024 * 1024,
      })
    );

    const processingTime = Date.now() - startTime;
    const responseData = response.data;

    logger.info('n8n upload raw response', {
      filename: file.originalname,
      raw: JSON.stringify(responseData).substring(0, 500),
    });

    let driveFileId  = null;
    let driveFileName = file.originalname;

    const src = Array.isArray(responseData) ? responseData[0] : responseData;
    if (src) {
      driveFileId =
        src.driveFileId || src.id || src.fileId || src.file_id ||
        src.googleDriveFileId || src.json?.id || src.json?.driveFileId || null;
      driveFileName = src.driveFileName || src.name || src.fileName || src.json?.name || file.originalname;
    }

    if (!driveFileId) {
      logger.warn(
        '⚠️  driveFileId NOT returned by n8n. Fix your Ingestion Workflow "Respond to Webhook" node:\n' +
        '   Respond With: JSON\n' +
        '   Body: { "driveFileId": "{{ $node[\'Upload to Google Drive\'].json.id }}", ' +
        '"driveFileName": "{{ $node[\'Upload to Google Drive\'].json.name }}" }',
        { filename: file.originalname }
      );
    }

    logger.info('n8n file upload successful', {
      filename: file.originalname,
      driveFileId: driveFileId || 'NULL',
      processingTime,
    });

    return { success: true, data: responseData, driveFileId, driveFileName, processingTime };
  } catch (error) {
    logger.error('n8n file upload failed', { filename: file.originalname, error: error.message });
    return generateFallbackResponse(error, 'upload');
  }
};

// ─── Delete by Drive File ID (preferred — new uploads) ───────────────────────

const deleteFileFromN8n = async (driveFileId, originalName, userId) => {
  const startTime = Date.now();
  try {
    const payload = {
      driveFileId,
      originalName,
      userId: userId.toString(),
      deletedAt: new Date().toISOString(),
    };

    logger.info('Sending delete-by-ID to n8n', { driveFileId, originalName });

    const response = await retryWithBackoff(() =>
      axios.post(N8N_DELETE_WEBHOOK, payload, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Deep-Research-Assistant/2.0' },
      })
    );

    logger.info('n8n delete-by-ID successful', { driveFileId, processingTime: Date.now() - startTime });
    return { success: true, data: response.data };
  } catch (error) {
    logger.error('n8n delete-by-ID failed', { driveFileId, error: error.message });
    return { success: false, error: error.message, statusCode: error.response?.status || 503 };
  }
};

// ─── Delete by filename (fallback — old uploads with no stored driveFileId) ───

const deleteFileByNameFromN8n = async (originalName, userId) => {
  const startTime = Date.now();
  try {
    const payload = {
      driveFileId:  null,
      originalName,
      searchByName: true,
      userId:       userId.toString(),
      deletedAt:    new Date().toISOString(),
    };

    logger.info('Sending delete-by-name to n8n', { originalName });

    const response = await retryWithBackoff(() =>
      axios.post(N8N_DELETE_WEBHOOK, payload, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Deep-Research-Assistant/2.0' },
      })
    );

    logger.info('n8n delete-by-name successful', { originalName, processingTime: Date.now() - startTime });
    return { success: true, data: response.data };
  } catch (error) {
    logger.error('n8n delete-by-name failed', { originalName, error: error.message });
    return { success: false, error: error.message, statusCode: error.response?.status || 503 };
  }
};

// ─── Health ───────────────────────────────────────────────────────────────────

const healthCheck = async () => {
  try {
    const response = await axios.get(N8N_CHAT_WEBHOOK.replace('/webhook/chat', '/health'), { timeout: 5000 });
    return { healthy: true, status: response.status };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
};

// ─── Fallback ─────────────────────────────────────────────────────────────────

const generateFallbackResponse = (error, type = 'chat') => {
  const isNetworkError = error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET';
  const isTimeout      = error.code === 'ECONNABORTED' || error.response?.status === 504;
  const msg = isTimeout
    ? 'Request timed out. Please try again.'
    : isNetworkError
    ? 'Cannot connect to service. Please try again later.'
    : 'Service temporarily unavailable. Please try again.';
  return { success: false, error: 'service unavailable', fallback: true, message: msg, statusCode: error.response?.status || 503 };
};

module.exports = {
  sendChatToN8n,
  sendFileToN8n,
  deleteFileFromN8n,
  deleteFileByNameFromN8n,
  healthCheck,
  retryWithBackoff,
};