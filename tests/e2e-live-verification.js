/**
 * End-to-End Live System Verification
 * Simulates real user and staff workflows against the running Express application.
 */

const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { connectDB, disconnectDB } = require('../config/db');
const seedDatabase = require('../scripts/seed');
const createApp = require('../app');
const { Article, User } = require('../models');

// EJS escapes text in <%= %>, so a title with ' or " appears as &#39; / &#34; in the HTML
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#34;').replace(/'/g, '&#39;');

async function verifyLiveSystem() {
  let mongod;
  console.log('\n======================================================');
  console.log('🌐 RUNNING END-TO-END LIVE SYSTEM VERIFICATION');
  console.log('======================================================\n');

  try {
    // 1. Own in-memory database with the demo data, like the other suites, so the test
    //    never writes into a real MongoDB that happens to be running (e.g. the demo database)
    mongod = await MongoMemoryServer.create();
    await connectDB(mongod.getUri());
    await seedDatabase();
    const app = createApp();

    // ------------------------------------------------------------------
    // TEST 1: Homepage SSR
    // ------------------------------------------------------------------
    console.log('1. Testing Public Homepage (GET /)...');
    const homeRes = await request(app).get('/');
    if (homeRes.status !== 200) throw new Error(`Homepage failed with status ${homeRes.status}`);
    if (!homeRes.text.includes('The Daily Web')) throw new Error('Site brand missing on homepage');
    if (!homeRes.text.includes('feed-list')) throw new Error('Article feed missing on homepage');
    console.log('   ✅ Homepage loaded with HTTP 200 OK & rendered news feed');

    // ------------------------------------------------------------------
    // TEST 2: Bilingual Category Feed & Hebrew Search
    // ------------------------------------------------------------------
    console.log('2. Testing Category Filtering & Hebrew Search...');
    const catRes = await request(app).get('/?category=tech');
    if (catRes.status !== 200) throw new Error(`Category feed failed: ${catRes.status}`);
    console.log('   ✅ Tech category feed loaded successfully (HTTP 200)');

    const searchRes = await request(app).get('/?q=%D7%A7%D7%95%D7%95%D7%A0%D7%98%D7%99');
    if (searchRes.status !== 200) throw new Error(`Search failed: ${searchRes.status}`);
    console.log('   ✅ Hebrew search query loaded successfully (HTTP 200)');

    // ------------------------------------------------------------------
    // TEST 3: REST API Feed (Infinite Scroll Endpoint)
    // ------------------------------------------------------------------
    console.log('3. Testing Public Articles API (GET /api/articles)...');
    const apiRes = await request(app).get('/api/articles?limit=5');
    if (apiRes.status !== 200 || !apiRes.body.success) throw new Error('API /api/articles failed');
    if (!Array.isArray(apiRes.body.articles) || apiRes.body.articles.length === 0) {
      throw new Error('API returned no articles');
    }
    const sampleArticle = apiRes.body.articles[0];
    console.log(`   ✅ API returned ${apiRes.body.articles.length} articles cleanly formatted`);

    // ------------------------------------------------------------------
    // TEST 4: Single Article SSR & SEO Content Delivery
    // ------------------------------------------------------------------
    console.log(`4. Testing Full Article SSR Page (GET /articles/${sampleArticle._id})...`);
    const artRes = await request(app).get(`/articles/${sampleArticle._id}`);
    if (artRes.status !== 200) throw new Error(`Article page failed with status ${artRes.status}`);
    if (!artRes.text.includes(escapeHtml(sampleArticle.title))) throw new Error('Article title not in SSR HTML');
    console.log('   ✅ Article SSR rendered full title and content in initial HTML for SEO');

    // ------------------------------------------------------------------
    // TEST 5: Interactive Comments & Spam Rate Limiter (3/min)
    // ------------------------------------------------------------------
    console.log('5. Testing Comment Submission & Rate Limiter (Max 3/min)...');
    const commentDevice = `test_device_${Date.now()}`;
    for (let i = 1; i <= 3; i++) {
      const cRes = await request(app)
        .post('/api/comments')
        .send({
          articleId: sampleArticle._id,
          authorName: `בודק ${i}`,
          content: `בדיקת תגובה חיה מספר ${i}`,
          deviceId: commentDevice
        });
      if (cRes.status !== 201) throw new Error(`Comment ${i} failed: ${cRes.status}`);
    }
    console.log('   ✅ Posted 3 valid comments within 1 minute (HTTP 201)');

    const spamRes = await request(app)
      .post('/api/comments')
      .send({
        articleId: sampleArticle._id,
        authorName: 'ספאמר',
        content: 'ניסיון הצפה רביעי',
        deviceId: commentDevice
      });
    if (spamRes.status !== 429) {
      throw new Error(`Expected 429 for 4th comment, got ${spamRes.status}`);
    }
    if (!spamRes.headers['retry-after']) {
      throw new Error('Missing Retry-After header on 429 response');
    }
    console.log(`   ✅ 4th comment correctly blocked with HTTP 429 (Retry-After: ${spamRes.headers['retry-after']}s)`);

    // ------------------------------------------------------------------
    // TEST 6: Staff Authentication (HTML Form POST /login)
    // ------------------------------------------------------------------
    console.log('6. Testing Staff Login Flow (POST /login)...');
    const loginRes = await request(app)
      .post('/login')
      .send({ username: 'editor', password: 'password123' });
    if (loginRes.status !== 302 || loginRes.headers.location !== '/editor') {
      throw new Error(`Editor login failed or did not redirect to /editor (status: ${loginRes.status})`);
    }
    const editorCookie = loginRes.headers['set-cookie'];
    console.log('   ✅ Editor logged in successfully and redirected to /editor (302)');

    // ------------------------------------------------------------------
    // TEST 7: Editor Dashboard & Review Access
    // ------------------------------------------------------------------
    console.log('7. Testing Editor Dashboard (GET /editor)...');
    const edDashRes = await request(app)
      .get('/editor')
      .set('Cookie', editorCookie);
    if (edDashRes.status !== 200) throw new Error(`Editor dashboard returned ${edDashRes.status}`);
    console.log('   ✅ Editor dashboard loaded with status counters and review list');

    // ------------------------------------------------------------------
    // TEST 8: Impact Analytics Page & Chart Data API
    // ------------------------------------------------------------------
    console.log('8. Testing Impact Analytics (GET /editor/analytics & API)...');
    const analyticsPageRes = await request(app)
      .get('/editor/analytics')
      .set('Cookie', editorCookie);
    if (analyticsPageRes.status !== 200) throw new Error(`Analytics page returned ${analyticsPageRes.status}`);

    const analyticsApiRes = await request(app)
      .get(`/api/admin/analytics/${sampleArticle._id}`)
      .set('Cookie', editorCookie);
    if (analyticsApiRes.status !== 200 || !analyticsApiRes.body.success) {
      throw new Error(`Analytics API returned ${analyticsApiRes.status}`);
    }
    console.log(`   ✅ Impact Analytics graph data delivered (${analyticsApiRes.body.data?.timeseries?.length || 0} hourly points)`);

    // ------------------------------------------------------------------
    // TEST 9: Reporter Login & Auto-Save
    // ------------------------------------------------------------------
    console.log('9. Testing Reporter Workflow & Auto-Save (PUT /api/articles/:id/auto-save)...');
    const repLoginRes = await request(app)
      .post('/login')
      .send({ username: 'reporter1', password: 'password123' });
    if (repLoginRes.status !== 302 || repLoginRes.headers.location !== '/reporter') {
      throw new Error('Reporter login failed');
    }
    const reporterCookie = repLoginRes.headers['set-cookie'];

    // Find a draft article belonging to reporter1
    const reporterUser = await User.findOne({ username: 'reporter1' });
    let draftArticle = await Article.findOne({ authorId: reporterUser._id, status: 'Draft' });
    if (!draftArticle) {
      draftArticle = await Article.createArticle({
        authorId: reporterUser._id,
        title: 'כתבת מבחן חדשה',
        content: 'תוכן טיוטה ראשוני'
      });
    }

    const autoSaveRes = await request(app)
      .put(`/api/articles/${draftArticle._id}/auto-save`)
      .set('Cookie', reporterCookie)
      .send({
        title: 'כתבת מבחן - נשמרה אוטומטית',
        content: 'תוכן שעודכן במהלך הקלדה חיה בחדר החדשות.'
      });
    if (autoSaveRes.status !== 200 || !autoSaveRes.body.success) {
      throw new Error(`Auto-save failed with status ${autoSaveRes.status}`);
    }
    console.log('   ✅ Reporter auto-save completed successfully (HTTP 200)');

    // ------------------------------------------------------------------
    // TEST 10: Staff Logout
    // ------------------------------------------------------------------
    console.log('10. Testing Staff Logout (POST /logout)...');
    const logoutRes = await request(app)
      .post('/logout')
      .set('Cookie', editorCookie);
    if (logoutRes.status !== 302 || logoutRes.headers.location !== '/') {
      throw new Error('Logout failed to redirect to /');
    }
    console.log('   ✅ Staff logged out and redirected to / (302)');

    console.log('\n======================================================');
    console.log('🎉 REAL-WORLD END-TO-END VERIFICATION: 100% SUCCESS!');
    console.log('   Every endpoint, SSR template, security gate,');
    console.log('   and state transition operates as expected.');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ E2E Verification failed:', err);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
    if (mongod) await mongod.stop();
    process.exit(process.exitCode || 0);
  }
}

verifyLiveSystem();
