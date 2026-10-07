'use strict';

// Penyimpanan konten website publik (lihat server/site-content.js untuk bentuk dan render).
//
// Memakai tabel app_settings yang sama dengan halaman Pengaturan, dengan kunci berawalan
// "konten." (konten.biaya, konten.faq, ...), jadi tidak butuh migrasi baru. Blok yang
// belum pernah disimpan memakai BAWAAN, yang sama dengan isi HTML.
//
// Isi disimpan sebentar di memori (cacheMs) karena dibaca setiap kali halaman publik
// disajikan. Di Vercel, CDN juga menyimpan halaman sampai 5 menit, jadi perubahan bisa
// butuh beberapa menit sampai tampil di semua pengunjung.

const { BAWAAN, BLOK, periksaBlok } = require('./site-content.js');

const AWALAN = 'konten.';
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk menyimpan konten. Buka Pengaturan dan terapkan pembaruan database lebih dulu.';

function salin(nilai) {
  return JSON.parse(JSON.stringify(nilai));
}

function tabelBelumAda(error) {
  if (!error) return false;
  if (error.code === '42P01') return true;
  const pesan = String(error.message || '');
  return pesan.includes('app_settings') && /does not exist/i.test(pesan);
}

function createSiteContentService({ database, cacheMs = 10000, now = () => Date.now() } = {}) {
  if (!database) throw new Error('createSiteContentService membutuhkan database.');
  let cache = null;

  async function muat() {
    if (cache && now() - cache.dimuatPada < cacheMs) return cache;
    const nilai = salin(BAWAAN);
    const tersimpan = Object.fromEntries(BLOK.map((blok) => [blok, false]));
    const terakhir = {};
    let tersedia = true;
    try {
      const { rows } = await database.query(
        `SELECT s.key, s.value, s.updated_at, a.name AS updated_by
         FROM app_settings s
         LEFT JOIN accounts a ON a.id = s.updated_by_account_id
         WHERE s.key LIKE 'konten.%'`
      );
      for (const row of rows) {
        const blok = row.key.slice(AWALAN.length);
        if (!BLOK.includes(blok)) continue;
        // Nilai lama yang tidak lolos aturan sekarang tidak dipakai, supaya halaman tidak rusak.
        const hasil = periksaBlok(blok, row.value);
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

  // Untuk render halaman publik. Bila database bermasalah, halaman tetap tampil dengan isi
  // bawaannya daripada gagal dibuka.
  async function untukHalaman() {
    try {
      return await muat();
    } catch {
      return null;
    }
  }

  async function semua() {
    const isi = await muat();
    return {
      nilai: salin(isi.nilai),
      bawaan: salin(BAWAAN),
      tersimpan: { ...isi.tersimpan },
      terakhir: { ...isi.terakhir },
      tersedia: isi.tersedia
    };
  }

  async function simpan(blok, nilai, actor) {
    if (!actor || actor.role !== 'admin') return { ok: false, status: 403, error: 'Hanya super admin yang dapat mengubah konten website.' };
    if (!BLOK.includes(blok)) return { ok: false, status: 404, error: 'Bagian konten tidak dikenal.' };
    const hasil = periksaBlok(blok, nilai);
    if (!hasil.ok) return { ok: false, error: hasil.error, errors: hasil.bidang ? { [hasil.bidang]: hasil.error } : undefined };
    const sekarang = await muat();
    if (!sekarang.tersedia) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
    const berubah = JSON.stringify(hasil.nilai) !== JSON.stringify(sekarang.nilai[blok]) || !sekarang.tersimpan[blok];
    if (berubah) {
      try {
        await database.query(
          `INSERT INTO app_settings (key, value, updated_by_account_id, updated_at)
           VALUES ($1, $2::jsonb, $3, now())
           ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value, updated_by_account_id = EXCLUDED.updated_by_account_id, updated_at = now()`,
          [`${AWALAN}${blok}`, JSON.stringify(hasil.nilai), actor.id || null]
        );
      } catch (error) {
        cache = null;
        if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
        throw error;
      }
      cache = null;
    }
    return { ok: true, value: { blok, berubah, konten: await semua() } };
  }

  // Menghapus nilai tersimpan, sehingga halaman kembali ke isi bawaan di HTML.
  async function kembalikan(blok, actor) {
    if (!actor || actor.role !== 'admin') return { ok: false, status: 403, error: 'Hanya super admin yang dapat mengubah konten website.' };
    if (!BLOK.includes(blok)) return { ok: false, status: 404, error: 'Bagian konten tidak dikenal.' };
    const sekarang = await muat();
    if (!sekarang.tersedia) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
    const { rows } = await database.query('DELETE FROM app_settings WHERE key = $1 RETURNING key', [`${AWALAN}${blok}`]);
    cache = null;
    return { ok: true, value: { blok, berubah: rows.length > 0, konten: await semua() } };
  }

  return Object.freeze({ kembalikan, semua, simpan, untukHalaman });
}

module.exports = { createSiteContentService };
