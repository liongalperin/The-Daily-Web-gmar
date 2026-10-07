/**
 * Rate Limiter Middleware for Comments
 * Requirement: "אורח יכול לפרסם לכל היותר 3 תגובות בדקה מאותו מכשיר. ניסיון לעבור את המגבלה ייחסם על ידי השרת ויחזיר הודעה מתאימה למשתמש"
 */

const { Comment } = require('../models');
const logger = require('../config/logger');

// In-memory sliding window cache to eliminate TOCTOU concurrency race conditions
const inMemoryRequestLog = new Map();

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

function getDeviceId(req) {
  const rawId = req.headers['x-device-id'] || req.body?.deviceId;
  return typeof rawId === 'string' ? rawId.trim() : '';
}

// Clean up expired in-memory rate limit entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of inMemoryRequestLog.entries()) {
    const valid = timestamps.filter(t => now - t < 60000);
    if (valid.length === 0) {
      inMemoryRequestLog.delete(key);
    } else {
      inMemoryRequestLog.set(key, valid);
    }
  }
}, 5 * 60 * 1000).unref();

async function commentRateLimiter(req, res, next) {
  const ipAddress = getClientIp(req);
  const deviceId = getDeviceId(req);

  // Key by device ID if available (academic rubric requirement: "מאותו מכשיר"), otherwise by IP
  const rateLimitKey = deviceId ? `dev:${deviceId}` : `ip:${ipAddress}`;
  const now = Date.now();

  // 1. In-memory atomic check & synchronous slot reservation to prevent TOCTOU burst races
  const existingTimestamps = inMemoryRequestLog.get(rateLimitKey) || [];
  const recentInMem = existingTimestamps.filter(t => now - t < 60000);

  if (recentInMem.length >= 3) {
    const oldest = recentInMem[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + 60000 - now) / 1000));

    logger.warn('COMMENT_RATE_LIMIT_EXCEEDED_IN_MEMORY', {
      key: rateLimitKey,
      count: recentInMem.length,
      retryAfter
    });

    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({
      success: false,
      error: 'חריגה ממגבלת התגובות: ניתן לפרסם לכל היותר 3 תגובות בדקה ממכשיר זה.',
      message: `Too many comments. Please wait ${retryAfter} seconds before posting again.`,
      retryAfter
    });
  }

  // Synchronously claim slot before entering asynchronous database check
  recentInMem.push(now);
  inMemoryRequestLog.set(rateLimitKey, recentInMem);

  // 2. Database check against historical comments
  try {
    const check = await Comment.checkRateLimit({
      ipAddress,
      deviceId,
      windowSeconds: 60,
      maxComments: 3
    });

    if (!check.allowed) {
      logger.warn('COMMENT_RATE_LIMIT_EXCEEDED_DB', {
        ipAddress,
        deviceId,
        recentCount: check.recentCount,
        retryAfter: check.retryAfterSeconds
      });

      res.setHeader('Retry-After', check.retryAfterSeconds);
      return res.status(429).json({
        success: false,
        error: 'חריגה ממגבלת התגובות: ניתן לפרסם לכל היותר 3 תגובות בדקה ממכשיר זה.',
        message: `Too many comments. Please wait ${check.retryAfterSeconds} seconds before posting again.`,
        retryAfter: check.retryAfterSeconds
      });
    }

    req.clientIp = ipAddress;
    req.clientDeviceId = deviceId;
    next();
  } catch (error) {
    logger.error('Error in comment rate limiter:', error);
    // On unexpected error, proceed rather than halting service
    req.clientIp = ipAddress;
    req.clientDeviceId = deviceId;
    next();
  }
}

module.exports = {
  commentRateLimiter,
  getClientIp,
  getDeviceId
};
