/**
 * Web View Routes
 * Maps browser routes to SSR EJS view controllers.
 */

const express = require('express');
const router = express.Router();
const viewController = require('../controllers/viewController');
const { requireAuth, requireRole } = require('../middleware/auth');

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
router.post('/login', viewController.handleLogin);

// Logout Routes
router.post('/logout', viewController.handleLogout);
router.get('/logout', viewController.handleLogout);

// Reporter dashboard and article editor
router.get('/reporter', requireAuth, requireRole('Reporter', 'Editor'), noCache, viewController.renderReporterDashboard);
router.get('/reporter/dashboard', requireAuth, requireRole('Reporter', 'Editor'), noCache, viewController.renderReporterDashboard);
router.get('/reporter/articles/:id/edit', requireAuth, requireRole('Reporter', 'Editor'), noCache, viewController.renderReporterEdit);

// Editor dashboard, review and analytics
router.get('/editor', requireAuth, requireRole('Editor'), noCache, viewController.renderEditorDashboard);
router.get('/editor/dashboard', requireAuth, requireRole('Editor'), noCache, viewController.renderEditorDashboard);
router.get('/editor/articles/:id', requireAuth, requireRole('Editor'), noCache, viewController.renderEditorReview);
router.get('/editor/articles/:id/edit', requireAuth, requireRole('Editor'), noCache, viewController.renderReporterEdit);
router.get('/editor/analytics', requireAuth, requireRole('Editor'), noCache, viewController.renderEditorAnalytics);

// Compatibility Desks
router.get('/reporter/desk', requireAuth, requireRole('Reporter', 'Editor'), noCache, viewController.renderReporterDesk);
router.get('/editor/desk', requireAuth, requireRole('Editor'), noCache, viewController.renderEditorDesk);

module.exports = router;
