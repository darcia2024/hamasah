// Unggah langsung ke penyimpanan: peramban mengirim berkasnya ke storage, server
// hanya memberi tautan lalu memeriksa hasilnya.
//
// Yang dijaga di sini adalah janji bahwa pemeriksaannya tidak berkurang dibanding
// jalur lama: izin diperiksa sebelum tautan diberikan, ukuran dan tanda tangan tipe
// diperiksa dari isi yang benar-benar tersimpan, dan berkas yang tidak lolos tidak
// tertinggal di penyimpanan.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { createFileService } = require('./file-service.js');

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 0x20)]);
const BUKAN_PDF = Buffer.from('MZ palsu yang menyamar sebagai pdf');

// Penyimpanan tiruan yang mendukung tautan unggah, seperti Supabase.
function storageTiruan() {
  const isi = new Map();
  return {
    isi,
    supportsSignedUrl: true,
    supportsSignedUpload: true,
    async signedUploadUrl(bucket, key) { return `https://storage.contoh/upload/${bucket}/${key}?token=abc`; },
    async upload(bucket, key, buffer) { isi.set(`${bucket}/${key}`, buffer); },
    async read(bucket, key) {
      const data = isi.get(`${bucket}/${key}`);
      if (!data) throw new Error('objek tidak ada');
      return data;
    },
    async remove(bucket, key) { isi.delete(`${bucket}/${key}`); },
    async signedUrl() { return 'https://storage.contoh/unduh'; }
  };
}

// Aturan unggah berasal dari server/storage/upload-policies.js, jadi yang ditiru
// di sini adalah objek auth yang dipakai aturan itu, bukan aturannya.
function authTiruan(boleh) {
  return {
    async isCandidate() { return boleh; },
    async staffActor() { return null; },
    async actor() { return null; }
  };
}

function serviceUji({ storage }) {
  const baris = new Map();
  const store = {
    async insert(record) { baris.set(record.id, { ...record }); return { ...record }; },
    async get(id) { const r = baris.get(id); return r ? { ...r } : null; },
    async markReady(id, { sha256, sizeBytes }) {
      const r = baris.get(id);
      Object.assign(r, { status: 'ready', sha256, sizeBytes });
      return { ...r };
    },
    async deletePendingBefore() { return 0; }
  };
  return createFileService({ store, storage });
}

test('unggah langsung memeriksa izin, ukuran, dan isi berkas', async () => {
  const storage = storageTiruan();
  const service = serviceUji({ storage });
  const auth = authTiruan(true);

  const dibuat = await service.createUpload({
    purpose: 'registration-document',
    entityId: 'HI-REG-2026-00001',
    fileName: 'paspor.pdf',
    contentType: 'application/pdf',
    size: PDF.length
  }, { actor: null, auth });
  assert.equal(dibuat.ok, true);
  const fileId = dibuat.value.id;

  // 1. Tautan unggah hanya diberikan kepada yang berhak.
  const tautan = await service.createDirectUpload(fileId, { actor: null, auth });
  assert.equal(tautan.ok, true);
  assert.match(tautan.value.uploadUrl, /^https:\/\/storage\.contoh\/upload\//);
  assert.equal(tautan.value.maxBytes, 5 * 1024 * 1024);

  // 2. Konfirmasi sebelum berkasnya sampai tidak boleh menandai siap.
  const belumSampai = await service.confirmContent(fileId, { actor: null, auth });
  assert.equal(belumSampai.ok, false);
  assert.match(belumSampai.error, /belum sampai/i);

  // 3. Berkas yang isinya tidak sesuai tipe ditolak DAN dihapus dari penyimpanan.
  const kunci = `${dibuat.value.bucket}/${dibuat.value.storageKey}`;
  storage.isi.set(kunci, BUKAN_PDF);
  const palsu = await service.confirmContent(fileId, { actor: null, auth });
  assert.equal(palsu.ok, false);
  assert.match(palsu.error, /tidak sesuai/i);
  assert.equal(storage.isi.has(kunci), false, 'Berkas yang ditolak tidak boleh tertinggal di penyimpanan.');

  // 4. Berkas yang melebihi batas juga ditolak, walau peramban menyebut ukuran kecil.
  storage.isi.set(kunci, Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024, 0x20)]));
  const kebesaran = await service.confirmContent(fileId, { actor: null, auth });
  assert.equal(kebesaran.ok, false);
  assert.equal(kebesaran.status, 413);

  // 5. Berkas yang benar diterima, dengan sha256 dihitung dari isi yang tersimpan.
  storage.isi.set(kunci, PDF);
  const diterima = await service.confirmContent(fileId, { actor: null, auth });
  assert.equal(diterima.ok, true);
  assert.equal(diterima.value.status, 'ready');
  assert.equal(diterima.value.sizeBytes, PDF.length);
  assert.equal(diterima.value.sha256, crypto.createHash('sha256').update(PDF).digest('hex'));

  // 6. Tidak bisa dikirim dua kali.
  assert.equal((await service.confirmContent(fileId, { actor: null, auth })).ok, false);

  console.log('direct upload tests passed');
});

test('tanpa izin, tautan unggah tidak diberikan', async () => {
  const storage = storageTiruan();
  const service = serviceUji({ storage });
  const auth = authTiruan(false);
  const dibuat = await service.createUpload({
    purpose: 'registration-document',
    entityId: 'HI-REG-2026-00002',
    fileName: 'paspor.pdf',
    contentType: 'application/pdf',
    size: PDF.length
  }, { actor: null, auth });
  // createUpload sendiri sudah menolak bila tidak berhak; bila lolos, tautannya tetap ditolak.
  if (dibuat.ok) {
    const tautan = await service.createDirectUpload(dibuat.value.id, { actor: null, auth });
    assert.equal(tautan.ok, false);
    assert.equal(tautan.status, 403);
  } else {
    assert.equal(dibuat.status, 403);
  }
});
