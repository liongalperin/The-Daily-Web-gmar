/**
 * Unified Test Runner for The Daily Web
 * Executes all Phase test suites sequentially and reports status.
 * Runnable via: npm test
 */

const { spawn } = require('child_process');
const path = require('path');

const TEST_FILES = [
  'tests/phase1-models.test.js',
  'tests/phase2-auth-security.test.js',
  'tests/phase3-api-endpoints.test.js',
  'tests/phase4-seed-verification.test.js',
  'tests/phase5-views-integration.test.js'
];

async function runTest(file) {
  return new Promise((resolve) => {
    console.log(`\n================================================================`);
    console.log(`🧪 RUNNING TEST SUITE: ${file}`);
    console.log(`================================================================`);

    const proc = spawn('node', [file], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      env: process.env
    });

    proc.on('close', (code) => {
      resolve({ file, passed: code === 0, code });
    });
  });
}

async function runAllTests() {
  console.log('🏁 Starting Unified Test Runner for The Daily Web...');
  const startTime = Date.now();
  const results = [];

  for (const testFile of TEST_FILES) {
    const res = await runTest(testFile);
    results.push(res);
    if (!res.passed) {
      console.error(`\n❌ TEST SUITE FAILED: ${res.file} (exit code: ${res.code})`);
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n================================================================`);
  console.log(`🎉 ALL ${results.length} TEST SUITES PASSED CLEANLY IN ${duration}s!`);
  console.log(`================================================================`);
  results.forEach(r => console.log(`   ✅ ${r.file}`));
  console.log(`================================================================\n`);
  process.exit(0);
}

runAllTests();
