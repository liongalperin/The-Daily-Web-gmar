/**
 * Central error handler: turns thrown errors into a JSON or HTML error response
 * instead of crashing the server.
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

  // Body parser errors: never echo the parser's own message
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON in request body';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
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

  // Internal details stay in the log
  if (statusCode >= 500) {
    message = 'Server error';
    details = null;
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

  // HTML requests: the site's error page; plain HTML if even that fails to render
  res.status(statusCode);
  return res.render('error', { status: statusCode }, (renderErr, html) => {
    if (renderErr) {
      logger.error('Failed to render error page', renderErr);
      return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${statusCode}</title></head><body><h1>${statusCode}</h1><a href="/">The Daily Web</a></body></html>`);
    }
    return res.send(html);
  });
}

module.exports = errorHandler;
