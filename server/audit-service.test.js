const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { ACTIONS, createAuditService, sanitizeMetadata } = require('./audit-service.js');

function storePalsu() {
  const rows = [];
  return {
    rows,
    async insert(event) { rows.push(event); },
    async list() { return { items: rows, total: rows.length, limit: 50, offset: 0 }; },
    async deleteBefore(batas) {
      const sebelum = rows.length;
      const sisa = rows.filter((row) => row.occurredAt >= batas);
      rows.length = 0;
      rows.push(...sisa);
      return sebelum - rows.length;
    }
  };
}

const SENYAP = { error() {}, log() {} };
const KUNCI = 'kunci-uji-yang-cukup-panjang-sekali';
const WAKTU = '2026-09-16T08:00:00.000Z';

function buatAudit(store, options = {}) {
  return createAuditService({ store, now: () => WAKTU, logger: SENYAP, ...options });
}

async function run() {
  // --- Penyaring metadata ---
  // Ini pengaman terakhir: pemanggil yang lalai tetap tidak bisa membocorkan kata
  // sandi atau token ke catatan yang disimpan berbulan-bulan.
  const disaring = sanitizeMetadata({
    email: 'wali@contoh.test',
    password: 'kata-sandi-asli',
    accessToken: 'token-rahasia',
    access_token: 'token-rahasia',
    guardianPhone: '+628123456789',
    phone: '081234567890',
    content: 'isi dokumen paspor',
    storageKey: 'documents/paspor.pdf',
    authorization: 'Bearer abc',
    jumlah: 3,
    lunas: true,
    daftar: ['a', 'b'],
    bersarang: { rahasia: 'tidak boleh ikut' },
    panjang: 'x'.repeat(500)
  });
  assert.deepEqual(Object.keys(disaring).sort(), ['daftar', 'email', 'jumlah', 'lunas', 'panjang']);
  assert.equal(disaring.guardianPhone, undefined, 'Nomor telepon tidak boleh masuk catatan audit.');
  assert.equal(disaring.bersarang, undefined, 'Objek bersarang dibuang, supaya tidak ada yang menyelipkan seluruh isi request.');
  assert.equal(disaring.email, 'wali@contoh.test');
  assert.equal(disaring.jumlah, 3);
  assert.equal(disaring.lunas, true);
  assert.deepEqual(disaring.daftar, ['a', 'b']);
  assert.equal(disaring.panjang.length, 201, 'Nilai yang terlalu panjang dipotong.');

  // --- Pencatatan ---
  const store = storePalsu();
  const audit = buatAudit(store, { ipHashSecret: KUNCI });

  await audit.record({
    action: ACTIONS.LOGIN_SUCCESS,
    actor: { id: 'akun-1', role: 'admin' },
    ip: '203.0.113.10',
    entityType: 'account',
    entityId: 'akun-1',
    metadata: { email: 'admin@contoh.test', password: 'jangan-tersimpan' }
  });
  assert.equal(store.rows.length, 1);
  const pertama = store.rows[0];
  assert.equal(pertama.action, 'auth.login.success');
  assert.equal(pertama.actorAccountId, 'akun-1');
  assert.equal(pertama.actorRole, 'admin');
  assert.equal(pertama.entityId, 'akun-1');
  assert.equal(pertama.metadata.password, undefined, 'Penyaring tetap bekerja lewat record.');
  assert.equal(pertama.metadata.email, 'admin@contoh.test');

  // --- Alamat IP ---
  // Disimpan sebagai HMAC, bukan apa adanya, supaya catatan ini tidak berubah
  // menjadi arsip lokasi orang kalau suatu saat bocor.
  assert.notEqual(pertama.ipHash, '203.0.113.10');
  assert.match(pertama.ipHash, /^[0-9a-f]{64}$/);
  assert.equal(pertama.ipHash, crypto.createHmac('sha256', KUNCI).update('203.0.113.10').digest('hex'));

  // Alamat yang sama tetap menghasilkan hash yang sama, supaya beberapa percobaan
  // dari satu sumber masih bisa dikenali sebagai satu sumber.
  await audit.record({ action: ACTIONS.LOGIN_FAILED, ip: '203.0.113.10' });
  assert.equal(store.rows[1].ipHash, pertama.ipHash);

  // Alamat berbeda menghasilkan hash berbeda.
  await audit.record({ action: ACTIONS.LOGIN_FAILED, ip: '198.51.100.7' });
  assert.notEqual(store.rows[2].ipHash, pertama.ipHash);

  // Kunci berbeda menghasilkan hash berbeda untuk alamat yang sama. Inilah gunanya
  // HMAC: tanpa kunci, seluruh alamat IPv4 yang mungkin bisa dihitung satu per satu
  // sampai ketemu, sehingga hash biasa tidak menyembunyikan apa pun.
  const storeLain = storePalsu();
  await buatAudit(storeLain, { ipHashSecret: 'kunci-lain-yang-juga-panjang-sekali' })
    .record({ action: ACTIONS.LOGIN_SUCCESS, ip: '203.0.113.10' });
  assert.notEqual(storeLain.rows[0].ipHash, pertama.ipHash);

  // Tanpa kunci, alamat tidak disimpan sama sekali.
  const tanpaKunci = storePalsu();
  await buatAudit(tanpaKunci).record({ action: ACTIONS.LOGOUT, ip: '203.0.113.10' });
  assert.equal(tanpaKunci.rows[0].ipHash, null);

  // --- Aksi tidak dikenal ---
  // Ditolak, karena nama aksi karangan membuat penyaringan di layar audit tidak
  // bisa dipercaya: filter "login gagal" akan melewatkan kejadian yang salah nama.
  await audit.record({ action: 'aksi.karangan', ip: '203.0.113.10' });
  assert.equal(store.rows.length, 3, 'Aksi tidak dikenal tidak ikut tersimpan.');

  // --- Kegagalan mencatat ---
  // Tidak boleh menggagalkan pekerjaan utama, tetapi harus terlihat di log.
  const pesan = [];
  const auditRusak = createAuditService({
    store: { async insert() { throw new Error('database sedang bermasalah'); } },
    now: () => WAKTU,
    logger: { error: (teks) => pesan.push(teks) }
  });
  await auditRusak.record({ action: ACTIONS.LOGIN_SUCCESS, ip: '203.0.113.10' });
  assert.equal(pesan.length, 1, 'Kegagalan dicatat ke log, bukan ditelan diam-diam.');
  assert.match(pesan[0], /Gagal mencatat kejadian/);

  // --- Pembacaan ---
  assert.equal((await audit.list({}, { role: 'supervisor' })).ok, false);
  assert.equal((await audit.list({}, { role: 'finance' })).ok, false);
  assert.equal((await audit.list({}, null)).ok, false);
  assert.equal((await audit.list({}, { role: 'admin' })).ok, true);

  // --- Retensi ---
  store.rows.length = 0;
  store.rows.push({ occurredAt: '2025-01-01T00:00:00.000Z', action: ACTIONS.LOGOUT });
  store.rows.push({ occurredAt: '2026-09-01T00:00:00.000Z', action: ACTIONS.LOGOUT });
  store.rows.push({ occurredAt: WAKTU, action: ACTIONS.LOGOUT });
  assert.equal(await audit.purgeOlderThan(365), 1, 'Hanya catatan berumur lebih dari 365 hari yang dihapus.');
  assert.equal(store.rows.length, 2);
  assert.equal(await audit.purgeOlderThan(7), 1, 'Batas retensi bisa diatur.');
  assert.equal(store.rows.length, 1);

  console.log('audit service tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
