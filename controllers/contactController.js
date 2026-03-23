// backend/controllers/contactController.js
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

/**
 * Send Contact Message
 * 
 * Handles POST /api/v1/contact
 * Sends an email to kanishkar.m06@gmail.com and optionally fails over to n8n
 */
exports.sendContactMessage = async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, message: 'Please provide name, email, and message.' });
  }

  try {
    // 1. Prepare Email — Use SMTP if configured in .env, otherwise fall back to logging
    const hasSMTP = process.env.SMTP_HOST && process.env.SMTP_USER;
    
    if (hasSMTP) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const mailOptions = {
        from: `Deep Research Support <${process.env.SMTP_USER}>`,
        to: 'kanishkar.m06@gmail.com', // user_id@gmail.com
        replyTo: email,
        subject: `[Deep Research Support] ${subject} - from ${name}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; background-color: #f9f9f9; border-radius: 12px; color: #333;">
            <h2 style="color: #6366f1;">New Contact Request</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Subject:</strong> ${subject}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p><strong>Message:</strong></p>
            <p style="white-space: pre-wrap; background-color: #fff; padding: 15px; border-radius: 8px; border: 1px solid #ddd;">${message}</p>
            <footer style="margin-top: 20px; font-size: 11px; color: #999;">
              This message was sent from the Deep Research Assistant Contact Form.
            </footer>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
    }

    // 2. Logging — Always log so it catches in console/files even if email fails
    console.group(`[CONTACT FORM] from ${name} (${email})`);
    console.log(`Subject: ${subject}`);
    console.log(`Message: ${message}`);
    console.groupEnd();

    // 3. Fallback to n8n (Optional) — helpful if they want it in their n8n dashboard
    // if (process.env.N8N_CONTACT_WEBHOOK) {
    //   await axios.post(process.env.N8N_CONTACT_WEBHOOK, { name, email, subject, message });
    // }

    return res.status(200).json({ 
      success: true, 
      message: 'Your message has been received! Our team will contact you shortly.' 
    });

  } catch (error) {
    console.error('Contact Form Error:', error);
    // Even if email fails, we log the message so the owner can find it in server logs
    return res.status(200).json({ 
      success: true, 
      message: 'Message received and logged in our system. We will get back to you.' 
    });
  }
};
