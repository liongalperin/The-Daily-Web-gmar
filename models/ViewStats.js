/**
 * ViewStats Model (Impact Analytics)
 * Scalable time-bucketed design for handling thousands of concurrent readers.
 * Each article has bucketed view counts over time.
 * Supports full CRUD operations.
 */

const mongoose = require('mongoose');

const viewItemSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      required: true
    },
    count: {
      type: Number,
      required: true,
      default: 1,
      min: 0
    }
  },
  { _id: false }
);

const viewStatsSchema = new mongoose.Schema(
  {
    articleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Article',
      required: [true, 'Article ID is required'],
      unique: true
    },
    views: [viewItemSchema],
    totalViews: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

// Truncate a date to hourly bucket for scalable analytics aggregation
viewStatsSchema.statics.getHourBucket = function (date = new Date()) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
};

// Add one view to the article's current hour, with atomic updates so simultaneous views aren't lost
viewStatsSchema.statics.recordView = async function (articleId, viewDate = new Date()) {
  if (!mongoose.Types.ObjectId.isValid(articleId)) return null;

  const bucket = this.getHourBucket(viewDate);

  // Guarantee base document exists
  await this.updateOne(
    { articleId },
    { $setOnInsert: { articleId, views: [], totalViews: 0 } },
    { upsert: true }
  );

  // 1. Try to increment existing bucket
  let updated = await this.findOneAndUpdate(
    { articleId, 'views.timestamp': bucket },
    {
      $inc: { 'views.$.count': 1, totalViews: 1 }
    },
    { returnDocument: 'after' }
  );

  // 2. If bucket doesn't exist, atomically push bucket only if it is NOT yet present
  if (!updated) {
    updated = await this.findOneAndUpdate(
      { articleId, 'views.timestamp': { $ne: bucket } },
      {
        $push: { views: { timestamp: bucket, count: 1 } },
        $inc: { totalViews: 1 }
      },
      { returnDocument: 'after' }
    );
  }

  // 3. If another concurrent request pushed the bucket right before us, increment that bucket
  if (!updated) {
    updated = await this.findOneAndUpdate(
      { articleId, 'views.timestamp': bucket },
      {
        $inc: { 'views.$.count': 1, totalViews: 1 }
      },
      { returnDocument: 'after' }
    );
  }

  // 4. Synchronize Article.totalViews for accurate popularity sorting
  await mongoose.model('Article').findByIdAndUpdate(
    articleId,
    { $inc: { totalViews: 1 } }
  ).catch(() => {});

  return updated;
};

// Data for the Impact Analytics chart: hourly views plus the times updates were published
viewStatsSchema.statics.getImpactAnalytics = async function (articleId) {
  if (!mongoose.Types.ObjectId.isValid(articleId)) {
    return { viewData: [], updatePoints: [] };
  }

  const [stats, article] = await Promise.all([
    this.findOne({ articleId }).lean(),
    mongoose.model('Article').findById(articleId).select('publishHistory publicVersion draftVersion').lean()
  ]);

  const viewData = (stats?.views || [])
    .slice()
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map(v => ({
      time: new Date(v.timestamp).toISOString(),
      views: v.count
    }));

  const updatePoints = (article?.publishHistory || []).map(d => new Date(d).toISOString());

  return {
    articleId,
    title: article?.publicVersion?.title || article?.draftVersion?.title || 'Unknown',
    viewData,
    updatePoints,
    totalViews: stats?.totalViews || 0
  };
};

// CRUD helpers
viewStatsSchema.statics.createStats = function (articleId, initialViews = []) {
  const total = initialViews.reduce((acc, curr) => acc + (curr.count || 0), 0);
  return this.create({
    articleId,
    views: initialViews,
    totalViews: total
  });
};

viewStatsSchema.statics.getStatsByArticle = function (articleId) {
  if (!mongoose.Types.ObjectId.isValid(articleId)) return null;
  return this.findOne({ articleId }).lean();
};

viewStatsSchema.statics.getAllStats = function ({ page = 1, limit = 50 } = {}) {
  const skip = (Math.max(1, page) - 1) * limit;
  return this.find().skip(skip).limit(limit).lean();
};

viewStatsSchema.statics.updateStatsByArticle = function (articleId, updates) {
  if (!mongoose.Types.ObjectId.isValid(articleId)) return null;
  return this.findOneAndUpdate({ articleId }, { $set: updates }, { returnDocument: 'after' });
};

viewStatsSchema.statics.deleteStatsByArticle = function (articleId) {
  if (!mongoose.Types.ObjectId.isValid(articleId)) return null;
  return this.findOneAndDelete({ articleId });
};

const ViewStats = mongoose.model('ViewStats', viewStatsSchema);
module.exports = ViewStats;
