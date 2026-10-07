/**
 * Minimal i18n + UI-preferences middleware (no external libraries).
 *
 * Usage (in app.js, before the routes):
 *   app.use(require('./utils/i18n'));
 *
 * Exposes to every EJS view (res.locals):
 *   lang, dir          - 'he' | 'en', 'rtl' | 'ltr'  (from the "lang" cookie, default Hebrew)
 *   theme              - 'light' | 'dark' | null     (from the "theme" cookie; null = follow the OS)
 *   t(key, vars)       - translated string with {placeholder} interpolation
 *   formatDate(d, o)   - localized date via Intl.DateTimeFormat
 *   formatNumber(n, o) - localized number via Intl.NumberFormat
 *   isoDate(d)         - ISO string for <time datetime> ("" when invalid)
 *   categories         - list of section slugs
 *   clientI18n         - the current dictionary as script-safe JSON (for main.js)
 */
const en = require('../locales/en.json');
const he = require('../locales/he.json');
const { CATEGORIES } = require('./categories');

const LOCALES = { he, en };
const DEFAULT_LANG = 'he';
const RTL_LANGS = ['he'];
const THEMES = ['light', 'dark'];

// Serialized once per language. "<" is escaped so the JSON can never close the <script> tag.
const CLIENT_JSON = {};
for (const [lang, dict] of Object.entries(LOCALES)) {
  CLIENT_JSON[lang] = JSON.stringify(dict).replace(/</g, '\\u003c');
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // Ignore malformed cookie values instead of crashing the request.
    }
  }
  return cookies;
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

function i18n(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const lang = LOCALES[cookies.lang] ? cookies.lang : DEFAULT_LANG;
  const dict = LOCALES[lang];

  req.lang = lang;
  res.locals.lang = lang;
  res.locals.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';
  res.locals.theme = THEMES.includes(cookies.theme) ? cookies.theme : null;
  res.locals.categories = res.locals.categories || CATEGORIES;
  res.locals.clientI18n = CLIENT_JSON[lang];

  res.locals.t = (key, vars) => interpolate(dict[key] ?? en[key] ?? key, vars);

  res.locals.formatDate = (value, options = { dateStyle: 'medium', timeStyle: 'short' }) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(lang, options).format(date);
  };

  // Machine-readable value for <time datetime="">; empty string instead of throwing on bad input.
  res.locals.isoDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  };

  res.locals.formatNumber =(value, options = { notation: 'compact' }) =>
    new Intl.NumberFormat(lang, options).format(Number(value) || 0);

  next();
}

module.exports = i18n;
module.exports.LOCALES = LOCALES;
module.exports.parseCookies = parseCookies;
