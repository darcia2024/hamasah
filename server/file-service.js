// Alur berkas: minta tempat unggah, kirim isinya, lalu unduh dengan izin.
//
// Dipisah menjadi dua langkah (buat baris pending, lalu kirim isi) supaya
// pemeriksaan izin dan aturan ukuran terjadi SEBELUM satu byte pun diterima.
// Kalau digabung, server harus menampung berkas 20 MB dulu baru menolaknya.

const crypto = require('node:crypto');
const { extensionFor, matchesSignature, policyFor } = require('./storage/upload-policies.js');

const MAX_NAME_LENGTH = 120;
// Baris pending yang isinya tidak pernah dikirim dibersihkan setelah ini.
const PENDING_EXPIRY_MS = 24 * 60 * 60 * 1000;

// Membersihkan nama berkas untuk header Content-Disposition. Nama asli berasal dari
// pengguna: bisa memuat pemisah folder, kutip, atau baris baru yang merusak header.
function safeFileName(name, contentType) {
  const dasar = String(name || '')
    .replace(/[\\/]/g, ' ')
    .replace(/[^\p{L}\p{N}. _-]/gu, '')
    // Runtun titik dibuang seluruhnya. Titik tunggal tetap ada karena dipakai
    // akhiran nama berkas, tetapi ".." tidak menyisakan apa pun yang berguna.
    .replace(/\.{2,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return dasar || `berkas.${extensionFor(contentType)}`;
}

function createFileService(options = {}) {
  const store = options.store;
  const storage = options.storage;
  if (!store || !storage) {
    throw new Error('createFileService membutuhkan store dan storage.');
  }
  const services = options.services || {};
  const now = options.now || function currentTime() { return new Date().toISOString(); };
  const buckets = options.buckets || { private: 'hamasah-private', public: 'hamasah-public' };

  function bucketFor(policy) {
    return policy.visibility === 'public' ? buckets.public : buckets.private;
  }

  async function konteks(actor, auth, entityId) {
    return { actor, auth, entityId: String(entityId || ''), services };
  }

  // Langkah 1: memeriksa izin dan aturan, lalu menyiapkan baris pending.
  async function createUpload(input, { actor, auth }) {
    const source = input || {};
    const purpose = String(source.purpose || '');
    const policy = policyFor(purpose);
    if (!policy) {
      return { ok: false, error: 'Jenis unggahan tidak dikenal.' };
    }

    const entityId = String(source.entityId || '').trim();
    if (!entityId) {
      return { ok: false, error: 'Unggahan harus terhubung ke data tertentu.' };
    }

    const contentType = String(source.contentType || '').trim().toLocaleLowerCase('en-US');
    if (!policy.contentTypes.includes(contentType)) {
      return { ok: false, error: `Tipe berkas tidak diterima untuk ${purpose}.` };
    }

    const size = Number(source.size);
    if (!Number.isInteger(size) || size <= 0) {
      return { ok: false, error: 'Ukuran berkas belum valid.' };
    }
    if (size > policy.maxBytes) {
      return { ok: false, error: `Ukuran berkas melebihi batas ${Math.round(policy.maxBytes / (1024 * 1024))} MB.` };
    }

    if (!(await policy.canUpload(await konteks(actor, auth, entityId)))) {
      return { ok: false, status: 403, error: 'Anda tidak memiliki akses untuk mengunggah berkas ini.' };
    }

    const id = crypto.randomUUID();
    // Nama asli TIDAK dipakai sebagai kunci penyimpanan. Nama dari pengguna bisa
    // memuat apa saja, dan kunci penyimpanan ikut menjadi bagian dari URL.
    const storageKey = `${purpose}/${entityId}/${id}.${extensionFor(contentType)}`;

    const record = await store.insert({
      id,
      bucket: bucketFor(policy),
      storageKey,
      purpose,
      entityType: policy.entityType,
      entityId,
      originalName: safeFileName(source.fileName, contentType),
      contentType,
      sizeBytes: size,
      sha256: null,
      status: 'pending',
      uploadedByAccountId: actor ? actor.id : null,
      createdAt: now()
    });
    return { ok: true, value: record };
  }

  // Antara langkah 1 dan 2: memastikan pemanggil memang berhak, dan memberi tahu
  // batas ukurannya, supaya pembacaan isi bisa dihentikan tepat di batas itu.
  async function beginContent(fileId, { actor, auth }) {
    const record = await store.get(fileId);
    if (!record || record.status === 'deleted') {
      return { ok: false, status: 404, error: 'Berkas tidak ditemukan.' };
    }
    if (record.status === 'ready') {
      return { ok: false, error: 'Isi berkas sudah pernah dikirim.' };
    }
    const policy = policyFor(record.purpose);
    if (!policy) {
      return { ok: false, error: 'Jenis unggahan tidak dikenal.' };
    }
    if (!(await policy.canUpload(await konteks(actor, auth, record.entityId)))) {
      return { ok: false, status: 403, error: 'Anda tidak memiliki akses untuk mengunggah berkas ini.' };
    }
    return { ok: true, value: { maxBytes: policy.maxBytes, contentType: record.contentType } };
  }

  // Langkah 2: menerima isi berkas.
  async function saveContent(fileId, buffer, { actor, auth }) {
    const record = await store.get(fileId);
    if (!record || record.status === 'deleted') {
      return { ok: false, status: 404, error: 'Berkas tidak ditemukan.' };
    }
    if (record.status === 'ready') {
      return { ok: false, error: 'Isi berkas sudah pernah dikirim.' };
    }
    const policy = policyFor(record.purpose);
    if (!policy) {
      return { ok: false, error: 'Jenis unggahan tidak dikenal.' };
    }
    if (!(await policy.canUpload(await konteks(actor, auth, record.entityId)))) {
      return { ok: false, status: 403, error: 'Anda tidak memiliki akses untuk mengunggah berkas ini.' };
    }

    if (!buffer || buffer.length === 0) {
      return { ok: false, error: 'Isi berkas kosong.' };
    }
    if (buffer.length > policy.maxBytes) {
      return { ok: false, status: 413, error: 'Ukuran berkas melebihi batas.' };
    }
    // Byte awal harus cocok dengan tipe yang diakui. Inilah yang menolak berkas
    // .exe yang sekadar diganti namanya menjadi .pdf.
    if (!matchesSignature(record.contentType, buffer)) {
      return { ok: false, error: 'Isi berkas tidak sesuai dengan tipe yang dinyatakan.' };
    }

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    await storage.upload(record.bucket, record.storageKey, buffer, record.contentType);
    const siap = await store.markReady(record.id, { sha256, sizeBytes: buffer.length });
    return { ok: true, value: siap };
  }

  // Langkah 3: mengunduh.
  async function prepareDownload(fileId, { actor, auth }) {
    const record = await store.get(fileId);
    if (!record || record.status !== 'ready') {
      return { ok: false, status: 404, error: 'Berkas tidak ditemukan.' };
    }
    const policy = policyFor(record.purpose);
    if (!policy) {
      return { ok: false, status: 404, error: 'Berkas tidak ditemukan.' };
    }
    if (!(await policy.canDownload(await konteks(actor, auth, record.entityId)))) {
      return { ok: false, status: 403, error: 'Anda tidak memiliki akses ke berkas ini.' };
    }

    if (storage.supportsSignedUrl) {
      // Tautan berlaku 60 detik: cukup untuk diklik, terlalu pendek untuk disebar.
      return { ok: true, value: { record, signedUrl: await storage.signedUrl(record.bucket, record.storageKey, 60) } };
    }
    return { ok: true, value: { record, content: await storage.read(record.bucket, record.storageKey) } };
  }

  // Baris pending yang isinya tidak pernah dikirim hanya menumpuk. Dipanggil job harian.
  async function purgeStalePending(maxAgeMs = PENDING_EXPIRY_MS) {
    const batas = new Date(new Date(now()).getTime() - maxAgeMs).toISOString();
    return store.deletePendingBefore(batas);
  }

  return Object.freeze({ beginContent, createUpload, prepareDownload, purgeStalePending, saveContent });
}

module.exports = { PENDING_EXPIRY_MS, createFileService, safeFileName };
