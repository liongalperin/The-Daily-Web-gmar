/**
 * Comment rate limiter: at most 3 comments per minute from the same device.
 * A 4th returns 429 with Retry-After and a message for the user.
 */

const { Comment } = require('../models');
const logger = require('../config/logger');

// Recent comment times per device, kept in memory so simultaneous requests are counted together
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

  // Identify the device by its device ID if one is sent, otherwise by IP
  const rateLimitKey = deviceId ? `dev:${deviceId}` : `ip:${ipAddress}`;
  const now = Date.now();

  // 1. Check and reserve a slot in memory first, before any await, so a burst of requests can't all pass
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

  // Reserve the slot now, before the database check below
  recentInMem.push(now);
  inMemoryRequestLog.set(rateLimitKey, recentInMem);

  // 2. Also count the comments already saved in the database (covers server restarts)
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
