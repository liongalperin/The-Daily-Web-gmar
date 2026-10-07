/**
 * Impact Analytics Controller
 * Serves timeseries view metrics and publish update timestamps for Chart.js.
 */

const mongoose = require('mongoose');
const { ViewStats, Article } = require('../models');

const analyticsController = {
  /**
   * Editor: Fetch timeseries data and update points for Impact Analytics
   * GET /api/admin/analytics/:articleId
   */
  async getArticleAnalytics(req, res, next) {
    try {
      const { articleId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(articleId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid article ID format.'
        });
      }

      // Check article existence
      const articleExists = await Article.exists({ _id: articleId });
      if (!articleExists) {
        return res.status(404).json({
          success: false,
          error: 'Article not found.'
        });
      }

      const analytics = await ViewStats.getImpactAnalytics(articleId);

      return res.json({
        success: true,
        articleId: analytics.articleId,
        title: analytics.title,
        viewData: analytics.viewData,
        updatePoints: analytics.updatePoints,
        totalViews: analytics.totalViews
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = analyticsController;
