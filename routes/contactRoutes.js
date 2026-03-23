// backend/routes/contactRoutes.js
const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const { apiLimiter } = require('../middleware/securityMiddleware');

// POST /api/v1/contact - Send a support message
router.post('/', apiLimiter, contactController.sendContactMessage);

module.exports = router;
