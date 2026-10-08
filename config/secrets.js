/**
 * Session secret.
 * No secret is stored in the repository. The secret comes from SESSION_SECRET in .env; for local runs
 * without one, a random secret is generated once and kept in .session-secret (ignored by Git), so
 * logins still survive a server restart. Production refuses to start without SESSION_SECRET.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const LOCAL_SECRET_FILE = path.join(__dirname, '..', '.session-secret');

let cached = null;

function getSessionSecret() {
  if (cached) return cached;

  if (process.env.SESSION_SECRET) {
    cached = process.env.SESSION_SECRET;
    return cached;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production (see .env.example).');
  }

  try {
    cached = fs.readFileSync(LOCAL_SECRET_FILE, 'utf8').trim();
  } catch (error) {
    cached = '';
  }

  if (!cached) {
    cached = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(LOCAL_SECRET_FILE, cached + '\n', { mode: 0o600 });
      logger.info('No SESSION_SECRET set: generated a local one in .session-secret');
    } catch (error) {
      // Read-only folder: sessions still work, but end on restart
      logger.warn('No SESSION_SECRET set and .session-secret could not be written; logins will end on restart');
    }
  }

  return cached;
}

module.exports = { getSessionSecret };
