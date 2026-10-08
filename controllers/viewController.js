/**
 * View Controller
 * Serves Server-Side Rendered (SSR) HTML pages via EJS.
 * Powers the bilingual newsroom UI and satisfies the strict academic SEO requirement.
 */

const mongoose = require('mongoose');
const { User, Article, Comment, ViewStats } = require('../models');
const logger = require('../config/logger');

const viewController = {
  /**
   * Home Screen - Public News Feed (SSR initial 20 articles)
   * GET /
   */
  async renderHome(req, res, next) {
    try {
      const category = req.query.category || '';
      const sort = req.query.sort === 'popular' || req.query.sort === 'popularity' ? 'popular' : 'date';
      const viewed = ['viewed', 'unviewed'].includes(req.query.viewed) ? req.query.viewed : 'all';
      const search = req.query.q || '';
      const page = parseInt(req.query.page, 10) || 1;
      const viewedIds = req.session?.viewedArticles || [];

      const rawArticles = await Article.searchPublishedArticles({
        search,
        category,
        sort,
        viewed,
        viewedIds,
        page,
        limit: 20
      });

      const formattedArticles = await Article.toFeedItems(rawArticles, viewedIds);

      // Render the primary newsprint index view
      return res.render('index', {
        title: 'The Daily Web - ראשי',
        articles: formattedArticles,
        filters: {
          q: search,
          category,
          viewed,
          sort
        },
        hasMore: rawArticles.length === 20,
        currentCategory: category,
        currentSort: sort,
        searchQuery: search,
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
        return res.status(404).render('error', {
          title: 'כתבה לא נמצאה (404)',
          status: 404,
          statusCode: 404,
          message: 'הכתבה המבוקשת לא נמצאה במערכת.',
          user: req.session?.user || null
        });
      }

      const article = await Article.findById(id).populate('authorId', 'username fullName');
      if (!article || !article.publicVersion?.publishedAt) {
        return res.status(404).render('error', {
          title: 'כתבה לא נמצאה (404)',
          status: 404,
          statusCode: 404,
          message: 'הכתבה המבוקשת אינה קיימת או שטרם פורסמה.',
          user: req.session?.user || null
        });
      }

      // Record view asynchronously for Impact Analytics
      ViewStats.recordView(article._id).catch(() => {});

      // Track viewed article in session for read badges and filter
      if (!req.session.viewedArticles) {
        req.session.viewedArticles = [];
      }
      const articleIdStr = article._id.toString();
      if (!req.session.viewedArticles.includes(articleIdStr)) {
        req.session.viewedArticles.push(articleIdStr);
      }

      const comments = await Comment.getCommentsByArticle(article._id, { limit: 50 });
      const canonical = `${req.protocol}://${req.get('host')}/articles/${article._id}`;

      return res.render('article', {
        title: `${article.publicVersion.title} - The Daily Web`,
        article,
        comments,
        canonical,
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
      const redirectUrl = req.session.user.role === 'Editor' ? '/editor' : '/reporter';
      return res.redirect(redirectUrl);
    }

    return res.render('login', {
      title: 'כניסת צוות המערכת - The Daily Web',
      error: false,
      username: '',
      next: req.query.next || '',
      user: null
    });
  },

  /**
   * Handle Login Form Submission
   * POST /login
   */
  async handleLogin(req, res, next) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(401).render('login', {
          title: 'כניסת צוות המערכת - The Daily Web',
          error: true,
          username: username || '',
          user: null
        });
      }

      const user = await User.getUserByUsername(username, true);
      if (!user) {
        return res.status(401).render('login', {
          title: 'כניסת צוות המערכת - The Daily Web',
          error: true,
          username,
          user: null
        });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).render('login', {
          title: 'כניסת צוות המערכת - The Daily Web',
          error: true,
          username,
          user: null
        });
      }

      // Session regeneration against fixation attacks
      req.session.regenerate((err) => {
        if (err) return next(err);

        req.session.user = {
          id: user._id.toString(),
          username: user.username,
          role: user.role,
          fullName: user.fullName || user.username
        };

        logger.audit('USER_LOGGED_IN_WEB', user._id, { username: user.username, role: user.role });

        const redirectUrl = user.role === 'Editor' ? '/editor' : '/reporter';
        return res.redirect(req.body.next || redirectUrl);
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Handle Logout
   * POST /logout or GET /logout
   */
  handleLogout(req, res) {
    if (req.session) {
      const userId = req.session.user?.id || 'ANONYMOUS';
      req.session.destroy((err) => {
        if (err) logger.error('Error destroying session on logout', { error: err.message });
        res.clearCookie('connect.sid', { path: '/' });
        return res.redirect('/');
      });
    } else {
      return res.redirect('/');
    }
  },

  /**
   * Reporter Dashboard (Dev 2 UI)
   * GET /reporter
   */
  async renderReporterDashboard(req, res, next) {
    try {
      const authorId = req.session.user.id;
      const articles = await Article.find({ authorId }).sort({ updatedAt: -1 });

      return res.render('reporter/dashboard', {
        articles,
        user: req.session.user
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Reporter Article Editor (Dev 2 UI)
   * GET /reporter/articles/:id/edit
   */
  async renderReporterEdit(req, res, next) {
    try {
      const { id } = req.params;
      const article = await Article.findById(id).populate('authorId');

      if (!article) {
        return res.status(404).render('error', {
          title: 'כתבה לא נמצאה (404)',
          status: 404,
          statusCode: 404,
          message: 'הכתבה המבוקשת לא נמצאה.',
          user: req.session.user
        });
      }

      // Check ownership (Reporters can only edit own articles; Editors can edit all)
      if (req.session.user.role !== 'Editor' && article.authorId?._id?.toString() !== req.session.user.id) {
        return res.status(403).render('error', {
          title: 'אין גישה (403)',
          status: 403,
          statusCode: 403,
          message: 'אין לך הרשאה לערוך כתבה זו.',
          user: req.session.user
        });
      }

      return res.render('reporter/edit', {
        article,
        user: req.session.user
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Editor Dashboard (Dev 2 UI)
   * GET /editor
   */
  async renderEditorDashboard(req, res, next) {
    try {
      const status = req.query.status !== undefined ? req.query.status : 'Pending';
      const search = req.query.q || '';

      const query = {};
      if (status) query.status = status;
      const titleFilter = Article.staffTitleFilter(search);
      if (titleFilter) query.$or = titleFilter;

      const [articles, allCount, draftCount, pendingCount, pubCount, retCount] = await Promise.all([
        Article.find(query).sort({ updatedAt: -1 }).limit(50).populate('authorId'),
        Article.countDocuments({}),
        Article.countDocuments({ status: 'Draft' }),
        Article.countDocuments({ status: 'Pending' }),
        Article.countDocuments({ status: 'Published' }),
        Article.countDocuments({ status: 'Returned' })
      ]);

      const counts = {
        all: allCount,
        Draft: draftCount,
        Pending: pendingCount,
        Published: pubCount,
        Returned: retCount
      };

      return res.render('editor/dashboard', {
        articles,
        counts,
        filters: { status, q: search },
        hasMore: articles.length === 50,
        user: req.session.user
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Editor Review Page (Dev 2 UI)
   * GET /editor/articles/:id
   */
  async renderEditorReview(req, res, next) {
    try {
      const { id } = req.params;
      const article = await Article.findById(id).populate('authorId');

      if (!article) {
        return res.status(404).render('error', {
          title: 'כתבה לא נמצאה (404)',
          status: 404,
          statusCode: 404,
          message: 'הכתבה המבוקשת לא נמצאה.',
          user: req.session.user
        });
      }

      return res.render('editor/review', {
        article,
        user: req.session.user
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Editor Impact Analytics Page (Dev 2 UI)
   * GET /editor/analytics
   */
  async renderEditorAnalytics(req, res, next) {
    try {
      let selected = null;
      if (req.query.article) {
        selected = await Article.findById(req.query.article);
      }

      return res.render('editor/analytics', {
        selected,
        user: req.session.user
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Reporter Workspace Desk (Compatibility View)
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
        title: 'דסק הכתב - The Daily Web',
        articles,
        currentStatus: status,
        user: req.session.user
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Editor Workspace Desk (Compatibility View)
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
        title: 'דסק העורך - The Daily Web',
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
