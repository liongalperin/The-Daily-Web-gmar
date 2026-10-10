/**
 * Comment Model
 * Supports rate limiting enforcement (max 3 comments per minute per device/IP)
 * and full CRUD operations.
 */

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    articleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Article',
      required: [true, 'Article ID is required']
    },
    authorName: {
      type: String,
      trim: true,
      default: 'אורח',
      maxlength: [50, 'Author name cannot exceed 50 characters']
    },
    content: {
      type: String,
      required: [true, 'Comment content is required'],
      trim: true,
      maxlength: [1000, 'Comment content cannot exceed 1000 characters']
    },
    ipAddress: {
      type: String,
      required: [true, 'IP address is required']
    },
    deviceId: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for rapid comment retrieval and rate limit checking
commentSchema.index({ articleId: 1, createdAt: -1 });
commentSchema.index({ ipAddress: 1, createdAt: -1 });
commentSchema.index({ deviceId: 1, createdAt: -1 });

// Rate Limiting Check Helper: Max 3 comments per 60 seconds
commentSchema.statics.checkRateLimit = async function ({ ipAddress, deviceId, windowSeconds = 60, maxComments = 3 }) {
  const cleanIp = typeof ipAddress === 'string' ? ipAddress.trim() : '';
  const cleanDevice = typeof deviceId === 'string' ? deviceId.trim() : '';
  const now = Date.now();
  const since = new Date(now - windowSeconds * 1000);

  const criteria = [{ ipAddress: cleanIp, createdAt: { $gte: since } }];
  if (cleanDevice) {
    criteria.push({ deviceId: cleanDevice, createdAt: { $gte: since } });
  }

  // Find recent comments in window, sorted by oldest first
  const recentComments = await this.find({ $or: criteria })
    .sort({ createdAt: 1 })
    .select('createdAt')
    .lean();

  const count = recentComments.length;
  const isAllowed = count < maxComments;

  let retryAfterSeconds = 0;
  if (!isAllowed && recentComments.length > 0) {
    // Oldest comment must expire from window before user can post again
    const oldestTimestamp = new Date(recentComments[0].createdAt).getTime();
    const expiryTimestamp = oldestTimestamp + windowSeconds * 1000;
    retryAfterSeconds = Math.max(1, Math.ceil((expiryTimestamp - now) / 1000));
  }

  return {
    allowed: isAllowed,
    recentCount: count,
    maxAllowed: maxComments,
    retryAfterSeconds
  };
};

// CRUD helpers
commentSchema.statics.createComment = function (data) {
  return this.create(data);
};

commentSchema.statics.getCommentsByArticle = function (articleId, { page = 1, limit = 50 } = {}) {
  if (!mongoose.Types.ObjectId.isValid(articleId)) return [];
  const skip = (Math.max(1, page) - 1) * limit;
  return this.find({ articleId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

commentSchema.statics.getCommentById = function (id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return this.findById(id);
};

commentSchema.statics.updateCommentById = function (id, updates) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return this.findByIdAndUpdate(id, { $set: updates }, { returnDocument: 'after', runValidators: true });
};

commentSchema.statics.deleteCommentById = function (id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return this.findByIdAndDelete(id);
};

const Comment = mongoose.model('Comment', commentSchema);
module.exports = Comment;
