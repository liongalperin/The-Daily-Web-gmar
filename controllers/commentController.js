/**
 * Comment Controller
 * Handles comment creation, rate-limited submissions, and comment feeds.
 */

const mongoose = require('mongoose');
const { Comment, Article } = require('../models');
const logger = require('../config/logger');

const commentController = {
  /**
   * Public / Guest: Create a new comment on an article
   * Protected by commentRateLimiter (3 comments/min per device/IP)
   * POST /api/comments
   */
  async createComment(req, res, next) {
    try {
      const { articleId, content, authorName, deviceId } = req.body;

      if (!articleId || !content || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Article ID and comment content are required.'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(articleId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid article ID format.'
        });
      }

      // Check if article exists and is published
      const article = await Article.findById(articleId);
      if (!article || !article.publicVersion?.publishedAt) {
        return res.status(404).json({
          success: false,
          error: 'Cannot comment on non-existent or unpublished article.'
        });
      }

      const ipAddress = req.clientIp || req.ip || '127.0.0.1';
      const cleanDeviceId = req.clientDeviceId || (typeof deviceId === 'string' ? deviceId.trim() : '');

      const newComment = await Comment.createComment({
        articleId,
        content: content.trim(),
        authorName: (typeof authorName === 'string' && authorName.trim()) ? authorName.trim() : 'אורח',
        ipAddress,
        deviceId: cleanDeviceId
      });

      logger.info('New comment created', {
        commentId: newComment._id,
        articleId,
        author: newComment.authorName
      });

      return res.status(201).json({
        success: true,
        message: 'Comment posted successfully',
        comment: {
          _id: newComment._id,
          articleId: newComment.articleId,
          authorName: newComment.authorName,
          content: newComment.content,
          createdAt: newComment.createdAt
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Public: Get comments for an article
   * GET /api/comments?articleId=...
   */
  async getComments(req, res, next) {
    try {
      const articleId = req.query.articleId || req.params.articleId;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 50;

      if (!articleId) {
        return res.status(400).json({
          success: false,
          error: 'Article ID is required.'
        });
      }

      const comments = await Comment.getCommentsByArticle(articleId, { page, limit });

      return res.json({
        success: true,
        comments
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Editor: Delete a comment (e.g. moderation)
   * DELETE /api/comments/:id
   */
  async deleteComment(req, res, next) {
    try {
      const { id } = req.params;
      const deleted = await Comment.deleteCommentById(id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Comment not found.'
        });
      }

      logger.audit('COMMENT_DELETED_BY_MODERATOR', req.session?.user?.id || 'EDITOR', { commentId: id });

      return res.json({
        success: true,
        message: 'Comment deleted successfully.'
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = commentController;
