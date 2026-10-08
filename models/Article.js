/**
 * Article Model
 * Supports dual versioning (publicVersion vs draftVersion),
 * strict state machine transitions, publish history, and performance indexes.
 */

const mongoose = require('mongoose');

const versionSubSchema = {
  title: {
    type: String,
    trim: true,
    default: '',
    maxlength: [300, 'Title cannot exceed 300 characters']
  },
  content: {
    type: String,
    default: '',
    maxlength: [50000, 'Content cannot exceed 50,000 characters']
  },
  snippet: {
    type: String,
    trim: true,
    default: '',
    maxlength: [500, 'Snippet cannot exceed 500 characters']
  },
  summary: {
    type: String,
    trim: true,
    default: '',
    maxlength: [500, 'Summary cannot exceed 500 characters']
  },
  imageUrl: {
    type: String,
    trim: true,
    default: '/images/default-news.jpg',
    maxlength: [2000, 'Image URL cannot exceed 2,000 characters']
  },
  category: {
    type: String,
    trim: true,
    default: 'news'
  }
};

const articleSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Article author is required'],
      index: true
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      default: 'news',
      index: true
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: ['Draft', 'Pending', 'Published', 'Returned'],
        message: 'Invalid article status'
      },
      default: 'Draft',
      index: true
    },
    publicVersion: {
      ...versionSubSchema,
      publishedAt: {
        type: Date
      }
    },
    draftVersion: {
      ...versionSubSchema,
      updatedAt: {
        type: Date,
        default: Date.now
      }
    },
    editorNote: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'Editor note cannot exceed 1000 characters']
    },
    publishHistory: [
      {
        type: Date
      }
    ],
    totalViews: {
      type: Number,
      default: 0,
      min: 0,
      index: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual alias: article.views === article.totalViews (for Dev 2 compatibility)
articleSchema.virtual('views').get(function () {
  return this.totalViews;
});

// Virtual for comment count
articleSchema.virtual('commentsCount', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'articleId',
  count: true
});

// High performance indexes matching exact query patterns
articleSchema.index({ 'publicVersion.publishedAt': -1 });
articleSchema.index({ category: 1, 'publicVersion.publishedAt': -1 });
articleSchema.index({ totalViews: -1, 'publicVersion.publishedAt': -1 });
articleSchema.index({ category: 1, totalViews: -1, 'publicVersion.publishedAt': -1 });

// Indexes for Staff Dashboards (Reporter & Editor)
articleSchema.index({ status: 1, updatedAt: -1 });
articleSchema.index({ authorId: 1, status: 1, updatedAt: -1 });
articleSchema.index({ authorId: 1, updatedAt: -1 });

// Fields that make up a version; a draft differs from the public version if any of them differ
const VERSION_FIELDS = ['title', 'summary', 'content', 'imageUrl', 'category'];

// State Machine Transition Rules
// Published -> Pending (reporter) and Published -> Published (editor's own edits) also need
// draft changes; the controllers check that with hasDraftChanges().
articleSchema.statics.canTransition = function (currentStatus, targetStatus, role) {
  if (role === 'Reporter') {
    if (currentStatus === 'Draft' && targetStatus === 'Pending') return true;
    if (currentStatus === 'Returned' && targetStatus === 'Pending') return true;
    if (currentStatus === 'Published' && targetStatus === 'Pending') return true;
    return false;
  }

  if (role === 'Editor') {
    // Editors can only review and transition articles that are in Pending status
    if (currentStatus === 'Pending' && (targetStatus === 'Published' || targetStatus === 'Returned')) {
      return true;
    }
    // An editor publishes their own edits to a live article directly
    if (currentStatus === 'Published' && targetStatus === 'Published') return true;
    return false;
  }

  return false;
};

// True when the working draft differs from what readers see now
articleSchema.statics.hasDraftChanges = function (article) {
  const draft = article.draftVersion || {};
  const pub = article.publicVersion || {};
  if (!pub.publishedAt) return true;
  return VERSION_FIELDS.some((field) => (draft[field] || '') !== (pub[field] || ''));
};

