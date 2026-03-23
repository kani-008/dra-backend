const Chat = require('../models/Chat');
const Upload = require('../models/Upload');
const mongoose = require('mongoose');
const { asyncHandler } = require('../middleware/errorMiddleware');
const logger = require('../utils/logger');

/**
 * Get aggregated analytics for the authenticated user
 * GET /api/v1/analytics
 */
exports.getUserAnalytics = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // 1. Total Counts
  const [totalQueries, totalDocs] = await Promise.all([
    Chat.countDocuments({ userId }),
    Upload.countDocuments({ userId })
  ]);

  // 2. Weekly Activity (Group by day)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const dailyActivity = await Chat.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: sevenDaysAgo }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        queries: { $sum: 1 },
        tokens: { 
          $sum: { 
            $divide: [
              { $strLenCP: { $ifNull: ["$question", ""] } }, 
              4
            ] 
          } 
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const dailyUploads = await Upload.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: sevenDaysAgo }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 }
      }
    }
  ]);

  // 3. File Type Distribution
  const fileTypes = [
    { name: 'PDF', value: totalDocs > 0 ? 100 : 0, color: '#8b5cf6' },
  ];

  // 4. Recent Interactions
  const recentInteractions = await Chat.find({ userId })
    .sort({ createdAt: -1 })
    .limit(8)
    .select('question createdAt status');

  res.status(200).json({
    success: true,
    data: {
      stats: {
        queries: totalQueries,
        docs: totalDocs,
        topics: totalDocs > 0 ? totalDocs * 4 : 0,
        response: totalQueries > 0 ? '1.2s' : '0.0s'
      },
      activity: dailyActivity,
      uploads: dailyUploads,
      fileTypes,
      recent: recentInteractions.map(c => ({
          action: `Queried: ${c.question.substring(0, 45)}...`,
          time: c.createdAt,
          type: 'query'
      }))
    }
  });
});
