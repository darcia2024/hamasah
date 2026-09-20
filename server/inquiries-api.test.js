// Test integrasi endpoint pesan konsultasi (Task R1.6), termasuk otorisasi negatif.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const PESAN = Object.freeze({
  name: 'Siti Aminah',
  phone: '081298765432',
  topic: 'biaya',
  message: 'Mohon informasi skema pembayaran untuk program Ma\'had tahun depan.'
});

async function request(baseUrl, pathname, options) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  if (response.status === 204) return { status: response.status, body: null };
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function withApp(run) {
  const database = await createTestDatabase();
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    database,
    bootstrapKey: 'bootstrap-test-key',
    rateLimiter: createRelaxedRateLimiter(),
    email: { driver: 'test', appBaseUrl: 'https://app.hamasah.test' },
    emailSender: { provider: 'test', configured: true, async send() { return { id: 'mail-1' }; } }
  });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  }
}

async function signIn(baseUrl, { name, email, password, role }) {
  await request(baseUrl, '/api/auth/bootstrap', {
    method: 'POST',
    headers: { Authorization: 'Bearer bootstrap-test-key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Admin Uji', email: 'admin@hamasah.test', password: 'kata-sandi-admin-uji' })
  });
  const adminLogin = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@hamasah.test', password: 'kata-sandi-admin-uji' })
  });
  const adminHeaders = { Authorization: `Bearer ${adminLogin.body.accessToken}`, 'Content-Type': 'application/json' };
  if (role === 'admin') return adminHeaders;

  await request(baseUrl, '/api/accounts', {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ name, email, password, role })
  });
  const login = await request(baseUrl, '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(login.status, 200, `login ${role} gagal`);
  return { Authorization: `Bearer ${login.body.accessToken}`, 'Content-Type': 'application/json' };
}

test('formulir publik menyimpan pesan tanpa sesi dan menolak isian tidak valid', async () => {
  await withApp(async (baseUrl) => {
    const dibuat = await request(baseUrl, '/api/inquiries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(PESAN)
    });
    assert.equal(dibuat.status, 201);
    assert.ok(dibuat.body.item.id, 'id pesan harus dikembalikan');
    // Respons publik tidak mengembalikan isi pesan atau nomor kembali ke pengirim.
    assert.equal(dibuat.body.item.message, undefined);
    assert.equal(dibuat.body.item.phone, undefined);

    const ditolak = await request(baseUrl, '/api/inquiries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...PESAN, message: 'pendek' })
    });
    assert.equal(ditolak.status, 422);
    assert.equal(ditolak.body.field, 'message');
  });
});

test('daftar pesan konsultasi tertutup untuk yang tidak berhak', async () => {
  await withApp(async (baseUrl) => {
    await request(baseUrl, '/api/inquiries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(PESAN)
    });

    // Tanpa sesi.
    const anonim = await request(baseUrl, '/api/inquiries');
    assert.equal(anonim.status, 401);

    // Sesi dengan role yang tidak berhak.
    const santri = await signIn(baseUrl, {
      name: 'Santri Uji', email: 'santri@hamasah.test', password: 'kata-sandi-santri-uji', role: 'student'
    });
    const ditolak = await request(baseUrl, '/api/inquiries', { headers: santri });
    assert.equal(ditolak.status, 403);

    const ubahDitolak = await request(baseUrl, '/api/inquiries/00000000-0000-4000-8000-000000000000/status', {
      method: 'PATCH', headers: santri, body: JSON.stringify({ status: 'contacted' })
    });
    assert.equal(ubahDitolak.status, 403);
  });
});

test('petugas pendaftaran membaca daftar dan mengubah status', async () => {
  await withApp(async (baseUrl) => {
    await request(baseUrl, '/api/inquiries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(PESAN)
    });

    const petugas = await signIn(baseUrl, {
      name: 'Petugas Uji', email: 'petugas@hamasah.test', password: 'kata-sandi-petugas-uji', role: 'registration-officer'
    });

    const daftar = await request(baseUrl, '/api/inquiries?status=new', { headers: petugas });
    assert.equal(daftar.status, 200);
    assert.equal(daftar.body.total, 1);
    assert.equal(daftar.body.items[0].name, PESAN.name);
    assert.equal(daftar.body.items[0].phone, '+6281298765432');

    const diubah = await request(baseUrl, `/api/inquiries/${daftar.body.items[0].id}/status`, {
      method: 'PATCH', headers: petugas, body: JSON.stringify({ status: 'contacted' })
    });
    assert.equal(diubah.status, 200);
    assert.equal(diubah.body.item.status, 'contacted');

    const sisa = await request(baseUrl, '/api/inquiries?status=new', { headers: petugas });
    assert.equal(sisa.body.total, 0);
  });
});

test('audit mencatat pesan masuk tanpa membocorkan nomor atau isi pesan', async () => {
  await withApp(async (baseUrl) => {
    await request(baseUrl, '/api/inquiries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(PESAN)
    });
    const admin = await signIn(baseUrl, { role: 'admin' });
    const audit = await request(baseUrl, '/api/audit?action=inquiry.received', { headers: admin });
    assert.equal(audit.status, 200);
    assert.equal(audit.body.total, 1);

    const catatan = JSON.stringify(audit.body.items[0]);
    assert.ok(!catatan.includes('6281298765432'), 'nomor tidak boleh masuk jejak audit');
    assert.ok(!catatan.includes('skema pembayaran'), 'isi pesan tidak boleh masuk jejak audit');
    assert.ok(catatan.includes('biaya'), 'topik boleh dicatat untuk pelaporan');
  });
});