// Image URLs: empty, a full http(s) link, or a path on this site ("/images/..."), never "//host" or "javascript:"
articleSchema.statics.isSafeImageUrl = function (url) {
  if (url === undefined || url === null || url === '') return true;
  return typeof url === 'string' && /^(https?:\/\/|\/(?!\/))/i.test(url.trim());
};

// Why a draft can't go to review or be published yet, or null when it can
articleSchema.statics.draftProblem = function (draft = {}) {
  if (!String(draft.title || '').trim()) return 'The article needs a title.';
  if (!String(draft.content || '').trim()) return 'The article needs body text.';
  if (!this.isSafeImageUrl(draft.imageUrl)) return 'The image URL must be an http(s) link or a path on this site.';
  return null;
};

// Feed cards for GET / and GET /api/articles:
// { _id, id, title, summary, imageUrl, category, authorName, author, publishedAt, views, commentsCount, viewed }
// Never includes login usernames or draft data.
articleSchema.statics.toFeedItems = async function (rawArticles, viewedIds = []) {
  const ids = rawArticles.map((a) => a._id);
  const counts = ids.length
    ? await mongoose.model('Comment').aggregate([
      { $match: { articleId: { $in: ids } } },
      { $group: { _id: '$articleId', count: { $sum: 1 } } }
    ])
    : [];
  const countById = new Map(counts.map((c) => [String(c._id), c.count]));
  const viewed = new Set(viewedIds.map(String));

  return rawArticles.map((a) => {
    const pub = a.publicVersion || {};
    const author = a.authorId && typeof a.authorId === 'object' && a.authorId._id ? a.authorId : null;
    const authorName = author ? (author.fullName || author.username || '') : '';
    const id = String(a._id);
    return {
      _id: a._id,
      id,
      title: pub.title || '',
      summary: pub.summary || pub.snippet || '',
      imageUrl: pub.imageUrl || '/images/default-news.jpg',
      category: a.category,
      authorName,
      author: author ? { id: author._id, fullName: authorName } : null,
      publishedAt: pub.publishedAt || a.createdAt,
      views: a.totalViews || 0,
      commentsCount: countById.get(id) || 0,
      viewed: viewed.has(id)
    };
  });
};

// Full CRUD Static Helpers for academic rubric requirement
articleSchema.statics.createArticle = function (data) {
  const summaryText = data.summary || data.snippet || (data.content ? data.content.slice(0, 150) + '...' : '');
  const category = data.category || 'news';
  const initialDraft = {
    title: data.title || '',
    content: data.content || '',
    snippet: summaryText,
    summary: summaryText,
    category,
    imageUrl: data.imageUrl || '/images/default-news.jpg',
    updatedAt: new Date()
  };

  return this.create({
    authorId: data.authorId,
    category,
    status: data.status || 'Draft',
    draftVersion: initialDraft,
    publicVersion: data.status === 'Published' ? { ...initialDraft, publishedAt: new Date() } : {},
    publishHistory: data.status === 'Published' ? [new Date()] : []
  });
};

articleSchema.statics.getArticleById = function (id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return this.findById(id).populate('authorId', 'username fullName role');
};

articleSchema.statics.searchPublishedArticles = function ({
  search = '',
  category = '',
  sort = 'date', // 'date' | 'popular' ('popularity' also accepted)
  viewed = 'all', // 'all' | 'viewed' | 'unviewed', against viewedIds (the session's opened articles)
  viewedIds = [],
  page = 1,
  limit = 20
} = {}) {
  const query = {
    'publicVersion.publishedAt': { $exists: true, $ne: null }
  };

  if (viewed === 'viewed' || viewed === 'unviewed') {
    const ids = viewedIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
    query._id = viewed === 'viewed' ? { $in: ids } : { $nin: ids };
  }

  if (category && category !== 'all' && category !== 'הכל') {
    query.category = category;
  }

  if (search && typeof search === 'string' && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { 'publicVersion.title': { $regex: escaped, $options: 'i' } },
      { 'publicVersion.summary': { $regex: escaped, $options: 'i' } },
      { 'publicVersion.snippet': { $regex: escaped, $options: 'i' } },
      { 'publicVersion.content': { $regex: escaped, $options: 'i' } }
    ];
  }

  const sortOption = sort === 'popular' || sort === 'popularity'
    ? { totalViews: -1, 'publicVersion.publishedAt': -1 }
    : { 'publicVersion.publishedAt': -1 };

  const skip = (Math.max(1, page) - 1) * limit;

  return this.find(query)
    .select('category status publicVersion.title publicVersion.summary publicVersion.snippet publicVersion.imageUrl publicVersion.publishedAt authorId totalViews createdAt')
    .populate('authorId', 'username fullName')
    .sort(sortOption)
    .skip(skip)
    .limit(limit)
    .lean();
};

