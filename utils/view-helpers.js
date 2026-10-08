/**
 * View helpers for the newsroom (staff) pages.
 *
 * Usage (in app.js, after utils/i18n):
 *   app.use(require('./utils/view-helpers'));
 *
 * Exposes to every EJS view (res.locals):
 *   articleView(article) - normalizes an Article document (see docs/data-scheme.md) into the
 *                          flat shape the views use, so they don't depend on populate() details.
 *   STATUSES             - the four article states, in workflow order.
 */
const STATUSES = ['Draft', 'Pending', 'Published', 'Returned'];
const VERSION_FIELDS = ['title', 'summary', 'content', 'imageUrl', 'category'];

function plain(doc) {
  if (!doc) return {};
  return typeof doc.toObject === 'function' ? doc.toObject() : doc;
}

function authorNameOf(article) {
  if (article.authorName) return article.authorName;
  const author = article.author || article.authorId;
  return author && typeof author === 'object' && author.username ? author.username : '';
}

function articleView(raw) {
  const article = plain(raw);
  const draft = plain(article.draftVersion);
  const pub = plain(article.publicVersion);

  // A publicVersion with a publish date means readers already see some version of this article.
  const isLive = Boolean(pub.publishedAt);
  const hasDraftChanges = typeof article.hasDraftChanges === 'boolean'
    ? article.hasDraftChanges
    : isLive && VERSION_FIELDS.some((field) => (draft[field] || '') !== (pub[field] || ''));

  const pick = (field) => (draft[field] !== undefined && draft[field] !== null ? draft[field] : (pub[field] || article[field] || ''));

  const status = STATUSES.includes(article.status) ? article.status : 'Draft';
  const content = String(pick('content'));

  return {
    id: String(article._id),
    status,
    category: article.category || '',
    authorName: authorNameOf(article),
    editorNote: article.editorNote || '',
    updatedAt: article.updatedAt || null,
    submittedAt: article.submittedAt || article.updatedAt || null,
    publishedAt: pub.publishedAt || null,
    views: article.views,
    isLive,
    hasDraftChanges,
    // Working copy (what the reporter edits / the editor reviews)
    title: pick('title'),
    summary: pick('summary'),
    content,
    imageUrl: pick('imageUrl'),
    wordCount: content.trim() ? content.trim().split(/\s+/).length : 0,
    // Version readers currently see
    published: {
      title: pub.title || '',
      summary: pub.summary || '',
      content: pub.content || '',
      imageUrl: pub.imageUrl || ''
    },
    // Workflow rules for showing buttons. The server enforces the same rules; this is presentation only.
    reporterCanEdit: status !== 'Pending',
    reporterCanSubmit: status === 'Draft' || status === 'Returned' || (status === 'Published' && hasDraftChanges),
    editorCanDecide: status === 'Pending',
    // Approve also publishes the editor's own edits to a live article
    editorCanPublish: status === 'Pending' || (status === 'Published' && hasDraftChanges)
  };
}

/** Splits stored plain text into paragraphs (one per non-empty line). */
function paragraphs(text) {
  return String(text || '').split(/\r?\n+/).map((line) => line.trim()).filter(Boolean);
}

function viewHelpers(req, res, next) {
  res.locals.articleView = articleView;
  res.locals.paragraphs = paragraphs;
  res.locals.STATUSES = STATUSES;
  next();
}

module.exports = viewHelpers;
module.exports.articleView = articleView;
module.exports.paragraphs = paragraphs;
module.exports.STATUSES = STATUSES;
