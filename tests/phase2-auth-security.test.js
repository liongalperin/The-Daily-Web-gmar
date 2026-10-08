/**
 * Phase 2 Verification Test: Auth, RBAC, Session Persistence across Server Restart, & Rate Limiting
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const createApp = require('../app');
const { Article } = require('../models');
const { requireAuth, requireRole, checkArticleOwnership } = require('../middleware/auth');
const { commentRateLimiter } = require('../middleware/rateLimiter');

// Test-only setup key for the X-Admin-Key path (the real one comes from .env and is off by default)
process.env.ADMIN_SETUP_KEY = process.env.ADMIN_SETUP_KEY || 'test-only-setup-key';

async function runPhase2Tests() {
  console.log('🚀 Starting Hardened Phase 2 Auth, Security & Session Persistence Verification...');

  let mongod;
  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    console.log('✅ Connected to in-memory MongoDB');

    // Setup initial app
    const app = createApp();

    // Attach test routes for middleware testing
    app.get('/test/protected', requireAuth, (req, res) => {
      res.json({ message: 'Welcome authorized user', user: req.session.user });
    });

    app.get('/test/editor-only', requireRole('Editor'), (req, res) => {
      res.json({ message: 'Welcome editor' });
    });

    app.put('/test/article/:id', checkArticleOwnership, (req, res) => {
      res.json({ message: 'Article access granted', articleId: req.article._id });
    });

    app.post('/test/comment-limit', commentRateLimiter, (req, res) => {
      res.json({ success: true, message: 'Comment accepted' });
    });

    // 1. User Registration & Privilege Escalation Guard
    console.log('\n--- 1. Testing Registration & Privilege Protection ---');
    // Unauthenticated attempt to register Editor -> 403 Forbidden
    const unauthEditorRes = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'malicious_editor',
        password: 'password123',
        role: 'Editor'
      });
    if (unauthEditorRes.status !== 403) throw new Error(`Expected 403 for unauthorized editor registration, got ${unauthEditorRes.status}`);
    console.log('✅ Privilege Escalation Blocked: Public client cannot register Editor account (403)');

    // Legitimate Reporter registration
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'reporter1',
        password: 'password123',
        role: 'Reporter',
        fullName: 'ישראל ישראלי'
      });
    if (regRes.status !== 201) throw new Error(`Registration failed: ${regRes.text}`);
    console.log('✅ Registered reporter1:', regRes.body.user.username);

    // Register second Reporter
    const rep2Res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'reporter2',
        password: 'password123',
        role: 'Reporter',
        fullName: 'כתב שני'
      });
    const reporter2Id = rep2Res.body.user.id;

    // Login reporter1
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'reporter1', password: 'password123' });
    if (loginRes.status !== 200) throw new Error(`Login failed: ${loginRes.text}`);
    const cookie = loginRes.headers['set-cookie'];
    if (!cookie) throw new Error('No session cookie returned');
    console.log('✅ Login successful, session cookie received with session regeneration');

    // Register an Editor using admin key setup
    const editorRegRes = await request(app)
      .post('/api/auth/register')
      .set('X-Admin-Key', process.env.ADMIN_SETUP_KEY)
      .send({
        username: 'editor1',
        password: 'password123',
        role: 'Editor',
        fullName: 'עורך ראשי'
      });
    if (editorRegRes.status !== 201) throw new Error(`Editor registration failed: ${editorRegRes.text}`);
    console.log('✅ Registered editor1 via admin key');

    // 2. Test Session Persistence Across Server Restart
    console.log('\n--- 2. Testing Session Persistence Across Server Restart ---');
    const restartedApp = createApp();
    restartedApp.get('/test/protected', requireAuth, (req, res) => {
      res.json({ message: 'Welcome authorized user', user: req.session.user });
    });

    const verifyRestartRes = await request(restartedApp)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    if (verifyRestartRes.status !== 200 || !verifyRestartRes.body.authenticated) {
      throw new Error('Session was lost after server restart simulation!');
    }
    if (verifyRestartRes.body.user.username !== 'reporter1') {
      throw new Error(`Username mismatch after restart: expected reporter1, got ${verifyRestartRes.body.user.username}`);
    }
    console.log('✅ SERVER RESTART RESILIENCE VERIFIED: User remains authenticated in MongoDB session store!');

    // 3. Test RBAC
    console.log('\n--- 3. Testing RBAC & Route Protection ---');
    const forbiddenRes = await request(app)
      .get('/test/editor-only')
      .set('Cookie', cookie);
    if (forbiddenRes.status !== 403) throw new Error(`Expected 403 for reporter accessing editor route, got ${forbiddenRes.status}`);
    console.log('✅ RBAC Enforced: Reporter correctly blocked from Editor route (403)');

    const editorLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'editor1', password: 'password123' });
    const editorCookie = editorLoginRes.headers['set-cookie'];

    const editorAccessRes = await request(app)
      .get('/test/editor-only')
      .set('Cookie', editorCookie);
    if (editorAccessRes.status !== 200) throw new Error('Editor denied access to editor route');
    console.log('✅ RBAC Enforced: Editor granted access to Editor route (200)');

    // 4. Test Article Ownership Authorization & Defensive Guards
    console.log('\n--- 4. Testing Article Ownership Protection & Edge Cases ---');
    const articleByRep2 = await Article.createArticle({
      authorId: reporter2Id,
      category: 'news',
      title: 'כתבה של כתב 2',
      content: 'תוכן של כתב 2'
    });

    // Unauthenticated request directly hitting checkArticleOwnership -> 401 (NOT 500!)
    const unauthRes = await request(app).put(`/test/article/${articleByRep2._id}`);
    if (unauthRes.status !== 401) throw new Error(`Expected 401 for unauthenticated article access, got ${unauthRes.status}`);
    console.log('✅ Defensive Check: Unauthenticated article access returns 401 without crashing');

    // Invalid ObjectId format -> 400 Bad Request
    const badIdRes = await request(app)
      .put('/test/article/invalid-id-format')
      .set('Cookie', cookie);
    if (badIdRes.status !== 400) throw new Error(`Expected 400 for invalid ObjectId, got ${badIdRes.status}`);
    console.log('✅ Defensive Check: Invalid ObjectId format returns 400');

    // Reporter 1 tries to modify Reporter 2's article -> 403
    const hijackRes = await request(app)
      .put(`/test/article/${articleByRep2._id}`)
      .set('Cookie', cookie);
    if (hijackRes.status !== 403) throw new Error(`Expected 403 for modifying foreign article, got ${hijackRes.status}`);
    console.log('✅ Ownership Enforced: Reporter blocked from modifying another reporter\'s article (403)');

    // Editor modifies Reporter 2's article -> 200 Granted!
    const editorEditRes = await request(app)
      .put(`/test/article/${articleByRep2._id}`)
      .set('Cookie', editorCookie);
    if (editorEditRes.status !== 200) throw new Error('Editor denied permission to edit article');
    console.log('✅ Ownership Enforced: Editor allowed to manage any article (200)');

    // 5. Test Comment Rate Limiter & Concurrency Burst
    console.log('\n--- 5. Testing Comment Rate Limiter & Concurrency Burst ---');
    const device = 'device_xyz_99';
    // Fire 5 concurrent requests from the same device ID
    const burstPromises = [1, 2, 3, 4, 5].map((i) =>
      request(app)
        .post('/test/comment-limit')
        .send({ deviceId: device })
    );

    const burstResults = await Promise.all(burstPromises);
    const statuses = burstResults.map(r => r.status);
    const count200 = statuses.filter(s => s === 200).length;
    const count429 = statuses.filter(s => s === 429).length;

    console.log(`Burst results: ${count200} accepted (200), ${count429} throttled (429)`);
    if (count200 !== 3 || count429 !== 2) {
      throw new Error(`Burst rate limiting failed! Expected exactly 3 accepted and 2 throttled, got statuses: ${statuses}`);
    }
    console.log('✅ Concurrency Burst Protection: Exactly 3 allowed, remaining 2 instantly throttled with 429!');

    // 6. Test Logout
    console.log('\n--- 6. Testing Logout ---');
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie);
    if (logoutRes.status !== 200) throw new Error('Logout failed');

    const meAfterLogout = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);
    if (meAfterLogout.body.authenticated) throw new Error('User still authenticated after logout');
    console.log('✅ Logout verified: Session destroyed');

    console.log('\n🎉 ALL HARDENED PHASE 2 TESTS PASSED SUCCESSFULLY!\n');
  } catch (error) {
    console.error('❌ Phase 2 Test failed:', error);
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

runPhase2Tests();