articleSchema.statics.updateDraft = async function (id, draftData) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;

  const summaryText = draftData.summary || draftData.snippet || (draftData.content ? draftData.content.slice(0, 150) + '...' : '');
  const updatePayload = {
    $set: {
      'draftVersion.title': draftData.title,
      'draftVersion.content': draftData.content,
      'draftVersion.snippet': summaryText,
      'draftVersion.summary': summaryText,
      'draftVersion.imageUrl': draftData.imageUrl,
      'draftVersion.updatedAt': new Date()
    }
  };

  if (draftData.category) {
    updatePayload.$set['draftVersion.category'] = draftData.category;
  }

  return this.findByIdAndUpdate(id, updatePayload, { returnDocument: 'after', runValidators: true });
};

// Workflow: Submit draft to Editor for review
articleSchema.statics.submitForReview = function (id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return this.findByIdAndUpdate(
    id,
    { $set: { status: 'Pending' } },
    { returnDocument: 'after', runValidators: true }
  );
};

// Workflow: Publish article atomically (promote draft to public, add timestamp to history)
articleSchema.statics.publishArticle = async function (id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const article = await this.findById(id);
  if (!article) return null;

  const now = new Date();
  const draftCategory = article.draftVersion.category || article.category || 'news';

  article.publicVersion = {
    title: article.draftVersion.title,
    content: article.draftVersion.content,
    snippet: article.draftVersion.snippet || article.draftVersion.summary,
    summary: article.draftVersion.summary || article.draftVersion.snippet,
    imageUrl: article.draftVersion.imageUrl,
    category: draftCategory,
    publishedAt: now
  };
  article.category = draftCategory;
  article.status = 'Published';
  article.editorNote = '';
  article.publishHistory.push(now);

  return article.save();
};

// Workflow: Return article to Reporter with notes
articleSchema.statics.returnArticle = function (id, editorNote = '') {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return this.findByIdAndUpdate(
    id,
    {
      $set: {
        status: 'Returned',
        editorNote: typeof editorNote === 'string' ? editorNote.trim() : ''
      }
    },
    { returnDocument: 'after', runValidators: true }
  );
};

// Staff query: reporter desk
articleSchema.statics.getArticlesByReporter = function (authorId, { page = 1, limit = 50, status } = {}) {
  const query = { authorId };
  if (status) query.status = status;
  const skip = (Math.max(1, page) - 1) * limit;
  return this.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean();
};

// Staff search: title of the draft or of the public version, case-insensitive
articleSchema.statics.staffTitleFilter = function (search) {
  if (!search || typeof search !== 'string' || !search.trim()) return null;
  const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    { 'draftVersion.title': { $regex: escaped, $options: 'i' } },
    { 'publicVersion.title': { $regex: escaped, $options: 'i' } }
  ];
};

// Staff query: editor desk
articleSchema.statics.getArticlesForEditor = function ({ page = 1, limit = 50, status, search } = {}) {
  const query = {};
  if (status) query.status = status;
  const titleFilter = this.staffTitleFilter(search);
  if (titleFilter) query.$or = titleFilter;
  const skip = (Math.max(1, page) - 1) * limit;
  return this.find(query).populate('authorId', 'username fullName').sort({ updatedAt: -1 }).skip(skip).limit(limit).lean();
};

articleSchema.statics.deleteArticleById = async function (id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const deleted = await this.findByIdAndDelete(id);
  if (deleted) {
    await Promise.all([
      mongoose.model('Comment').deleteMany({ articleId: id }).catch(() => {}),
      mongoose.model('ViewStats').deleteOne({ articleId: id }).catch(() => {})
    ]);
  }
  return deleted;
};

const Article = mongoose.model('Article', articleSchema);
module.exports = Article;
