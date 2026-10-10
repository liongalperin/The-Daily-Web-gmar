/**
 * Article API Routes
 */

const express = require('express');
const router = express.Router();
const articleController = require('../../controllers/articleController');
const { requireAuth, requireRole, checkArticleOwnership } = require('../../middleware/auth');

// Public Feed & Search
router.get('/', articleController.getPublicArticles);
router.get('/:id', articleController.getArticleById);

// Reporter Draft Creation & Auto-Save
router.post('/', requireAuth, requireRole('Reporter'), articleController.createDraft);
router.put('/:id/auto-save', requireAuth, checkArticleOwnership, articleController.autoSaveDraft);
router.patch('/:id/status', requireAuth, requireRole('Reporter'), checkArticleOwnership, articleController.updateReporterStatus);

module.exports = router;
