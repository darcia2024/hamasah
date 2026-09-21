// Penukaran token undangan dan reset kata sandi dibatasi lajunya (Task R6.6). Kedua endpoint
// itu tanpa sesi dan setiap permintaan yang sampai ke layanan memicu verifikasi scrypt.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');

const LIMIT = 10;

async function post(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return { status: response.status, retryAfter: response.headers.get('retry-after'), body: await response.json().catch(() => ({})) };
}

async function checkEndpoint(pathname) {
  const database = await createTestDatabase();
  // Pembatas bawaan (aturan sungguhan), bukan yang dilonggarkan test lain.
  const app = createHamasahApp({ rootDirectory: path.resolve(__dirname, '..'), database, bootstrapKey: 'bootstrap-token-uji' });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const statuses = [];
    for (let n = 0; n < LIMIT; n += 1) statuses.push((await post(baseUrl, pathname, { token: `token-salah-${n}`, password: 'kata-sandi-baru-uji-1' })).status);
    assert.ok(statuses.every((status) => status === 422 || status === 204), `${pathname}: token salah seharusnya 422, dapat ${statuses}.`);
    const ditolak = await post(baseUrl, pathname, { token: 'token-salah-lagi', password: 'kata-sandi-baru-uji-1' });
    assert.equal(ditolak.status, 429, `${pathname}: permintaan ke-${LIMIT + 1} seharusnya 429.`);
    assert.ok(Number(ditolak.retryAfter) > 0, 'Retry-After harus berisi jumlah detik.');
    assert.equal(ditolak.body.error, 'Terlalu banyak percobaan. Silakan coba lagi dalam beberapa menit.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
}

async function run() {
  await checkEndpoint('/api/auth/invitations/accept');
  await checkEndpoint('/api/auth/password-reset');
  console.log(`token rate limit tests passed (429 pada permintaan ke-${LIMIT + 1} untuk kedua endpoint)`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
