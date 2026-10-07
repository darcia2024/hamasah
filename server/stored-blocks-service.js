'use strict';

// Penyimpanan "blok" isian super admin di tabel app_settings, satu baris per blok dengan
// kunci berawalan (konten.biaya, template.whatsapp, ...). Dipakai halaman Konten Website
// (site-content-service.js) dan halaman Template (template-service.js).
//
// Blok yang belum pernah disimpan memakai `bawaan`. Isi disimpan sebentar di memori
// (cacheMs) karena ada yang dibaca di setiap halaman publik atau setiap email.

const PESAN_DATABASE = 'Database belum diperbarui untuk menyimpan isian ini. Buka Pengaturan dan terapkan pembaruan database lebih dulu.';

function salin(nilai) {
  return JSON.parse(JSON.stringify(nilai));
}

function tabelBelumAda(error) {
  if (!error) return false;
  if (error.code === '42P01') return true;
  const pesan = String(error.message || '');
  return pesan.includes('app_settings') && /does not exist/i.test(pesan);
}

// awalan: misalnya 'konten.'. blok: daftar nama blok. bawaan: { blok: nilai }.
// periksa(blok, nilai): { ok, nilai } atau { ok: false, error, bidang }.
// namaAkses: dipakai di pesan penolakan, misalnya "konten website".
function createStoredBlocksService({ database, awalan, blok: daftarBlok, bawaan, periksa, namaAkses, cacheMs = 10000, now = () => Date.now() } = {}) {
  if (!database) throw new Error('createStoredBlocksService membutuhkan database.');
  let cache = null;

  async function muat() {
    if (cache && now() - cache.dimuatPada < cacheMs) return cache;
    const nilai = salin(bawaan);
    const tersimpan = Object.fromEntries(daftarBlok.map((blok) => [blok, false]));
    const terakhir = {};
    let tersedia = true;
    try {
      const { rows } = await database.query(
        `SELECT s.key, s.value, s.updated_at, a.name AS updated_by
         FROM app_settings s
         LEFT JOIN accounts a ON a.id = s.updated_by_account_id
         WHERE s.key LIKE $1`,
        [`${awalan}%`]
      );
      for (const row of rows) {
        const blok = row.key.slice(awalan.length);
        if (!daftarBlok.includes(blok)) continue;
        // Nilai lama yang tidak lolos aturan sekarang tidak dipakai, supaya tampilan tidak rusak.
        const hasil = periksa(blok, row.value);
        if (!hasil.ok) continue;
        nilai[blok] = hasil.nilai;
        tersimpan[blok] = true;
        terakhir[blok] = { pada: new Date(row.updated_at).toISOString(), oleh: row.updated_by || null };
      }
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      tersedia = false;
    }
    cache = { nilai, tersimpan, terakhir, tersedia, dimuatPada: now() };
    return cache;
  }

  // Untuk pemakaian sehari-hari (halaman publik, email, PDF). Bila database bermasalah,
  // hasilnya null dan pemanggil memakai bawaan, daripada ikut gagal.
  async function untukPakai() {
    try {
      return await muat();
    } catch {
      return null;
    }
  }

  // Nilai satu blok, atau bawaannya bila belum bisa dibaca.
  async function nilaiBlok(blok) {
    const isi = await untukPakai();
    return isi ? isi.nilai[blok] : salin(bawaan[blok]);
  }

  async function semua() {
    const isi = await muat();
    return {
      nilai: salin(isi.nilai),
      bawaan: salin(bawaan),
      tersimpan: { ...isi.tersimpan },
      terakhir: { ...isi.terakhir },
      tersedia: isi.tersedia
    };
  }

  function tolak(actor) {
    return !actor || actor.role !== 'admin'
      ? { ok: false, status: 403, error: `Hanya super admin yang dapat mengubah ${namaAkses}.` }
      : null;
  }

  async function simpan(blok, nilai, actor) {
    const ditolak = tolak(actor);
    if (ditolak) return ditolak;
    if (!daftarBlok.includes(blok)) return { ok: false, status: 404, error: 'Bagian tidak dikenal.' };
    const hasil = periksa(blok, nilai);
    if (!hasil.ok) return { ok: false, error: hasil.error, errors: hasil.bidang ? { [hasil.bidang]: hasil.error } : undefined };
    const sekarang = await muat();
    if (!sekarang.tersedia) return { ok: false, status: 409, error: PESAN_DATABASE };
    const berubah = JSON.stringify(hasil.nilai) !== JSON.stringify(sekarang.nilai[blok]) || !sekarang.tersimpan[blok];
    if (berubah) {
      try {
        await database.query(
          `INSERT INTO app_settings (key, value, updated_by_account_id, updated_at)
           VALUES ($1, $2::jsonb, $3, now())
           ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value, updated_by_account_id = EXCLUDED.updated_by_account_id, updated_at = now()`,
          [`${awalan}${blok}`, JSON.stringify(hasil.nilai), actor.id || null]
        );
      } catch (error) {
        cache = null;
        if (tabelBelumAda(error)) return { ok: false, status: 409, error: PESAN_DATABASE };
        throw error;
      }
      cache = null;
    }
    return { ok: true, value: { blok, berubah, isi: await semua() } };
  }

  // Menghapus nilai tersimpan, sehingga blok kembali ke bawaan.
  async function kembalikan(blok, actor) {
    const ditolak = tolak(actor);
    if (ditolak) return ditolak;
    if (!daftarBlok.includes(blok)) return { ok: false, status: 404, error: 'Bagian tidak dikenal.' };
    const sekarang = await muat();
    if (!sekarang.tersedia) return { ok: false, status: 409, error: PESAN_DATABASE };
    const { rows } = await database.query('DELETE FROM app_settings WHERE key = $1 RETURNING key', [`${awalan}${blok}`]);
    cache = null;
    return { ok: true, value: { blok, berubah: rows.length > 0, isi: await semua() } };
  }

  return Object.freeze({ kembalikan, nilaiBlok, semua, simpan, untukPakai });
}

module.exports = { createStoredBlocksService };
