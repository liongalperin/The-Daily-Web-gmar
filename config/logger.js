/**
 * Logger: writes app, error and audit (security) events to files in logs/.
 */

const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (err) {
    // If running in read-only environment, fallback to console
  }
}

const errorLogPath = path.join(logDir, 'error.log');
const appLogPath = path.join(logDir, 'app.log');
const auditLogPath = path.join(logDir, 'audit.log');

function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (err) {
    try {
      const seen = new WeakSet();
      return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        return value;
      });
    } catch {
      return '[Unserializable Object]';
    }
  }
}

function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  let metaStr = '';
  if (meta) {
    if (meta instanceof Error) {
      metaStr = `\n${meta.stack || meta.message}`;
    } else {
      metaStr = ` | ${safeStringify(meta)}`;
    }
  }
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
}

function writeToFile(filePath, text) {
  try {
    fs.appendFile(filePath, text, () => {});
  } catch (err) {
    // Non-blocking, ignore disk write errors
  }
}

const logger = {
  info: (msg, meta) => {
    const formatted = formatMessage('info', msg, meta);
    process.stdout.write(formatted);
    writeToFile(appLogPath, formatted);
  },
  warn: (msg, meta) => {
    const formatted = formatMessage('warn', msg, meta);
    process.stdout.write(formatted);
    writeToFile(appLogPath, formatted);
  },
  error: (msg, meta) => {
    const formatted = formatMessage('error', msg, meta);
    process.stderr.write(formatted);
    writeToFile(errorLogPath, formatted);
    writeToFile(appLogPath, formatted);
  },
  audit: (action, userId, details) => {
    const formatted = formatMessage('audit', `User [${userId || 'ANONYMOUS'}] performed: ${action}`, details);
    process.stdout.write(formatted);
    writeToFile(auditLogPath, formatted);
    writeToFile(appLogPath, formatted);
  }
};

module.exports = logger;
