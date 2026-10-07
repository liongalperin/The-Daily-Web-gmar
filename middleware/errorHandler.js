/**
 * Centralized Error Handling Middleware
 * Ensures server never crashes on invalid data, unauthorized actions, or exceptions.
 * Satisfies requirement: "פעולות שאינן מורשות או נתונים שאינם תקינים לא יגרמו לקריסת השרת"
 */

const logger = require('../config/logger');

function errorHandler(err, req, res, next) {
  // Guard against header already sent exceptions
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  let details = err.details || null;

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error occurred';
    details = err.errors ? Object.values(err.errors).map(e => e.message) : [err.message];
  }

  // Handle Mongoose CastError (e.g. invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for parameter: ${err.path || 'id'}`;
  }

  // Handle MongoDB Duplicate Key Error (Code 11000)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    message = `Duplicate value: a record with this ${field} already exists`;
  }

  // Log error (critical 500s or operational 4xx)
  if (statusCode >= 500) {
    logger.error(`[${req.method}] ${req.originalUrl} - 500 Server Error`, err);
  } else {
    logger.warn(`[${req.method}] ${req.originalUrl} - ${statusCode} ${message}`, { details });
  }

  const isApi = req.originalUrl?.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json');

  if (isApi) {
    return res.status(statusCode).json({
      success: false,
      error: message,
      details: details || undefined,
      ...(process.env.NODE_ENV === 'development' && statusCode >= 500 ? { stack: err.stack } : {})
    });
  }

  // Safe fallback for HTML requests: render error page with callback to avoid uncaught view missing exceptions
  res.status(statusCode);
  if (req.app.get('view engine') && res.render) {
    return res.render(
      'pages/error',
      {
        title: 'שגיאה',
        statusCode,
        message,
        user: req.session?.user || null
      },
      (renderErr, html) => {
        if (renderErr) {
          // If error.ejs does not exist, safely respond with HTML string
          return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>שגיאה ${statusCode}</title></head><body><h1>שגיאה ${statusCode}</h1><p>${message}</p><a href="/">חזרה לעמוד הראשי</a></body></html>`);
        }
        return res.send(html);
      }
    );
  }

  return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>שגיאה ${statusCode}</title></head><body><h1>שגיאה ${statusCode}</h1><p>${message}</p><a href="/">חזרה לעמוד הראשי</a></body></html>`);
}

module.exports = errorHandler;
