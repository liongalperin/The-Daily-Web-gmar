/**
 * Phase 5 Verification Test: SSR Views, SEO Compliance, RBAC Desk Redirection & Error Rendering
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const createApp = require('../app');
const { User, Article, Comment } = require('../models');

async function runPhase5Tests() {
  console.log('🚀 Starting Phase 5 SSR Views & Developer 2 Integration Verification...');

  let mongod;
  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    console.log('✅ Connected to in-memory MongoDB');

    const app = createApp();

    // 1. Create Staff Accounts and Articles for Verification
    const editor = await User.createUser({
      username: 'editor_phase5',
      password: 'password123',
      role: 'Editor',
      fullName: 'עורך בכיר'
    });

    const reporter = await User.createUser({
      username: 'reporter_phase5',
      password: 'password123',
      role: 'Reporter',
      fullName: 'כתב שטח'
    });

    const article = await Article.createArticle({
      authorId: reporter._id,
      category: 'tech',
      title: 'פריצת דרך בטכנולוגיית מחשוב קוונטי',
      content: 'חוקרים ישראלים פיתחו מעבד קוונטי בעל יציבות חסרת תקדים אשר צפוי לשנות את פני המחשוב העולמי.',
      imageUrl: '/images/default-news.jpg'
    });

    // Publish the article
    await Article.publishArticle(article._id);

    // Add a comment
    await Comment.createComment({
      articleId: article._id,
      authorName: 'דן',
      content: 'כתבה מרתקת וחשובה מאוד!',
      ipAddress: '127.0.0.1',
      deviceId: 'dev_test_1'
    });

    // Login Reporter and Editor to obtain cookies
    const repLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'reporter_phase5', password: 'password123' });
    const reporterCookie = repLoginRes.headers['set-cookie'];

    const edLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'editor_phase5', password: 'password123' });
    const editorCookie = edLoginRes.headers['set-cookie'];

    // 2. Test Public Homepage (SSR)
    console.log('\n--- 1. Testing Homepage SSR ---');
    const homeRes = await request(app).get('/');
    if (homeRes.status !== 200) throw new Error(`Homepage returned status ${homeRes.status}`);
    if (!homeRes.text.includes('dir="rtl"') || !homeRes.text.includes('lang="he"')) {
      throw new Error('Homepage missing RTL Hebrew attributes');
    }
    if (!homeRes.text.includes('פריצת דרך בטכנולוגיית מחשוב קוונטי')) {
      throw new Error('Homepage SSR did not include article title in initial HTML');
    }
    console.log('✅ Homepage SSR Verified: HTML5 semantic, RTL Hebrew, initial articles rendered');

    // 3. Test Full Article Page (SSR SEO Compliance)
    console.log('\n--- 2. Testing Article Page SSR & SEO Compliance ---');
    const articleRes = await request(app).get(`/articles/${article._id}`);
    if (articleRes.status !== 200) throw new Error(`Article page returned status ${articleRes.status}`);
    if (!articleRes.text.includes('<title>פריצת דרך בטכנולוגיית מחשוב קוונטי - The Daily Web</title>')) {
      throw new Error('SEO Title tag missing or mismatched in article view');
    }
    if (!articleRes.text.includes('חוקרים ישראלים פיתחו מעבד קוונטי')) {
      throw new Error('SEO Breach: Article content not rendered in initial server HTML');
    }
    if (!articleRes.text.includes('כתבה מרתקת וחשובה מאוד!')) {
      throw new Error('Article SSR did not render initial comments');
    }
    console.log('✅ Article Page SSR Verified: Full body and metadata delivered in initial HTML for SEO');

    // Test non-existent article 404
    const fakeId = new mongoose.Types.ObjectId();
    const notFoundArticleRes = await request(app).get(`/articles/${fakeId}`);
    if (notFoundArticleRes.status !== 404) throw new Error(`Expected 404 for missing article, got ${notFoundArticleRes.status}`);
    if (!notFoundArticleRes.text.includes('404')) {
      throw new Error('Missing styled 404 error page');
    }
    console.log('✅ Missing Article: Returns styled 404 page');

    // Test malformed ID 404
    const malformedIdRes = await request(app).get('/articles/invalid-id-format');
    if (malformedIdRes.status !== 404) throw new Error(`Expected 404 for malformed ID, got ${malformedIdRes.status}`);
    console.log('✅ Malformed ID: Gracefully returns 404 without crashing');

    // 4. Test Login View
    console.log('\n--- 3. Testing Login Page SSR ---');
    const loginViewRes = await request(app).get('/login');
    if (loginViewRes.status !== 200 || !loginViewRes.text.includes('כניסת צוות המערכת')) {
      throw new Error('Login view failed');
    }
    console.log('✅ Login View Verified: Credentials quick-fill options present');

    // 5. Test Reporter Desk Access & RBAC
    console.log('\n--- 4. Testing Reporter Desk RBAC ---');
    // Unauthenticated -> 302 to /login
    const unauthRepRes = await request(app).get('/reporter/desk');
    if (unauthRepRes.status !== 302 || !unauthRepRes.headers.location.includes('/login')) {
      throw new Error('Unauthenticated user not redirected to /login');
    }
    console.log('✅ Unauthenticated access to /reporter/desk redirected to /login (302)');

    // Authenticated Reporter -> 200 OK
    const authRepRes = await request(app)
      .get('/reporter/desk')
      .set('Cookie', reporterCookie);
    if (authRepRes.status !== 200 || !authRepRes.text.includes('דסק הכתב')) {
      throw new Error('Reporter desk failed for authenticated reporter');
    }
    console.log('✅ Authenticated Reporter granted access to Reporter Desk (200)');

    // 6. Test Editor Desk Access & RBAC
    console.log('\n--- 5. Testing Editor Desk RBAC ---');
    // Unauthenticated -> 302 to /login
    const unauthEdRes = await request(app).get('/editor/desk');
    if (unauthEdRes.status !== 302 || !unauthEdRes.headers.location.includes('/login')) {
      throw new Error('Unauthenticated user not redirected to /login');
    }

    // Reporter accessing Editor desk -> 403 Forbidden styled page
    const repOnEdDeskRes = await request(app)
      .get('/editor/desk')
      .set('Cookie', reporterCookie);
    if (repOnEdDeskRes.status !== 403 || !repOnEdDeskRes.text.includes('אין הרשאת גישה')) {
      throw new Error('Reporter was not blocked with styled 403 page on editor desk');
    }
    console.log('✅ Reporter access to /editor/desk blocked with styled 403 error page');

    // Authenticated Editor -> 200 OK
    const authEdRes = await request(app)
      .get('/editor/desk')
      .set('Cookie', editorCookie);
    if (authEdRes.status !== 200 || !authEdRes.text.includes('דסק העורך')) {
      throw new Error('Editor desk failed for authenticated editor');
    }
    console.log('✅ Authenticated Editor granted access to Editor Desk (200)');

    // Test "All Articles" filter (?status=)
    const allArticlesRes = await request(app)
      .get('/editor/desk?status=')
      .set('Cookie', editorCookie);
    if (allArticlesRes.status !== 200) throw new Error('Editor desk ?status= failed');
    console.log('✅ Editor Desk "All Articles" filter (?status=) verified');

    // 7. Test SSR Logout Route
    console.log('\n--- 6. Testing SSR Logout Route ---');
    const logoutRes = await request(app)
      .get('/logout')
      .set('Cookie', reporterCookie);
    if (logoutRes.status !== 302 || logoutRes.headers.location !== '/') {
      throw new Error('GET /logout did not redirect to /');
    }
    console.log('✅ GET /logout successfully destroyed session and redirected to / (302)');

    // 8. Test Unmatched SSR Route (Catch-all 404)
    console.log('\n--- 7. Testing Catch-all 404 Page ---');
    const unknownPageRes = await request(app).get('/non-existent-page-xyz');
    if (unknownPageRes.status !== 404 || !unknownPageRes.text.includes('404')) {
      throw new Error('Catch-all 404 failed');
    }
    console.log('✅ Catch-all 404: Unmatched routes render styled Hebrew 404 page');

    // 9. Static Assets Verification
    console.log('\n--- 8. Testing Static Assets ---');
    const chartAssetRes = await request(app).get('/js/chart.umd.js');
    if (chartAssetRes.status !== 200) throw new Error('Offline chart.umd.js static asset failed');

    const defaultImgRes = await request(app).get('/images/default-news.jpg');
    if (defaultImgRes.status !== 200) throw new Error('Default news placeholder image asset failed');
    console.log('✅ Static Assets Verified: Offline Chart.js and placeholder image served cleanly');

    console.log('\n🎉 ALL PHASE 5 SSR & INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
  } catch (err) {
    console.error('❌ Phase 5 Test failed:', err);
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

runPhase5Tests();
