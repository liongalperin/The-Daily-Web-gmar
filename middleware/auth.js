/**
 * Authentication and Role-Based Authorization Middleware
 * Enforces server-side permissions:
 * - Unauthenticated users (Guests) can only access public resources.
 * - Reporters can only manage their own articles.
 * - Editors can manage and review all articles.
 */

const mongoose = require('mongoose');
const { Article } = require('../models');
const logger = require('../config/logger');

function isApiRequest(req) {
  return (
    req.originalUrl?.startsWith('/api/') ||
    req.method !== 'GET' ||
    Boolean(req.xhr) ||
    Boolean(req.headers.accept?.includes('application/json')) ||
    Boolean(req.headers['content-type']?.includes('application/json'))
  );
}

/**
 * Ensures the user has an active session.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }

  logger.audit('UNAUTHENTICATED_ACCESS_BLOCKED', null, {
    path: req.originalUrl,
    ip: req.ip
  });

  if (isApiRequest(req)) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in.'
    });
  }

  return res.redirect('/login');
}

/**
 * Ensures the authenticated user has one of the allowed roles.
 * @param  {...string} roles - e.g. 'Reporter', 'Editor'
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      if (isApiRequest(req)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required.'
        });
      }
      return res.redirect('/login');
    }

    const userRole = req.session.user.role;
    if (!roles.includes(userRole)) {
      logger.audit('UNAUTHORIZED_ACCESS_ATTEMPT', req.session.user.id, {
        requiredRoles: roles,
        userRole,
        path: req.originalUrl
      });

      if (isApiRequest(req)) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: You do not have permission to access this resource.'
        });
      }
      return res.status(403).render('error', { status: 403 });
    }

    next();
  };
}

/**
 * Ensures Reporters can only edit/modify their OWN articles.
 * Editors have permission to edit/modify all articles.
 */
async function checkArticleOwnership(req, res, next) {
  const user = req.session?.user;

  // 1. Guard against unauthenticated callers
  if (!user) {
    if (isApiRequest(req)) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }
    return res.redirect('/login');
  }

  const articleId = req.params.id || req.params.articleId || req.body?.articleId;

  // 2. Validate articleId presence and ObjectId format
  if (!articleId) {
    return res.status(400).json({ success: false, error: 'Article ID is required.' });
  }

  if (!mongoose.Types.ObjectId.isValid(articleId)) {
    return res.status(400).json({ success: false, error: 'Invalid article ID format.' });
  }

  try {
    const article = await Article.findById(articleId);
    if (!article) {
      return res.status(404).json({ success: false, error: 'Article not found.' });
    }

    // Editors have universal permissions
    if (user.role === 'Editor') {
      req.article = article;
      return next();
    }

    // Reporters can only access their own articles
    if (user.role === 'Reporter') {
      const authorIdStr = (article.authorId?._id || article.authorId)?.toString();
      const userIdStr = (user.id || user._id)?.toString();

      if (authorIdStr !== userIdStr) {
        logger.audit('REPORTER_ACCESS_DENIED_TO_FOREIGN_ARTICLE', user.id, {
          targetArticleId: articleId,
          actualAuthor: authorIdStr
        });

        return res.status(403).json({
          success: false,
          error: 'Forbidden: You are only allowed to modify your own articles.'
        });
      }

      req.article = article;
      return next();
    }

    return res.status(403).json({ success: false, error: 'Forbidden.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  requireAuth,
  requireRole,
  checkArticleOwnership,
  isApiRequest
};
