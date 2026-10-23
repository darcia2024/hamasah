const assert = require('node:assert/strict');
const { bootApp } = require('./browser-harness.js');

async function run() {
  // Use an isolated in-memory fixture; never open the developer's persisted DB.
  const app = await bootApp();
  try {
    assert.equal((await fetch(`${app.baseUrl}/api/health`)).ok, true, 'server uji tidak siap');
    const started = performance.now();
    const responses = await Promise.all(Array.from({ length: 30 }, () => fetch(`${app.baseUrl}/api/health`)));
    const elapsed = performance.now() - started;
    assert.ok(responses.every((response) => response.status === 200));
    assert.ok(elapsed < 5000, `HTTP health terlalu lambat: ${elapsed}ms`);
    console.log(`http performance smoke passed (30 request=${Math.round(elapsed)}ms)`);
  } finally { await app.stop(); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
