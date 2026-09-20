const assert = require('node:assert/strict');
const test = require('node:test');
const { createTestDatabase } = require('./test-support/database.js');
const { createPostgresInquiryStore, normalizePhone, validate } = require('./postgres-inquiry-store.js');

const VALID = Object.freeze({
  name: 'Ahmad Fauzi',
  phone: '081234567890',
  topic: 'kuliah',
  message: 'Saya ingin bertanya tentang alur pendaftaran kuliah S1 Al-Azhar.'
});

test('normalisasi nomor memakai bentuk yang sama dengan pendaftaran', () => {
  assert.equal(normalizePhone('081234567890'), '+6281234567890');
  assert.equal(normalizePhone('62 812-3456-7890'), '+6281234567890');
  assert.equal(normalizePhone('+6281234567890'), '+6281234567890');
  assert.equal(normalizePhone('  '), '');
});

test('validasi menolak isian yang tidak lengkap dan menyebut fieldnya', () => {
  assert.equal(validate({ ...VALID, name: 'A' }).field, 'name');
  assert.equal(validate({ ...VALID, phone: '123' }).field, 'phone');
  assert.equal(validate({ ...VALID, topic: 'entah' }).field, 'topic');
  assert.equal(validate({ ...VALID, message: 'pendek' }).field, 'message');
  assert.equal(validate({ ...VALID, message: 'a'.repeat(2001) }).field, 'message');
  assert.equal(validate(VALID).ok, true);
});

test('pesan konsultasi tersimpan, terbaca berpaginasi, dan statusnya dapat diubah', async (t) => {
  const database = await createTestDatabase();
  t.after(() => database.close());
  const store = createPostgresInquiryStore({ database });

  const created = await store.create(VALID);
  assert.equal(created.ok, true);
  assert.equal(created.value.status, 'new');
  assert.equal(created.value.phone, '+6281234567890');
  assert.equal(created.value.topicLabel, 'Pendaftaran Kuliah S1 Al-Azhar');

  // Isian tidak valid tidak boleh menyentuh database.
  const ditolak = await store.create({ ...VALID, message: 'pendek' });
  assert.equal(ditolak.ok, false);
  assert.equal(ditolak.field, 'message');

  for (let i = 0; i < 4; i += 1) {
    await store.create({ ...VALID, name: `Pendaftar ${i}` });
  }

  const halaman = await store.list({ page: 1, pageSize: 2 });
  assert.equal(halaman.items.length, 2);
  assert.equal(halaman.total, 5);
  assert.equal(halaman.pageSize, 2);

  // Batas atas halaman dijaga supaya satu permintaan tidak menarik seluruh tabel.
  assert.equal((await store.list({ pageSize: 5000 })).pageSize, 100);

  const diubah = await store.updateStatus(created.value.id, 'contacted', null);
  assert.equal(diubah.ok, true);
  assert.equal(diubah.value.status, 'contacted');
  assert.ok(diubah.value.handledAt);

  const baru = await store.list({ status: 'new' });
  assert.equal(baru.total, 4);

  assert.equal((await store.updateStatus(created.value.id, 'entah', null)).ok, false);
  const hilang = await store.updateStatus('00000000-0000-4000-8000-000000000000', 'closed', null);
  assert.equal(hilang.ok, false);
  assert.equal(hilang.status, 404);
});
