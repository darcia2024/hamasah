// Toko kelas daring (kelas.html, migrasi 049): katalog, daftar akun pembeli, membeli kelas,
// dan kelas terbuka otomatis setelah keuangan menandai tagihannya lunas.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

test('kelas daring: daftar, beli, lunas, lalu kelas terbuka', async () => {
  const database = await createTestDatabase();
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    database,
    bootstrapKey: 'kunci-bootstrap-kelas',
    rateLimiter: createRelaxedRateLimiter(),
    auditRetention: false,
    inProcessNotificationWorker: false
  });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await fetch(`${baseUrl}/api/auth/bootstrap`, {
      method: 'POST',
      headers: { Authorization: 'Bearer kunci-bootstrap-kelas', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Admin Kelas', email: 'admin.kelas@hamasah.test', password: 'kata-sandi-admin-kelas' })
    });
    const admin = (await request(baseUrl, '/api/auth/login', {
      method: 'POST', body: { email: 'admin.kelas@hamasah.test', password: 'kata-sandi-admin-kelas' }
    })).body.accessToken;

    const kursus = await request(baseUrl, '/api/courses', {
      method: 'POST', token: admin, body: { title: 'Nahwu Dasar', description: 'Dasar-dasar nahwu untuk pemula.' }
    });
    assert.equal(kursus.status, 201);
    const courseId = kursus.body.course.id;

    // Belum diterbitkan: katalog publik kosong.
    assert.deepEqual((await request(baseUrl, '/api/kelas')).body.items, []);

    // Harga harus angka rupiah positif.
    assert.equal((await request(baseUrl, `/api/admin/kelas/${courseId}`, { method: 'PUT', token: admin, body: { price: 0 } })).status, 422);
    const terbit = await request(baseUrl, `/api/admin/kelas/${courseId}`, { method: 'PUT', token: admin, body: { price: 150000, published: true } });
    assert.equal(terbit.status, 200);
    const katalog = (await request(baseUrl, '/api/kelas')).body.items;
    assert.equal(katalog.length, 1);
    assert.equal(katalog[0].price, 150000);
    assert.equal(katalog[0].title, 'Nahwu Dasar');

    // Daftar akun pembeli: wajib persetujuan, lalu langsung mendapat sesi.
    const tanpaSetuju = await request(baseUrl, '/api/kelas/daftar', {
      method: 'POST', body: { name: 'Pembeli Uji', email: 'pembeli@hamasah.test', password: 'kata-sandi-pembeli' }
    });
    assert.equal(tanpaSetuju.status, 422);
    const daftar = await request(baseUrl, '/api/kelas/daftar', {
      method: 'POST', body: { name: 'Pembeli Uji', email: 'Pembeli@Hamasah.test', password: 'kata-sandi-pembeli', city: 'Depok', consent: true }
    });
    assert.equal(daftar.status, 201);
    assert.equal(daftar.body.account.role, 'student');
    const pembeli = daftar.body.accessToken;
    const dobel = await request(baseUrl, '/api/kelas/daftar', {
      method: 'POST', body: { name: 'Pembeli Lain', email: 'pembeli@hamasah.test', password: 'kata-sandi-lainnya', consent: true }
    });
    assert.equal(dobel.status, 422);
    assert.equal(dobel.body.field, 'email');

    const awal = await request(baseUrl, '/api/kelas/saya', { token: pembeli });
    assert.equal(awal.status, 200);
    assert.deepEqual(awal.body.orders, []);
    assert.deepEqual(awal.body.enrolledCourseIds, []);
    const studentId = awal.body.student.id;
    const santri = await database.query('SELECT program, city FROM students WHERE id = $1', [studentId]);
    assert.deepEqual(santri.rows[0], { program: 'Hamasah Courses', city: 'Depok' });

    // Membeli menerbitkan tagihan; membeli lagi sebelum lunas memakai tagihan yang sama.
    const beli = await request(baseUrl, `/api/kelas/${courseId}/beli`, { method: 'POST', token: pembeli });
    assert.equal(beli.status, 201);
    assert.match(beli.body.order.invoiceNumber, /^INV\/HI\/\d{4}\/\d{5}$/);
    assert.equal(beli.body.order.amount, 150000);
    const lagi = await request(baseUrl, `/api/kelas/${courseId}/beli`, { method: 'POST', token: pembeli });
    assert.equal(lagi.status, 200);
    assert.equal(lagi.body.order.invoiceNumber, beli.body.order.invoiceNumber);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM course_orders')).rows[0].n, 1);

    // Belum lunas: belum terdaftar di maddah.
    assert.deepEqual((await request(baseUrl, `/api/students/${studentId}/courses`, { token: pembeli })).body.items, []);

    const { rows } = await database.query('SELECT invoice_id FROM course_orders');
    const lunas = await request(baseUrl, `/api/operations/invoices/${rows[0].invoice_id}/paid`, { method: 'PATCH', token: admin, body: {} });
    assert.equal(lunas.status, 200);

    const sesudah = await request(baseUrl, '/api/kelas/saya', { token: pembeli });
    assert.equal(sesudah.body.orders[0].status, 'paid');
    assert.deepEqual(sesudah.body.enrolledCourseIds, [courseId]);
    const ruangBelajar = await request(baseUrl, `/api/students/${studentId}/courses`, { token: pembeli });
    assert.equal(ruangBelajar.body.items.length, 1);

    // Sudah terdaftar: tidak bisa membeli lagi.
    assert.equal((await request(baseUrl, `/api/kelas/${courseId}/beli`, { method: 'POST', token: pembeli })).status, 409);

    // Kelas yang ditarik dari penjualan hilang dari katalog dan tidak bisa dibeli.
    await request(baseUrl, `/api/admin/kelas/${courseId}`, { method: 'PUT', token: admin, body: { price: 150000, published: false } });
    assert.deepEqual((await request(baseUrl, '/api/kelas')).body.items, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
});
