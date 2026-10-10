/**
 * Comment API Routes
 */

const express = require('express');
const router = express.Router();
const commentController = require('../../controllers/commentController');
const { commentRateLimiter } = require('../../middleware/rateLimiter');
const { requireAuth, requireRole } = require('../../middleware/auth');

// Public comment creation: invalid comments are rejected before the rate limit
// (3 comments per minute per device) counts them
router.post('/', commentController.validateComment, commentRateLimiter, commentController.createComment);

// Get comments for an article
router.get('/', commentController.getComments);

// Editor comment deletion (moderation)
router.delete('/:id', requireAuth, requireRole('Editor'), commentController.deleteComment);

module.exports = router;
