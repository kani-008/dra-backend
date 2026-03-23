// ./backend/models/Chat.js

const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    sessionId: {
      type: String,
      index: true,
      default: () => new mongoose.Types.ObjectId().toString()
    },
    question: {
      type: String,
      required: [true, 'Question is required'],
      minlength: [1, 'Question cannot be empty'],
      maxlength: [5000, 'Question exceeds maximum length']
    },
    answer: {
      type: String,
      required: [true, 'Answer is required'],
      maxlength: [50000, 'Answer exceeds maximum length']
    },
    metadata: {
      sources: [String],
      confidence: Number,
      processingTime: Number, // milliseconds
      model: String,
      tokens: {
        input: Number,
        output: Number
      }
    },
    feedback: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
        default: null
      },
      comment: String,
      isAccurate: Boolean,
      flaggedAt: Date
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'completed'
    },
    errorDetails: {
      message: String,
      code: String,
      timestamp: Date
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
      index: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Create compound index for efficient querying
chatSchema.index({ userId: 1, sessionId: 1, createdAt: -1 });
chatSchema.index({ userId: 1, createdAt: -1 });

// Hide sensitive fields
chatSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

// Static method to get chat history with pagination
chatSchema.statics.getChatHistory = async function (userId, page = 1, limit = 20, sessionId = null) {
  const skip = (page - 1) * limit;

  const query = { userId };
  if (sessionId) {
    query.sessionId = sessionId;
  }

  const [data, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('question answer feedback.rating status createdAt sessionId'),
    this.countDocuments(query)
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static method to get previous context for RAG
chatSchema.statics.getSessionContext = async function (userId, sessionId, limit = 5) {
  return this.find({ userId, sessionId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('question answer')
    .lean();
};

module.exports = mongoose.model('Chat', chatSchema);
