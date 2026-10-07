/**
 * Impact Analytics API Routes
 */

const express = require('express');
const router = express.Router();
const analyticsController = require('../../controllers/analyticsController');
const { requireAuth, requireRole } = require('../../middleware/auth');

// Editor: Fetch timeseries data and update points for Chart.js
router.get('/:articleId', requireAuth, requireRole('Editor'), analyticsController.getArticleAnalytics);

module.exports = router;
