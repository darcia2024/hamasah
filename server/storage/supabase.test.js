// Driver Supabase Storage diuji terhadap server tiruan.
//
// Yang dikunci di sini adalah BENTUK permintaannya: metode, jalur, header, dan isi.
// Karena driver ini memakai HTTP langsung dan bukan paket resmi, bentuk itu harus
// tercatat di suatu tempat, supaya perubahan yang tidak disengaja langsung ketahuan.
//
// Yang TIDAK bisa dibuktikan test ini: apakah Supabase sungguhan menerima bentuk
// tersebut. Itu baru terbukti saat smoke test di staging.

const assert = require('node:assert/strict');
const http = require('node:http');
const { createSupabaseStorage } = require('./supabase.js');

const KUNCI_PALSU = 'service-role-key-palsu-untuk-uji';

// Server tiruan yang mencatat setiap permintaan yang masuk.
async function serverTiruan(penangan) {
  const permintaan = [];
  const server = http.createServer(async (request, response) => {
    const potongan = [];
    for await (const chunk of request) {
      potongan.push(chunk);
    }
    const isi = Buffer.concat(potongan);
    permintaan.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: isi
    });
    penangan(request, response, isi);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    permintaan,
    url: `http://127.0.0.1:${server.address().port}`,
    async close() { await new Promise((resolve) => server.close(resolve)); }
  };
}

async function run() {
  // --- Unggah ---
  const unggah = await serverTiruan((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ Key: 'hamasah-private/berkas' }));
  });
  try {
    const storage = createSupabaseStorage({ url: unggah.url, serviceRoleKey: KUNCI_PALSU });
    assert.equal(storage.kind, 'supabase');
    assert.equal(storage.supportsSignedUrl, true);

    const isi = Buffer.from('%PDF-1.7 isi berkas uji');
    await storage.upload('hamasah-private', 'registration-document/HI-REG-2026-00001/berkas.pdf', isi, 'application/pdf');

    const dikirim = unggah.permintaan[0];
    assert.equal(dikirim.method, 'POST');
    assert.equal(dikirim.url, '/storage/v1/object/hamasah-private/registration-document/HI-REG-2026-00001/berkas.pdf');
    assert.equal(dikirim.headers.authorization, `Bearer ${KUNCI_PALSU}`);
    assert.equal(dikirim.headers.apikey, KUNCI_PALSU);
    assert.equal(dikirim.headers['content-type'], 'application/pdf');
    // Menolak menimpa berkas dengan kunci yang sama.
    assert.equal(dikirim.headers['x-upsert'], 'false');
    assert.deepEqual(dikirim.body, isi);

    // Setiap bagian kunci di-encode, jadi spasi dan karakter lain tidak merusak jalur.
    await storage.upload('hamasah-private', 'student-media/abc def/berkas.png', Buffer.from('x'), 'image/png');
    assert.equal(unggah.permintaan[1].url, '/storage/v1/object/hamasah-private/student-media/abc%20def/berkas.png');
  } finally {
    await unggah.close();
  }

  // --- Tautan bertanda tangan ---
  const tanda = await serverTiruan((request, response, isi) => {
    assert.deepEqual(JSON.parse(isi.toString('utf8')), { expiresIn: 60 });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ signedURL: '/object/sign/hamasah-private/berkas.pdf?token=abc' }));
  });
  try {
    const storage = createSupabaseStorage({ url: tanda.url, serviceRoleKey: KUNCI_PALSU });
    const url = await storage.signedUrl('hamasah-private', 'berkas.pdf', 60);
    assert.equal(tanda.permintaan[0].method, 'POST');
    assert.equal(tanda.permintaan[0].url, '/storage/v1/object/sign/hamasah-private/berkas.pdf');
    // Balasan Supabase berupa jalur relatif, jadi driver melengkapinya menjadi URL penuh.
    assert.equal(url, `${tanda.url}/storage/v1/object/sign/hamasah-private/berkas.pdf?token=abc`);
  } finally {
    await tanda.close();
  }

  // --- Penghapusan ---
  const hapus = await serverTiruan((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{}');
  });
  try {
    const storage = createSupabaseStorage({ url: hapus.url, serviceRoleKey: KUNCI_PALSU });
    await storage.remove('hamasah-private', 'berkas.pdf');
    assert.equal(hapus.permintaan[0].method, 'DELETE');
    assert.equal(hapus.permintaan[0].url, '/storage/v1/object/hamasah-private/berkas.pdf');
  } finally {
    await hapus.close();
  }

  // --- Kegagalan ---
  const gagal = await serverTiruan((request, response) => {
    response.writeHead(403, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: 'new row violates row-level security policy' }));
  });
  try {
    const storage = createSupabaseStorage({ url: gagal.url, serviceRoleKey: KUNCI_PALSU });
    await assert.rejects(
      () => storage.upload('hamasah-private', 'berkas.pdf', Buffer.from('x'), 'application/pdf'),
      /Unggahan ke storage gagal \(403\)/
    );
    await assert.rejects(() => storage.signedUrl('hamasah-private', 'berkas.pdf'), /Tautan unduhan gagal dibuat \(403\)/);
    await assert.rejects(() => storage.remove('hamasah-private', 'berkas.pdf'), /Penghapusan berkas gagal \(403\)/);
  } finally {
    await gagal.close();
  }

  // 404 saat menghapus memang bukan masalah: tujuannya berkas itu tidak ada lagi.
  const tidakAda = await serverTiruan((request, response) => {
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end('{}');
  });
  try {
    const storage = createSupabaseStorage({ url: tidakAda.url, serviceRoleKey: KUNCI_PALSU });
    await storage.remove('hamasah-private', 'sudah-hilang.pdf');
  } finally {
    await tidakAda.close();
  }

  // Konfigurasi yang belum lengkap ditolak sejak awal.
  assert.throws(() => createSupabaseStorage({ url: 'https://contoh.supabase.co' }), /membutuhkan url dan serviceRoleKey/);
  assert.throws(() => createSupabaseStorage({ serviceRoleKey: KUNCI_PALSU }), /membutuhkan url dan serviceRoleKey/);

  console.log('supabase storage driver tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
