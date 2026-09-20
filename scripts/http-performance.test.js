const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

async function run() {
  const port = 4399;
  const child = spawn(process.execPath, ['scripts/dev.js'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  try {
    let ready = false;
    for (let i = 0; i < 60 && !ready; i += 1) { try { ready = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch {} if (!ready) await new Promise((resolve) => setTimeout(resolve, 250)); }
    assert.equal(ready, true, 'server development tidak siap');
    const started = performance.now();
    const responses = await Promise.all(Array.from({ length: 30 }, () => fetch(`http://127.0.0.1:${port}/api/health`)));
    const elapsed = performance.now() - started;
    assert.ok(responses.every((response) => response.status === 200));
    assert.ok(elapsed < 5000, `HTTP health terlalu lambat: ${elapsed}ms`);
    console.log(`http performance smoke passed (30 request=${Math.round(elapsed)}ms)`);
  } finally { child.kill(); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
