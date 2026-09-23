const assert = require('node:assert/strict');
const { RULES, createRateLimiter } = require('./rate-limit.js');

// Jam palsu, supaya test tidak perlu menunggu 15 menit sungguhan.
function jamPalsu(mulai = 1000000) {
  let sekarang = mulai;
  return {
    now: () => sekarang,
    maju(milidetik) { sekarang += milidetik; }
  };
}

async function run() {
  const MENIT = 60 * 1000;

  // Nilai aturan harus sama dengan yang tertulis di panduan.
  assert.deepEqual(RULES.login, { limit: 5, windowMs: 15 * MENIT });
  assert.deepEqual(RULES['password-reset-request'], { limit: 3, windowMs: 60 * MENIT });
  assert.deepEqual(RULES['registration-create'], { limit: 5, windowMs: 60 * MENIT });
  assert.deepEqual(RULES['applicant-login'], { limit: 5, windowMs: 15 * MENIT });
  assert.deepEqual(RULES['faq-ask'], { limit: 20, windowMs: 10 * MENIT });
  assert.deepEqual(RULES['api-default'], { limit: 300, windowMs: 5 * MENIT });

  const jam = jamPalsu();
  const limiter = createRateLimiter({ now: jam.now, cleanup: false });

  // Lima percobaan pertama lolos, yang keenam ditolak.
  for (let ke = 1; ke <= 5; ke += 1) {
    const hasil = await limiter.check('login', 'wali@contoh.test|1.2.3.4');
    assert.equal(hasil.allowed, true, `Percobaan ke-${ke} seharusnya lolos.`);
    assert.equal(hasil.remaining, 5 - ke);
  }
  const ditolak = await limiter.check('login', 'wali@contoh.test|1.2.3.4');
  assert.equal(ditolak.allowed, false);
  assert.equal(ditolak.remaining, 0);
  assert.equal(ditolak.retryAfterSeconds, 15 * 60, 'Retry-After dihitung dari percobaan tertua.');

  // Identitas lain tidak ikut terkena.
  assert.equal((await limiter.check('login', 'wali@contoh.test|5.6.7.8')).allowed, true);
  assert.equal((await limiter.check('login', 'lain@contoh.test|1.2.3.4')).allowed, true);
  // Aturan lain juga terpisah.
  assert.equal((await limiter.check('api-default', '1.2.3.4')).allowed, true);

  // Kelima percobaan di atas terjadi pada milidetik yang sama, jadi semuanya
  // kedaluwarsa bersamaan. Untuk menguji sifat "jendela bergeser" yang sebenarnya,
  // percobaan harus diberi jarak waktu.
  const bergeser = createRateLimiter({ now: jam.now, cleanup: false });
  const kunci = 'geser@contoh.test|9.9.9.9';
  for (let ke = 0; ke < 5; ke += 1) {
    assert.equal((await bergeser.check('login', kunci)).allowed, true);
    jam.maju(1 * MENIT);
  }
  // Sekarang berisi percobaan pada menit ke-0, 1, 2, 3, 4; waktu ada di menit ke-5.
  assert.equal((await bergeser.check('login', kunci)).allowed, false);
  // Retry-After menunjuk ke saat percobaan TERTUA kedaluwarsa: 15 - 5 = 10 menit.
  assert.equal((await bergeser.check('login', kunci)).retryAfterSeconds, 10 * 60);

  jam.maju(10 * MENIT + 1000);
  // Percobaan menit ke-0 sudah lewat, yang lain belum. Tepat satu jatah kembali.
  assert.equal((await bergeser.check('login', kunci)).allowed, true, 'Satu jatah kembali setelah percobaan tertua kedaluwarsa.');
  assert.equal((await bergeser.check('login', kunci)).allowed, false, 'Hanya satu jatah yang kembali, bukan semuanya.');

  // Retry-After tidak pernah nol, karena "coba lagi dalam 0 detik" tidak berguna.
  assert.ok((await bergeser.check('login', kunci)).retryAfterSeconds >= 1);

  // reset dipakai setelah login yang berhasil.
  await bergeser.reset('login', kunci);
  assert.equal((await bergeser.check('login', kunci)).allowed, true);

  // Nama aturan yang tidak dikenal harus gagal keras, bukan diam-diam tanpa batas.
  await assert.rejects(() => limiter.check('aturan-karangan', 'x'), /Aturan rate limit tidak dikenal/);
  await assert.rejects(() => limiter.reset('aturan-karangan', 'x'), /Aturan rate limit tidak dikenal/);
  // Nama bawaan Object juga bukan aturan.
  await assert.rejects(() => limiter.check('constructor', 'x'), /Aturan rate limit tidak dikenal/);

  // Pembersihan membuang bucket yang sudah kedaluwarsa, supaya memori tidak terus naik.
  const pembersihan = createRateLimiter({ now: jam.now, cleanup: false });
  for (let ke = 0; ke < 50; ke += 1) {
    await pembersihan.check('api-default', `10.0.0.${ke}`);
  }
  assert.equal(pembersihan.size, 50);
  pembersihan.sweep();
  assert.equal(pembersihan.size, 50, 'Bucket yang masih dalam jendela tidak dibuang.');
  jam.maju(6 * MENIT);
  pembersihan.sweep();
  assert.equal(pembersihan.size, 0, 'Bucket kedaluwarsa dibuang.');

  console.log('rate limit tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
