/**
 * View Controller
 * Serves Server-Side Rendered (SSR) HTML pages via EJS.
 * Satisfies the strict SEO requirement:
 * "עמוד כתבה חייב להיות נגיש למנועי חיפוש: התוכן המלא של הכתבה יופיע כבר ב-HTML הראשוני המוחזר מהשרת ולא יהיה תלוי בהרצת JavaScript בדפדפן"
 */

const mongoose = require('mongoose');
const { Article, Comment, ViewStats } = require('../models');
const weatherService = require('../services/weatherService');

const viewController = {
  /**
   * Home Screen - News Feed (SSR initial 20 articles)
   * GET /
   */
  async renderHome(req, res, next) {
    try {
      const category = req.query.category || '';
      const sort = req.query.sort || 'date';
      const search = req.query.q || '';

      const rawArticles = await Article.searchPublishedArticles({
        search,
        category,
        sort,
        page: 1,
        limit: 20
      });

      const weather = await weatherService.getWeather('Tel Aviv');

      return res.render('pages/home', {
        title: 'The Daily Web - ראשי',
        articles: rawArticles,
        currentCategory: category,
        currentSort: sort,
        searchQuery: search,
        weather,
        user: req.session?.user || null
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Article Full Page (Strict SEO SSR - full content in initial HTML)
   * GET /articles/:id
   */
  async renderArticle(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).render('pages/error', {
          title: 'כתבה לא נמצאה',
          statusCode: 404,
          message: 'הכתבה המבוקשת לא נמצאה במערכת.',
          user: req.session?.user || null
        });
      }

      const article = await Article.findById(id).populate('authorId', 'username fullName');
      if (!article || !article.publicVersion?.publishedAt) {
        return res.status(404).render('pages/error', {
          title: 'כתבה לא נמצאה',
          statusCode: 404,
          message: 'הכתבה המבוקשת אינה קיימת או שטרם פורסמה.',
          user: req.session?.user || null
        });
      }

      // Record view asynchronously for Impact Analytics
      ViewStats.recordView(article._id).catch(() => {});

      const comments = await Comment.getCommentsByArticle(article._id, { limit: 50 });
      const weather = await weatherService.getWeather('Tel Aviv');

      return res.render('pages/article', {
        title: `${article.publicVersion.title} - The Daily Web`,
        article,
        comments,
        weather,
        user: req.session?.user || null
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Login Page
   * GET /login
   */
  renderLogin(req, res) {
    if (req.session?.user) {
      const redirectUrl = req.session.user.role === 'Editor' ? '/editor/desk' : '/reporter/desk';
      return res.redirect(redirectUrl);
    }

    return res.render('pages/login', {
      title: 'התחברות למערכת - The Daily Web',
      user: null
    });
  },

  /**
   * Reporter Workspace Desk
   * GET /reporter/desk
   */
  async renderReporterDesk(req, res, next) {
    try {
      const authorId = req.session.user.id;
      const status = req.query.status || '';

      const articles = await Article.getArticlesByReporter(authorId, {
        status,
        limit: 50
      });

      return res.render('pages/reporter-desk', {
        title: 'אזור עבודה לכתב - The Daily Web',
        articles,
        currentStatus: status,
        user: req.session.user
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Editor Workspace Desk
   * GET /editor/desk
   */
  async renderEditorDesk(req, res, next) {
    try {
      const status = req.query.status !== undefined ? req.query.status : 'Pending';

      const [articles, pendingCount] = await Promise.all([
        Article.getArticlesForEditor({
          status,
          limit: 50
        }),
        Article.countDocuments({ status: 'Pending' })
      ]);

      return res.render('pages/editor-desk', {
        title: 'אזור ניהול ועריכה - The Daily Web',
        articles,
        currentStatus: status,
        pendingCount,
        user: req.session.user
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = viewController;
