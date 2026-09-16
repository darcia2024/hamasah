// Penyimpanan berkas di Supabase Storage.
//
// Memakai HTTP langsung lewat fetch bawaan Node, bukan paket @supabase/supabase-js.
// Alasannya: yang dibutuhkan hanya tiga operasi (unggah, tautan bertanda tangan,
// hapus), sementara paket itu membawa belasan dependency turunan. Untuk aplikasi
// yang menyimpan paspor dan ijazah anak orang, setiap dependency tambahan adalah
// pintu masuk tambahan yang harus ikut dipercaya.
//
// Konsekuensinya: kalau Supabase mengubah bentuk API-nya, yang menyesuaikan kita
// sendiri. Ketiga permintaan di bawah dipatok bentuknya oleh test, sehingga
// perubahan yang tidak disengaja langsung ketahuan.
//
// SUPABASE_SERVICE_ROLE_KEY hanya dipakai di sisi server dan tidak pernah dikirim
// ke browser. Key ini melewati seluruh aturan Row Level Security.

const DEFAULT_SIGNED_URL_SECONDS = 60;

function encodeKey(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

async function bacaPesanError(response) {
  // Pesan dari Supabase ikut dibaca agar kegagalan bisa ditelusuri, tetapi
  // dipendekkan supaya log tidak kebanjiran isi balasan yang panjang.
  try {
    const teks = await response.text();
    return teks.slice(0, 200);
  } catch (error) {
    return '';
  }
}

function createSupabaseStorage({ url, serviceRoleKey, fetchImpl } = {}) {
  if (!url || !serviceRoleKey) {
    throw new Error('createSupabaseStorage membutuhkan url dan serviceRoleKey.');
  }
  const base = String(url).replace(/\/+$/, '');
  const panggil = fetchImpl || globalThis.fetch;

  function headers(extra = {}) {
    return {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      ...extra
    };
  }

  return {
    kind: 'supabase',
    supportsSignedUrl: true,

    async upload(bucket, key, buffer, contentType) {
      const response = await panggil(`${base}/storage/v1/object/${bucket}/${encodeKey(key)}`, {
        method: 'POST',
        headers: headers({
          'Content-Type': contentType,
          // Menolak menimpa berkas yang sudah ada dengan kunci yang sama.
          'x-upsert': 'false'
        }),
        body: buffer
      });
      if (!response.ok) {
        throw new Error(`Unggahan ke storage gagal (${response.status}): ${await bacaPesanError(response)}`);
      }
    },

    async signedUrl(bucket, key, seconds = DEFAULT_SIGNED_URL_SECONDS) {
      const response = await panggil(`${base}/storage/v1/object/sign/${bucket}/${encodeKey(key)}`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ expiresIn: seconds })
      });
      if (!response.ok) {
        throw new Error(`Tautan unduhan gagal dibuat (${response.status}): ${await bacaPesanError(response)}`);
      }
      const hasil = await response.json();
      const jalur = String(hasil.signedURL || hasil.signedUrl || '');
      if (!jalur) {
        throw new Error('Balasan storage tidak memuat tautan bertanda tangan.');
      }
      return jalur.startsWith('http') ? jalur : `${base}/storage/v1${jalur.startsWith('/') ? '' : '/'}${jalur}`;
    },

    async remove(bucket, key) {
      const response = await panggil(`${base}/storage/v1/object/${bucket}/${encodeKey(key)}`, {
        method: 'DELETE',
        headers: headers()
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Penghapusan berkas gagal (${response.status}): ${await bacaPesanError(response)}`);
      }
    },

    async read() {
      // Tidak dipakai: unduhan dari Supabase selalu lewat tautan bertanda tangan.
      throw new Error('Driver supabase tidak membaca isi berkas lewat aplikasi.');
    }
  };
}

module.exports = { DEFAULT_SIGNED_URL_SECONDS, createSupabaseStorage };
