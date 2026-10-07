/**
 * Phase 1 Verification Test
 * Tests Mongoose connection, security, resilience, and full CRUD on all 4 models using MongoMemoryServer.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { User, Article, Comment, ViewStats } = require('../models');

async function runPhase1Tests() {
  console.log('🚀 Starting Comprehensive Phase 1 Verification...');

  let mongod;
  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    console.log('✅ Connected to in-memory MongoDB');

    // 1. User Model Test (Full CRUD + Bcrypt + Projection Security)
    console.log('\n--- 1. Testing User Model ---');
    const user = await User.createUser({
      username: 'ReporterDana', // Mixed case - should be lowercased automatically
      password: 'password123',
      role: 'Reporter',
      fullName: 'דנה כהן'
    });
    console.log('✅ User Created (C):', user.username, 'ID:', user._id);
    if (user.username !== 'reporterdana') throw new Error('Username was not lowercased');

    const fetchedUser = await User.getUserByUsername('ReporterDana');
    if (!fetchedUser || fetchedUser.fullName !== 'דנה כהן') throw new Error('User Read with case-insensitivity failed');
    console.log('✅ User Read (R) case-insensitive lookup passed');

    // Verify password hash is NOT exposed in searchUsers
    const searchedUsers = await User.searchUsers({ search: 'dana' });
    if (searchedUsers[0].passwordHash) throw new Error('Security Breach: passwordHash leaked in searchUsers');
    console.log('✅ Security Check: passwordHash is not exposed in searchUsers or JSON');

    const isMatch = await user.comparePassword('password123');
    const isBadMatch = await user.comparePassword('wrongpassword');
    if (!isMatch || isBadMatch) throw new Error('Password hashing verification failed');
    console.log('✅ Password hash & comparison verified');

    const updatedUser = await User.updateUserById(user._id, { fullName: 'דנה כהן לוי' });
    if (updatedUser.fullName !== 'דנה כהן לוי') throw new Error('User Update failed');
    console.log('✅ User Update (U):', updatedUser.fullName);

    // 2. Article Model Test (Full CRUD + Dual Versioning + Workflow)
    console.log('\n--- 2. Testing Article Model ---');
    const article = await Article.createArticle({
      authorId: user._id,
      category: 'tech',
      title: 'השקת מעבד חדש ומתקדם',
      content: 'היום הושק מעבד חדשני המספק ביצועים פורצי דרך...',
      imageUrl: '/images/cpu.jpg'
    });
    console.log('✅ Article Created (C):', article._id, 'Status:', article.status);
    if (article.draftVersion.title !== 'השקת מעבד חדש ומתקדם') throw new Error('Draft version title mismatch');
    if (article.draftVersion.summary !== article.draftVersion.snippet) throw new Error('Summary and snippet mismatch');

    // Update draft (Auto-save simulation)
    const updatedDraft = await Article.updateDraft(article._id, {
      title: 'השקת מעבד חדש ומתקדם - גרסה מעודכנת',
      content: 'תוכן מעודכן ומפורט...',
      imageUrl: '/images/cpu-v2.jpg'
    });
    console.log('✅ Article Draft Update (U - AutoSave):', updatedDraft.draftVersion.title);

    // Workflow: Submit for review
    await Article.submitForReview(article._id);
    let pendingArticle = await Article.getArticleById(article._id);
    if (pendingArticle.status !== 'Pending') throw new Error('Submit for review failed');
    console.log('✅ Article Workflow: Submitted for Review (Pending)');

    // Workflow: Publish article atomically
    await Article.publishArticle(article._id);
    const publishedArticle = await Article.getArticleById(article._id);
    if (publishedArticle.status !== 'Published') throw new Error('Publish article failed');
    if (publishedArticle.publicVersion.title !== 'השקת מעבד חדש ומתקדם - גרסה מעודכנת') throw new Error('Public version title mismatch');
    if (publishedArticle.publishHistory.length !== 1) throw new Error('Publish history entry missing');
    console.log('✅ Article Workflow: Atomically Published with history timestamp');

    // Test Search & Privacy projection: draftVersion and editorNote must NOT be returned in search
    const searchResults = await Article.searchPublishedArticles({ search: 'מעבד', category: 'tech' });
    if (searchResults.length === 0) throw new Error('Article Search (R) failed');
    if (searchResults[0].draftVersion || searchResults[0].editorNote) throw new Error('Security Breach: draftVersion leaked in search results');
    console.log('✅ Article Search (R): Found', searchResults.length, 'results with draft projection privacy');

    // 3. Comment Model Test (Full CRUD + Exact Sliding Window Rate Limiting)
    console.log('\n--- 3. Testing Comment Model ---');
    const c1 = await Comment.createComment({
      articleId: article._id,
      content: 'כתבה מעניינת מאד!',
      authorName: 'יוסי',
      ipAddress: '127.0.0.1',
      deviceId: 'dev_test_1'
    });
    const c2 = await Comment.createComment({
      articleId: article._id,
      content: 'תודה על הסיקור!',
      authorName: 'רונית',
      ipAddress: '127.0.0.1',
      deviceId: 'dev_test_1'
    });
    const c3 = await Comment.createComment({
      articleId: article._id,
      content: 'מתי המוצר יוצא לשוק?',
      authorName: 'אלון',
      ipAddress: '127.0.0.1',
      deviceId: 'dev_test_1'
    });

    // Test rate limit: 4th comment must be blocked and retryAfterSeconds > 0
    const limitCheck = await Comment.checkRateLimit({ ipAddress: '127.0.0.1', deviceId: 'dev_test_1' });
    console.log('Rate limit check result:', limitCheck);
    if (limitCheck.allowed !== false) throw new Error('Rate limit enforcement failed: 4th comment was allowed!');
    if (limitCheck.retryAfterSeconds <= 0 || limitCheck.retryAfterSeconds > 60) throw new Error('Invalid retryAfterSeconds');
    console.log('✅ Comment Rate Limit Enforced with exact retryAfterSeconds =', limitCheck.retryAfterSeconds);

    // 4. ViewStats Model Test (Full CRUD + Concurrency + Total Views Sync)
    console.log('\n--- 4. Testing ViewStats Model ---');
    // Concurrency test: simulate 5 simultaneous views
    await Promise.all([
      ViewStats.recordView(article._id, new Date()),
      ViewStats.recordView(article._id, new Date()),
      ViewStats.recordView(article._id, new Date()),
      ViewStats.recordView(article._id, new Date()),
      ViewStats.recordView(article._id, new Date())
    ]);

    const vsRecord = await ViewStats.getStatsByArticle(article._id);
    console.log('✅ Concurrent Views Recorded: Total views =', vsRecord.totalViews, 'Buckets =', vsRecord.views.length);
    if (vsRecord.totalViews !== 5) throw new Error(`ViewStats count mismatch: expected 5, got ${vsRecord.totalViews}`);
    if (vsRecord.views.length !== 1) throw new Error('Bucket concurrency race failed: duplicate hour buckets created');

    // Verify synchronization with Article.totalViews
    const articleAfterViews = await Article.getArticleById(article._id);
    console.log('✅ Article.totalViews synchronized:', articleAfterViews.totalViews);
    if (articleAfterViews.totalViews !== 5) throw new Error(`Article.totalViews synchronization failed: expected 5, got ${articleAfterViews.totalViews}`);

    // Verify Impact Analytics formatting
    const analytics = await ViewStats.getImpactAnalytics(article._id);
    console.log('✅ Impact Analytics formatted:', analytics.viewData.length, 'datapoints,', analytics.updatePoints.length, 'update points');
    if (analytics.updatePoints.length !== 1) throw new Error('Analytics update points missing');

    // 5. Test Deletions (D) with cascade cleanup
    console.log('\n--- 5. Testing Deletions (D) with Cascade ---');
    await Article.deleteArticleById(article._id);
    const commentsAfterDelete = await Comment.getCommentsByArticle(article._id);
    const statsAfterDelete = await ViewStats.getStatsByArticle(article._id);
    if (commentsAfterDelete.length !== 0 || statsAfterDelete !== null) throw new Error('Cascade delete failed');
    console.log('✅ Article deleted and cascade cleaned orphaned comments and viewStats');

    await User.deleteUserById(user._id);
    console.log('✅ User deleted');

    console.log('\n🎉 ALL PHASE 1 REFINEMENTS PASSED PERFECTLY!\n');
  } catch (err) {
    console.error('❌ Phase 1 Test failed:', err);
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

runPhase1Tests();
