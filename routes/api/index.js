/**
 * Central API Router Index
 * Mounts the REST endpoints described in docs/api-contract.md
 */

const express = require('express');
const router = express.Router();

const articleRoutes = require('./articles');
const commentRoutes = require('./comments');
const analyticsRoutes = require('./analytics');
const weatherRoutes = require('./weather');
const articleController = require('../../controllers/articleController');
const { requireAuth, requireRole } = require('../../middleware/auth');

// Mount Article Routes
router.use('/articles', articleRoutes);

// Mount Comment Routes
router.use('/comments', commentRoutes);

// Mount Weather Widget Route
router.use('/weather', weatherRoutes);

// Reporter Dashboard Routes
router.get('/reporter/articles', requireAuth, requireRole('Reporter'), articleController.getReporterArticles);

// Editor Management Routes (as specified in docs/api-contract.md)
router.get('/admin/articles', requireAuth, requireRole('Editor'), articleController.getEditorArticles);
router.get('/admin/articles/:id', requireAuth, requireRole('Editor'), articleController.getArticleForEditor);
router.patch('/admin/articles/:id/status', requireAuth, requireRole('Editor'), articleController.updateEditorStatus);
router.delete('/admin/articles/:id', requireAuth, requireRole('Editor'), articleController.deleteArticle);

// Impact Analytics Route (as specified in docs/api-contract.md)
router.use('/admin/analytics', analyticsRoutes);

module.exports = router;
