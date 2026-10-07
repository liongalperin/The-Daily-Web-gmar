/**
 * The newspaper's sections. The slug is what gets stored in Article.category.
 * Labels come from the locale files (cat.<slug>), and colors from the
 * --sec-<slug> CSS variables in public/css/style.css.
 */
const CATEGORIES = ['news', 'politics', 'business', 'tech', 'sports', 'culture', 'transport'];

module.exports = { CATEGORIES };
