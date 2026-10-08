/**
 * Phase 3 Verification Test: Core API Endpoints, State Machine, Dual Versioning, & Analytics
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const createApp = require('../app');
const { User, Article, ViewStats, Comment } = require('../models');

async function runPhase3Tests() {
  console.log('🚀 Starting Phase 3 Core API & State Machine Verification...');

  let mongod;
  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    console.log('✅ Connected to in-memory MongoDB');

    const app = createApp();

    // 1. Setup Users (Reporter and Editor)
    console.log('\n--- 1. Setting Up Test Accounts ---');
    const reporterUser = await User.createUser({
      username: 'reporter_guy',
      password: 'password123',
      role: 'Reporter',
      fullName: 'גיא הכתב'
    });

    const editorUser = await User.createUser({
      username: 'editor_sarah',
      password: 'password123',
      role: 'Editor',
      fullName: 'שרה העורכת'
    });

    // Login Reporter
    const repLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'reporter_guy', password: 'password123' });
    const reporterCookie = repLoginRes.headers['set-cookie'];

    // Login Editor
    const edLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'editor_sarah', password: 'password123' });
    const editorCookie = edLoginRes.headers['set-cookie'];

    console.log('✅ Reporter and Editor logged in with cookies');

    // 2. Reporter Workflow: Create Draft, Auto-save, Submit
    console.log('\n--- 2. Testing Reporter Workflow & Auto-Save ---');
    const createRes = await request(app)
      .post('/api/articles')
      .set('Cookie', reporterCookie)
      .send({
        title: 'מהפכה ברכבת הקלה בגוש דן',
        content: 'הקו האדום רושם שיא נוסעים חדש...',
        summary: 'הקו האדום רושם שיא נוסעים חדש לאחר חודשי הרצה ראשונים.',
        category: 'transport'
      });

    if (createRes.status !== 201) throw new Error(`Create draft failed: ${createRes.text}`);
    const articleId = createRes.body.article._id;
    console.log('✅ Reporter Created Draft (201):', articleId, 'Status:', createRes.body.article.status);

    // Test: Editor CANNOT publish or return an article that is still in Draft!
    const illegalPublishRes = await request(app)
      .patch(`/api/admin/articles/${articleId}/status`)
      .set('Cookie', editorCookie)
      .send({ status: 'Published' });
    if (illegalPublishRes.status !== 400) throw new Error('Illegal transition: Editor was able to publish raw draft!');
    console.log('✅ State Machine: Editor blocked from publishing raw draft (400)');

    const illegalReturnRes = await request(app)
      .patch(`/api/admin/articles/${articleId}/status`)
      .set('Cookie', editorCookie)
      .send({ status: 'Returned', editorNote: 'Notes' });
    if (illegalReturnRes.status !== 400) throw new Error('Illegal transition: Editor was able to return unsubmitted draft!');
    console.log('✅ State Machine: Editor blocked from returning unsubmitted draft (400)');

    // Silent background auto-save while typing
    const autoSaveRes = await request(app)
      .put(`/api/articles/${articleId}/auto-save`)
      .set('Cookie', reporterCookie)
      .send({
        title: 'מהפכה ברכבת הקלה בגוש דן - שיא נוסעים',
        content: 'הקו האדום רושם שיא של 200 אלף נוסעים ביום...',
        summary: 'שיא של 200 אלף נוסעים ביום בקו האדום בגוש דן.',
        category: 'transport'
      });

    if (autoSaveRes.status !== 200 || !autoSaveRes.body.updatedAt) {
      throw new Error(`Auto-save failed: ${autoSaveRes.text}`);
    }
    console.log('✅ Reporter Silent Auto-Save (200): Saved at', autoSaveRes.body.updatedAt);

    // Submit draft to Editor
    const submitRes = await request(app)
      .patch(`/api/articles/${articleId}/status`)
      .set('Cookie', reporterCookie)
      .send({ status: 'Pending' });

    if (submitRes.status !== 200 || submitRes.body.status !== 'Pending') {
      throw new Error(`Submit to editor failed: ${submitRes.text}`);
    }
    console.log('✅ Reporter Submitted to Pending (200)');

    // Concurrency Lock: Auto-save while in Pending status MUST be blocked (409 Conflict)
    const lockedAutoSaveRes = await request(app)
      .put(`/api/articles/${articleId}/auto-save`)
      .set('Cookie', reporterCookie)
      .send({ title: 'ניסיון עריכה בזמן סקירת עורך' });
    if (lockedAutoSaveRes.status !== 409) throw new Error(`Expected 409 Conflict for auto-save during Pending review, got ${lockedAutoSaveRes.status}`);
    console.log('✅ Concurrency Lock: Auto-save blocked while article is in Pending review (409)');

    // Verify Reporter CANNOT publish directly
    const hijackPublishRes = await request(app)
      .patch(`/api/admin/articles/${articleId}/status`)
      .set('Cookie', reporterCookie)
      .send({ status: 'Published' });
    if (hijackPublishRes.status !== 403) throw new Error('Security Breach: Reporter was allowed to publish article directly!');
    console.log('✅ Security Check: Reporter blocked from publishing directly (403)');

    // 3. Editor Workflow: Inspection, Return with Note, and Approval
    console.log('\n--- 3. Testing Editor Review & Revisions ---');
    // Editor views diff comparison
    const diffRes = await request(app)
      .get(`/api/admin/articles/${articleId}`)
      .set('Cookie', editorCookie);
    if (diffRes.status !== 200 || !diffRes.body.comparison) throw new Error('Editor diff inspection failed');
    console.log('✅ Editor inspected article diff successfully');

    // Editor returns article for corrections
    const returnRes = await request(app)
      .patch(`/api/admin/articles/${articleId}/status`)
      .set('Cookie', editorCookie)
      .send({
        status: 'Returned',
        editorNote: 'נא להוסיף תגובה רשמית של חברת נת"ע.'
      });

    if (returnRes.status !== 200 || returnRes.body.status !== 'Returned') {
      throw new Error(`Editor return failed: ${returnRes.text}`);
    }
    console.log('✅ Editor Returned Article for Corrections (200)');

    // Reporter sees returned note and performs edits
    const reporterArticlesRes = await request(app)
      .get('/api/reporter/articles')
      .set('Cookie', reporterCookie);
    const myArticle = reporterArticlesRes.body.articles.find(a => a._id.toString() === articleId.toString());
    if (!myArticle || myArticle.editorNote !== 'נא להוסיף תגובה רשמית של חברת נת"ע.') {
      throw new Error('Reporter did not receive editor note');
    }
    console.log('✅ Reporter saw editor note:', myArticle.editorNote);

    // Reporter makes corrections and resubmits
    await request(app)
      .put(`/api/articles/${articleId}/auto-save`)
      .set('Cookie', reporterCookie)
      .send({
        title: 'מהפכה ברכבת הקלה בגוש דן - תגובת נת"ע',
        content: 'מנת"ע נמסר: אנו מברכים על אמון הציבור...'
      });

    const resubmitRes = await request(app)
      .patch(`/api/articles/${articleId}/status`)
      .set('Cookie', reporterCookie)
      .send({ status: 'Pending' });
    if (resubmitRes.status !== 200) throw new Error('Reporter resubmit failed');
    console.log('✅ Reporter Resubmitted after corrections (200)');

    // Editor publishes article
    const publishRes = await request(app)
      .patch(`/api/admin/articles/${articleId}/status`)
      .set('Cookie', editorCookie)
      .send({ status: 'Published' });
    if (publishRes.status !== 200 || publishRes.body.status !== 'Published') {
      throw new Error(`Editor publish failed: ${publishRes.text}`);
    }
    console.log('✅ Editor Approved and Published Article (200)');

    // 4. Dual Versioning on Live Site Test
    console.log('\n--- 4. Testing Dual Versioning (Public vs Ongoing Draft) ---');
    // Article is now published. Reporter starts editing a new revision:
    await request(app)
      .put(`/api/articles/${articleId}/auto-save`)
      .set('Cookie', reporterCookie)
      .send({
        title: 'כותרת טיוטה סודית שלא אמורה להופיע לציבור',
        content: 'תוכן טיוטה סודי...'
      });

    // Public visitor requests the article:
    const publicArticleRes = await request(app).get(`/api/articles/${articleId}`);
    if (publicArticleRes.body.article.title.includes('סודית')) {
      throw new Error('DUAL VERSIONING BREACH: Draft content leaked to public site!');
    }
    console.log('✅ DUAL VERSIONING PROVEN: Public continues to see approved version:', publicArticleRes.body.article.title);

    // 5. Public Feed, Pagination, Filtering & Search
    console.log('\n--- 5. Testing Public Feed & Search ---');
    const feedRes = await request(app).get('/api/articles?category=transport&sort=date');
    if (feedRes.status !== 200 || feedRes.body.articles.length === 0) throw new Error('Public feed failed');
    // Verify Dev 2 flattened properties
    const firstCard = feedRes.body.articles[0];
    if (!firstCard.id || !firstCard.title || !firstCard.author?.fullName) {
      throw new Error('Dev 2 card flattening failed');
    }
    console.log('✅ Public Infinite-Scroll Feed:', feedRes.body.articles.length, 'articles with Dev 2 flattened structure');

    const searchRes = await request(app).get('/api/articles?q=רכבת');
    if (searchRes.body.articles.length === 0) throw new Error('Search failed');
    console.log('✅ Hebrew Live Search:', searchRes.body.articles.length, 'results');

    // 6. Comment Submission & Rate Limiting
    console.log('\n--- 6. Testing Comments & Spam Rate Limiter ---');
    const commentRes = await request(app)
      .post('/api/comments')
      .send({
        articleId,
        content: 'יופי של כתבה, כל הכבוד!',
        authorName: 'ישראל',
        deviceId: 'user_phone_1'
      });
    if (commentRes.status !== 201 || !commentRes.body.comment._id) throw new Error('Comment creation failed');
    console.log('✅ Comment Posted (201):', commentRes.body.comment.content);

    // Post 2 more comments from same device
    await request(app).post('/api/comments').send({ articleId, content: 'תגובה 2', deviceId: 'user_phone_1' });
    await request(app).post('/api/comments').send({ articleId, content: 'תגובה 3', deviceId: 'user_phone_1' });

    // 4th comment must be blocked with HTTP 429
    const spamBlockRes = await request(app)
      .post('/api/comments')
      .send({ articleId, content: 'תגובת ספאם 4', deviceId: 'user_phone_1' });
    if (spamBlockRes.status !== 429) throw new Error(`Expected 429 for spam comment, got ${spamBlockRes.status}`);
    console.log('✅ Spam Rate Limiter: 4th comment blocked with 429 and Retry-After =', spamBlockRes.headers['retry-after']);

    // 7. Impact Analytics API
    console.log('\n--- 7. Testing Impact Analytics Endpoint ---');
    await ViewStats.recordView(articleId);
    await ViewStats.recordView(articleId);

    const analyticsRes = await request(app)
      .get(`/api/admin/analytics/${articleId}`)
      .set('Cookie', editorCookie);

    if (analyticsRes.status !== 200 || !analyticsRes.body.viewData) throw new Error('Analytics failed');
    console.log('✅ Impact Analytics API: Returned', analyticsRes.body.viewData.length, 'datapoints and', analyticsRes.body.updatePoints.length, 'update points');

    // Test non-existent article analytics returns 404
    const fakeId = new mongoose.Types.ObjectId();
    const fakeAnalyticsRes = await request(app)
      .get(`/api/admin/analytics/${fakeId}`)
      .set('Cookie', editorCookie);
    if (fakeAnalyticsRes.status !== 404) throw new Error(`Expected 404 for non-existent article analytics, got ${fakeAnalyticsRes.status}`);
    console.log('✅ Analytics 404 Guard: Non-existent article correctly returns 404');

    // 8. Weather Widget API
    console.log('\n--- 8. Testing Weather Widget API ---');
    const weatherRes = await request(app).get('/api/weather?city=tel-aviv');
    if (weatherRes.status === 502) {
      console.log('⚠️ Weather Widget API: Open-Meteo unreachable, got 502 { error } as specified');
    } else if (weatherRes.status !== 200 || typeof weatherRes.body.temperature !== 'number' || typeof weatherRes.body.code !== 'number') {
      throw new Error(`Weather API failed: ${weatherRes.status} ${JSON.stringify(weatherRes.body)}`);
    } else {
      console.log('✅ Weather Widget API: Temp =', weatherRes.body.temperature + '°C, WMO code =', weatherRes.body.code);
    }
    const badCityRes = await request(app).get('/api/weather?city=Tel+Aviv');
    if (badCityRes.status !== 400 || !badCityRes.body.error) throw new Error(`Expected 400 for unknown city, got ${badCityRes.status}`);
    console.log('✅ Weather Widget API: Unknown city correctly returns 400');

    console.log('\n🎉 ALL REFINED PHASE 3 API & STATE MACHINE TESTS PASSED SUCCESSFULLY!\n');
  } catch (error) {
    console.error('❌ Phase 3 Test failed:', error);
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

runPhase3Tests();
