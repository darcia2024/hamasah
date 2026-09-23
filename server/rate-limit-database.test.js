// Pembatas percobaan berbasis database (migrasi 041).
//
// Yang diuji di sini bukan aritmetika jendela waktunya, itu sudah dijaga
// rate-limit.test.js, melainkan sifat yang tidak dimiliki versi memori: hitungannya
// tetap sama walau pembatasnya dibuat ulang, seperti yang terjadi ketika platform
// serverless melayani permintaan berikutnya dengan instance baru.

const assert = require('node:assert/strict');
const test = require('node:test');
const { createTestDatabase } = require('./test-support/database.js');
const { createPostgresRateLimitStore } = require('./postgres-rate-limit-store.js');
const { DATABASE_RULES, RULES, createHybridRateLimiter } = require('./rate-limit.js');

test('pembatas percobaan bertahan walau prosesnya berganti', async () => {
  const database = await createTestDatabase();
  try {
    const store = createPostgresRateLimitStore({ database });
    // Dua pembatas terpisah, seolah dua instance serverless yang berbeda.
    const instanceA = createHybridRateLimiter({ store });
    const instanceB = createHybridRateLimiter({ store });
    const identitas = 'HI-REG-2026-00001';

    // Lima percobaan di instance A menghabiskan jatah applicant-login.
    for (let ke = 1; ke <= RULES['applicant-login'].limit; ke += 1) {
      const hasil = await instanceA.check('applicant-login', identitas);
      assert.equal(hasil.allowed, true, `Percobaan ke-${ke} seharusnya lolos.`);
    }

    // Instance B tidak pernah melihat percobaan itu di memorinya sendiri, tetapi
    // tetap harus menolak. Inilah yang gagal ketika hitungannya di memori proses.
    const ditolak = await instanceB.check('applicant-login', identitas);
    assert.equal(ditolak.allowed, false, 'Instance lain harus ikut menolak.');
    assert.ok(ditolak.retryAfterSeconds >= 1, 'Retry-After tidak boleh nol.');

    // Identitas lain tidak ikut terkunci.
    assert.equal((await instanceB.check('applicant-login', 'HI-REG-2026-00002')).allowed, true);

    // reset dipakai setelah percobaan yang berhasil dan juga lintas instance.
    await instanceB.reset('applicant-login', identitas);
    assert.equal((await instanceA.check('applicant-login', identitas)).allowed, true);

    // Aturan jaring pengaman tetap di memori, jadi tidak menulis ke database.
    assert.equal(DATABASE_RULES.includes('api-default'), false);
    const sebelum = await database.query('SELECT count(*)::int AS n FROM rate_limit_hits');
    await instanceA.check('api-default', '1.2.3.4');
    const sesudah = await database.query('SELECT count(*)::int AS n FROM rate_limit_hits');
    assert.equal(sesudah.rows[0].n, sebelum.rows[0].n, 'api-default tidak boleh menulis ke database.');

    // Baris kedaluwarsa dibuang pembersih, supaya tabelnya tidak tumbuh terus.
    await database.query(
      "UPDATE rate_limit_hits SET occurred_at = now() - interval '2 days'"
    );
    const dibuang = await instanceA.sweep();
    assert.ok(dibuang >= 1, 'Baris kedaluwarsa harus terbuang.');
    const tersisa = await database.query('SELECT count(*)::int AS n FROM rate_limit_hits');
    assert.equal(tersisa.rows[0].n, 0);

    console.log('rate limit database tests passed');
  } finally {
    await database.close();
  }
});
