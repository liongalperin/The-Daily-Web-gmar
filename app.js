/**
 * The Daily Web - Main Express Application Factory
 * Implements MVC Architecture with persistent sessions and security middleware.
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const connectMongo = require('connect-mongo');
const MongoStore = connectMongo.default || connectMongo.MongoStore || connectMongo;
const mongoose = require('mongoose');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const errorHandler = require('./middleware/errorHandler');

function createApp(customSessionStore = null) {
  const app = express();

  // Reverse proxy support
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // View Engine Configuration (EJS for SSR)
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // Static Assets
  app.use(express.static(path.join(__dirname, 'public')));

  // HTTP Request Logging
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  // Request Body Parsers
  // 50,000-character articles (Hebrew is 2 bytes per letter in UTF-8) plus the other fields
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));
  // No body or another content type leaves req.body undefined in Express 5; controllers expect an object
  app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
  });

  // Session Store Setup (Persists across server restarts via MongoDB)
  let sessionStore = customSessionStore;
  if (!sessionStore) {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      sessionStore = MongoStore.create({
        client: mongoose.connection.getClient(),
        collectionName: 'sessions',
        ttl: 14 * 24 * 60 * 60 // 14 days
      });
    } else {
      sessionStore = MongoStore.create({
        mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/dailyweb',
        collectionName: 'sessions',
        ttl: 14 * 24 * 60 * 60
      });
    }
  }

  // Session Configuration
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'dailyweb_default_session_secret_123',
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      }
    })
  );

  // Internationalization & View Helpers (for Dev 2 EJS views)
  const i18n = require('./utils/i18n');
  const viewHelpers = require('./utils/view-helpers');
  app.use(i18n);
  app.use(viewHelpers);

  // Global Template Variables (for Developer 2's EJS views)
  app.use((req, res, next) => {
    res.locals.user = req.session?.user || null;
    res.locals.currentUser = req.session?.user || null;
    res.locals.isAuthenticated = !!(req.session && req.session.user);
    res.locals.currentPath = req.path;
    next();
  });

  // Healthcheck endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      dbConnected: mongoose.connection.readyState === 1,
      timestamp: new Date().toISOString()
    });
  });

  // Mount API and Auth Routes
  const apiRoutes = require('./routes/api');
  app.use('/api', apiRoutes);
  app.use('/api/auth', authRoutes);
  // Mount View Routes (SSR Pages for Browser)
  const viewRoutes = require('./routes/views');
  app.use('/', viewRoutes);

  // Catch-all 404 for unmatched API endpoints
  app.use('/api', (req, res, next) => {
    res.status(404).json({
      success: false,
      error: `API route not found: ${req.method} ${req.originalUrl}`
    });
  });

  // Catch-all 404 for unmatched SSR View routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/test')) {
      return next();
    }
    res.status(404).render('error', { status: 404 });
  });

  // Global Error Handler Middleware
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
