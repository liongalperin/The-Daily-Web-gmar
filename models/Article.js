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
    default: ''
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
    default: '/images/default-news.jpg'
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

// State Machine Transition Rules
articleSchema.statics.canTransition = function (currentStatus, targetStatus, role) {
  if (currentStatus === targetStatus) return true;

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
    return false;
  }

  return false;
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
  sort = 'date', // 'date' | 'popularity'
  page = 1,
  limit = 20
} = {}) {
  const query = {
    'publicVersion.publishedAt': { $exists: true, $ne: null }
  };

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

  const sortOption = sort === 'popularity'
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

// Staff query: editor desk
articleSchema.statics.getArticlesForEditor = function ({ page = 1, limit = 50, status } = {}) {
  const query = {};
  if (status) query.status = status;
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
