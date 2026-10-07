/**
 * Phase 4 Verification Test: Seed Script & Query Performance at Scale (500+ articles)
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const seedDatabase = require('../scripts/seed');
const { User, Article, Comment, ViewStats } = require('../models');

async function runPhase4Tests() {
  console.log('🚀 Starting Phase 4 High-Volume Seed & Performance Verification...');

  let mongod;
  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    // 1. Run Seed Script
    console.log('\n--- 1. Executing Seed Script ---');
    const startTime = Date.now();
    await seedDatabase(uri);
    const duration = Date.now() - startTime;
    console.log(`⏱️ Seed execution completed in ${duration}ms`);

    // Connect to verify
    await mongoose.connect(uri);

    // 2. Verify Volume and Distribution
    console.log('\n--- 2. Verifying Dataset Integrity ---');
    const totalArticles = await Article.countDocuments();
    console.log('Total articles count:', totalArticles);
    if (totalArticles < 500) {
      throw new Error(`Academic rubric violation: expected >= 500 articles, found ${totalArticles}`);
    }

    const publishedCount = await Article.countDocuments({ status: 'Published' });
    const pendingCount = await Article.countDocuments({ status: 'Pending' });
    const draftCount = await Article.countDocuments({ status: 'Draft' });
    const returnedCount = await Article.countDocuments({ status: 'Returned' });

    console.log(`Distribution: Published=${publishedCount}, Pending=${pendingCount}, Draft=${draftCount}, Returned=${returnedCount}`);
    if (publishedCount === 0 || pendingCount === 0 || draftCount === 0 || returnedCount === 0) {
      throw new Error('All 4 statuses must be populated with demo data');
    }

    // 3. Verify Users
    console.log('\n--- 3. Verifying User Accounts ---');
    const editor = await User.getUserByUsername('editor', true);
    if (!editor || editor.role !== 'Editor') throw new Error('Editor account missing');
    const isEditorPassValid = await editor.comparePassword('password123');
    if (!isEditorPassValid) throw new Error('Editor password check failed');
    console.log('✅ Editor credentials verified (editor / password123)');

    const reporters = await User.find({ role: 'Reporter' });
    if (reporters.length < 3) throw new Error('Multiple reporters required');
    console.log(`✅ ${reporters.length} Reporter accounts verified`);

    // 4. Verify Multi-Update Showcase Articles & Impact Analytics
    console.log('\n--- 4. Verifying Flagship Multi-Update Articles ---');
    const multiUpdateArticles = await Article.find({
      status: 'Published',
      'publishHistory.1': { $exists: true } // At least 2 publish timestamps
    });

    console.log(`Found ${multiUpdateArticles.length} multi-update articles`);
    if (multiUpdateArticles.length === 0) {
      throw new Error('Flagship multi-update articles missing from seed');
    }

    const flagship = multiUpdateArticles[0];
    console.log('Flagship article:', flagship.publicVersion.title);
    console.log('Publish history points:', flagship.publishHistory.length);
    if (flagship.publishHistory.length < 2) throw new Error('Expected at least 2 publish history timestamps');

    const analytics = await ViewStats.getImpactAnalytics(flagship._id);
    console.log(`Analytics datapoints: ${analytics.viewData.length}, Update points: ${analytics.updatePoints.length}`);
    if (analytics.viewData.length < 20) throw new Error('Expected rich timeseries view buckets');
    if (analytics.updatePoints.length < 2) throw new Error('Expected multiple update points for chart markers');
    console.log('✅ Flagship Impact Analytics verified with rich timeseries and update markers');

    // 5. Query Performance Test (High concurrency simulation)
    console.log('\n--- 5. Testing Query Performance at 500+ Articles Scale ---');
    // Test infinite scroll query speed
    const t0 = Date.now();
    const feed = await Article.searchPublishedArticles({ page: 1, limit: 20, sort: 'date' });
    const feedTime = Date.now() - t0;
    console.log(`⚡ Feed query (20 items): ${feedTime}ms (Returned ${feed.length} items)`);
    if (feedTime > 50) console.warn('⚠️ Warning: Feed query took over 50ms');

    // Test popularity sort query speed
    const t1 = Date.now();
    const popFeed = await Article.searchPublishedArticles({ page: 1, limit: 20, sort: 'popularity' });
    const popTime = Date.now() - t1;
    console.log(`⚡ Popularity sort query: ${popTime}ms`);

    // Test Hebrew regex search speed
    const t2 = Date.now();
    const searchRes = await Article.searchPublishedArticles({ search: 'רכבת', page: 1, limit: 20 });
    const searchTime = Date.now() - t2;
    console.log(`⚡ Hebrew text search: ${searchTime}ms (Found ${searchRes.length} items)`);

    // 6. Verify Comments Count
    const totalComments = await Comment.countDocuments();
    console.log(`Total seeded comments: ${totalComments}`);
    if (totalComments < 100) throw new Error('Expected at least 100 seeded comments');

    console.log('\n🎉 ALL PHASE 4 SEED & PERFORMANCE TESTS PASSED SUCCESSFULLY!\n');
  } catch (error) {
    console.error('❌ Phase 4 Test failed:', error);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongod) {
      await mongod.stop();
    }
    process.exit(process.exitCode || 0);
  }
}

runPhase4Tests();
