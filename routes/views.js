/**
 * Web View Routes
 * Maps browser routes to SSR EJS view controllers.
 */

const express = require('express');
const router = express.Router();
const viewController = require('../controllers/viewController');
const { requireAuth, requireRole } = require('../middleware/auth');
const logger = require('../config/logger');

// Prevent browser caching on authenticated desks (bfcache protection)
function noCache(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  next();
}

// Public Pages
router.get('/', viewController.renderHome);
router.get('/articles/:id', viewController.renderArticle);
router.get('/login', viewController.renderLogin);

// SSR / Fallback Logout Route
router.get('/logout', (req, res) => {
  if (req.session) {
    const userId = req.session.user?.id || 'ANONYMOUS';
    req.session.destroy((err) => {
      if (err) logger.error('Error destroying session on GET /logout', { error: err.message });
      res.clearCookie('connect.sid', { path: '/' });
      return res.redirect('/');
    });
  } else {
    return res.redirect('/');
  }
});

// Reporter Desk (Accessible by Reporters and Editors)
router.get('/reporter/desk', requireAuth, requireRole('Reporter', 'Editor'), noCache, viewController.renderReporterDesk);
router.get('/reporter', requireAuth, requireRole('Reporter', 'Editor'), (req, res) => res.redirect('/reporter/desk'));

// Editor Desk (Editor-only)
router.get('/editor/desk', requireAuth, requireRole('Editor'), noCache, viewController.renderEditorDesk);
router.get('/editor', requireAuth, requireRole('Editor'), (req, res) => res.redirect('/editor/desk'));

module.exports = router;
