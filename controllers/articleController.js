/**
 * Article Controller
 * Implements public feed, search, state machine transitions, auto-save, and editorial workflows.
 */

const mongoose = require('mongoose');
const { Article, ViewStats, Comment } = require('../models');
const logger = require('../config/logger');

// A URL with a scheme other than http(s), e.g. "javascript:" or "data:". Never stored, not even in a draft.
function hasForbiddenScheme(url) {
  if (typeof url !== 'string') return false;
  const value = url.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:/i.test(value);
}

const articleController = {
  /**
   * Public: Fetch articles for infinite scroll feed and search
   * GET /api/articles?page=1&limit=20&category=tech&sort=date&q=keyword
   */
  async getPublicArticles(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 100);
      const category = req.query.category || '';
      const sort = req.query.sort || 'date'; // 'date' | 'popular'
      const search = req.query.q || req.query.search || '';
      const viewedIds = req.session?.viewedArticles || [];

      const rawArticles = await Article.searchPublishedArticles({
        search,
        category,
        sort,
        viewed: req.query.viewed || 'all',
        viewedIds,
        page,
        limit
      });

      const articles = await Article.toFeedItems(rawArticles, viewedIds);

      // Calculate if more articles exist for Developer 2's infinite scroll observer
      const hasMore = rawArticles.length === limit;

      return res.json({
        success: true,
        page,
        limit,
        hasMore,
        articles
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Public: Fetch single article details and record view count
   * GET /api/articles/:id
   */
  async getArticleById(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ success: false, error: 'Article not found.' });
      }

      const article = await Article.findById(id).populate('authorId', 'username fullName');
      if (!article || !article.publicVersion?.publishedAt) {
        return res.status(404).json({ success: false, error: 'Article not found or not published.' });
      }

      // Record view asynchronously in ViewStats without blocking response
      ViewStats.recordView(article._id).catch(err => {
        logger.error('Failed to record article view in ViewStats:', err);
      });

      const comments = await Comment.getCommentsByArticle(article._id, { limit: 50 });

      return res.json({
        success: true,
        article: {
          id: article._id,
          _id: article._id,
          category: article.category,
          title: article.publicVersion.title,
          content: article.publicVersion.content,
          summary: article.publicVersion.summary || article.publicVersion.snippet,
          snippet: article.publicVersion.snippet || article.publicVersion.summary,
          imageUrl: article.publicVersion.imageUrl,
          publishedAt: article.publicVersion.publishedAt,
          authorName: article.authorId ? (article.authorId.fullName || article.authorId.username) : '',
          author: article.authorId ? {
            id: article.authorId._id,
            fullName: article.authorId.fullName || article.authorId.username
          } : null,
          views: article.totalViews + 1,
          totalViews: article.totalViews + 1,
          comments
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Reporter: Create a new draft article
   * POST /api/articles
   */
  async createDraft(req, res, next) {
    try {
      const { title, content, summary, snippet, category, imageUrl } = req.body;
      const authorId = req.session.user.id;

      if (hasForbiddenScheme(imageUrl)) {
        return res.status(400).json({ success: false, error: 'The image URL must be an http(s) link or a path on this site.' });
      }

      const article = await Article.createArticle({
        authorId,
        category: category || 'news',
        title: title || '',
        content: content || '',
        summary: summary || snippet || '',
        snippet: summary || snippet || '',
        imageUrl: imageUrl || '/images/default-news.jpg',
        status: 'Draft'
      });

      logger.audit('ARTICLE_CREATED_DRAFT', authorId, { articleId: article._id });

      return res.status(201).json({
        success: true,
        message: 'Draft created successfully',
        article
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Reporter: Silent background auto-save while typing
   * PUT /api/articles/:id/auto-save
   */
  async autoSaveDraft(req, res, next) {
    try {
      const { id } = req.params;
      const { title, content, summary, snippet, category, imageUrl } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid article ID format.' });
      }

      // Drafts may hold a half-typed URL, but never a javascript:/data: one
      if (hasForbiddenScheme(imageUrl)) {
        return res.status(400).json({ success: false, error: 'The image URL must be an http(s) link or a path on this site.' });
      }

      const existingArticle = req.article || await Article.findById(id);
      if (!existingArticle) {
        return res.status(404).json({ success: false, error: 'Article not found.' });
      }

      // Concurrency lock: prevent auto-saving while article is pending editorial review
      if (existingArticle.status === 'Pending') {
        return res.status(409).json({
          success: false,
          error: 'Article is currently pending editorial review and cannot be modified.'
        });
      }

      const updatedArticle = await Article.updateDraft(id, {
        title,
        content,
        summary: summary || snippet,
        snippet: summary || snippet,
        category,
        imageUrl
      });

      return res.json({
        success: true,
        message: 'Draft auto-saved successfully',
        updatedAt: updatedArticle.draftVersion.updatedAt
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Reporter: Submit draft to Editor for review
   * PATCH /api/articles/:id/status
   */
  async updateReporterStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid article ID format.' });
      }

      if (status !== 'Pending') {
        return res.status(400).json({
          success: false,
          error: 'Reporters can only submit articles to "Pending" status.'
        });
      }

      const article = req.article || await Article.findById(id);
      if (!article) {
        return res.status(404).json({ success: false, error: 'Article not found.' });
      }

      if (!Article.canTransition(article.status, 'Pending', 'Reporter')) {
        return res.status(400).json({
          success: false,
          error: `Cannot transition article from "${article.status}" to "Pending".`
        });
      }

      // A published article goes back to review only with changes to review
      if (article.status === 'Published' && !Article.hasDraftChanges(article)) {
        return res.status(409).json({
          success: false,
          error: 'This article has no changes since it was published.'
        });
      }

      const problem = Article.draftProblem(article.draftVersion);
      if (problem) {
        return res.status(400).json({ success: false, error: problem });
      }

      const updated = await Article.submitForReview(id);
      logger.audit('ARTICLE_SUBMITTED_FOR_REVIEW', req.session.user.id, { articleId: id });

      return res.json({
        success: true,
        message: 'Article submitted for editor review.',
        status: updated.status,
        article: updated
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Reporter: Get own articles
   * GET /api/reporter/articles
   */
  async getReporterArticles(req, res, next) {
    try {
      const authorId = req.session.user.id;
      const { page, limit, status } = req.query;

      const articles = await Article.getArticlesByReporter(authorId, {
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 50,
        status
      });

      return res.json({
        success: true,
        articles
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Editor: Get all articles for editorial desk
   * GET /api/admin/articles
   */
  async getEditorArticles(req, res, next) {
    try {
      const { page, limit, status, q } = req.query;

      const articles = await Article.getArticlesForEditor({
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 50,
        status,
        search: q
      });

      return res.json({
        success: true,
        articles
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Editor: Get single article with diff comparison (publicVersion vs draftVersion)
   * GET /api/admin/articles/:id
   */
  async getArticleForEditor(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid article ID format.' });
      }

      const article = await Article.findById(id).populate('authorId', 'username fullName');
      if (!article) {
        return res.status(404).json({ success: false, error: 'Article not found.' });
      }

      return res.json({
        success: true,
        article,
        comparison: {
          isPublished: article.status === 'Published' || !!article.publicVersion?.publishedAt,
          hasDraftChanges: article.draftVersion.updatedAt > (article.publicVersion?.publishedAt || 0),
          public: article.publicVersion,
          draft: article.draftVersion,
          editorNote: article.editorNote
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Editor: Approve (Publish) or Return article with notes
   * PATCH /api/admin/articles/:id/status
   */
  async updateEditorStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, editorNote } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid article ID format.' });
      }

      if (!['Published', 'Returned'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Editor status must be either "Published" or "Returned".'
        });
      }

      const article = await Article.findById(id);
      if (!article) {
        return res.status(404).json({ success: false, error: 'Article not found.' });
      }

      if (!Article.canTransition(article.status, status, 'Editor')) {
        return res.status(400).json({
          success: false,
          error: `Invalid status transition from "${article.status}" to "${status}". Editors can only review articles in "Pending" status.`
        });
      }

      // Publishing a live article again (the editor's own edits) needs something new to publish
      if (article.status === 'Published' && !Article.hasDraftChanges(article)) {
        return res.status(409).json({
          success: false,
          error: 'This article has no changes since it was published.'
        });
      }

      if (status === 'Published') {
        const problem = Article.draftProblem(article.draftVersion);
        if (problem) {
          return res.status(400).json({ success: false, error: problem });
        }
      }

      const note = typeof editorNote === 'string' ? editorNote.trim() : '';
      if (status === 'Returned' && !note) {
        return res.status(400).json({
          success: false,
          error: 'A note for the reporter is required when returning an article.'
        });
      }

      let updatedArticle;
      if (status === 'Published') {
        updatedArticle = await Article.publishArticle(id);
        logger.audit('ARTICLE_PUBLISHED_BY_EDITOR', req.session.user.id, {
          articleId: id,
          publishHistoryLength: updatedArticle.publishHistory.length
        });
      } else if (status === 'Returned') {
        updatedArticle = await Article.returnArticle(id, note);
        logger.audit('ARTICLE_RETURNED_FOR_REVISIONS', req.session.user.id, {
          articleId: id,
          note
        });
      }

      return res.json({
        success: true,
        message: status === 'Published' ? 'Article published successfully' : 'Article returned for revisions',
        status: updatedArticle.status,
        article: updatedArticle
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Editor: Delete article
   * DELETE /api/admin/articles/:id
   */
  async deleteArticle(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid article ID format.' });
      }

      const deleted = await Article.deleteArticleById(id);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Article not found.' });
      }

      logger.audit('ARTICLE_DELETED_BY_EDITOR', req.session.user.id, { articleId: id });

      return res.json({
        success: true,
        message: 'Article and associated comments/stats deleted successfully.'
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = articleController;
