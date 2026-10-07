'use strict';

// Pengaturan aplikasi yang diubah super admin dari halaman Pengaturan, tanpa redeploy.
//
// Nilai disimpan di tabel app_settings (migrasi 043), satu baris per kunci. Kunci yang
// belum pernah disimpan memakai nilai bawaan di DEFINISI, atau nilai dari environment
// yang diberikan app.js lewat `defaults` (misalnya HEALTH_RECORDS_ENABLED). Karena itu
// aplikasi tetap berjalan normal walaupun tabelnya belum ada: semua kunci memakai bawaan,
// dan hanya penyimpanan yang ditolak sampai database diperbarui.
//
// Nilai disimpan sebentar di memori (cacheMs) supaya halaman publik tidak membaca database
// setiap kali dibuka. Di Vercel setiap instance punya salinannya sendiri, jadi perubahan
// bisa butuh beberapa detik sampai terasa di semua pengunjung.

const DEFINISI = Object.freeze({
  'pendaftaran.dibuka': { jenis: 'saklar', bawaan: true },
  'pendaftaran.periode': { jenis: 'teks', bawaan: 'Penerimaan 2026/2027', min: 3, maks: 60 },
  'pendaftaran.pesanTutup': {
    jenis: 'teks',
    bawaan: 'Pendaftaran gelombang ini sudah ditutup. Hubungi admin lewat WhatsApp untuk informasi gelombang berikutnya.',
    min: 10,
    maks: 300
  },
  'kesehatan.aktif': { jenis: 'saklar', bawaan: false },
  'asisten.situs': { jenis: 'saklar', bawaan: true },
  'asisten.belajar': { jenis: 'saklar', bawaan: true },
  'asisten.batasPerJam': { jenis: 'angka', bawaan: 20, min: 1, maks: 200 },
  'audit.masaSimpanHari': { jenis: 'angka', bawaan: 365, min: 90, maks: 3650 }
});

const LABEL = Object.freeze({
  'pendaftaran.dibuka': 'Pendaftaran online',
  'pendaftaran.periode': 'Periode penerimaan',
  'pendaftaran.pesanTutup': 'Pesan saat pendaftaran ditutup',
  'kesehatan.aktif': 'Catatan kesehatan',
  'asisten.situs': 'Asisten di website',
  'asisten.belajar': 'Asisten belajar LMS',
  'asisten.batasPerJam': 'Batas pertanyaan asisten per jam',
  'audit.masaSimpanHari': 'Masa simpan jejak audit'
});

const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk menyimpan pengaturan. Terapkan pembaruan database di bagian bawah halaman ini lebih dulu.';

function tabelBelumAda(error) {
  if (!error) return false;
  if (error.code === '42P01') return true;
  const pesan = String(error.message || '');
  return pesan.includes('app_settings') && /does not exist/i.test(pesan);
}

// Mengembalikan { ok, nilai } atau { ok: false, error } untuk satu kunci.
function periksaNilai(kunci, nilai) {
  const definisi = DEFINISI[kunci];
  const label = LABEL[kunci];
  if (definisi.jenis === 'saklar') {
    return typeof nilai === 'boolean' ? { ok: true, nilai } : { ok: false, error: `${label} harus aktif atau nonaktif.` };
  }
  if (definisi.jenis === 'angka') {
    const angka = typeof nilai === 'string' && nilai.trim() !== '' ? Number(nilai) : nilai;
    if (!Number.isInteger(angka) || angka < definisi.min || angka > definisi.maks) {
      return { ok: false, error: `${label} harus bilangan bulat ${definisi.min} sampai ${definisi.maks}.` };
    }
    return { ok: true, nilai: angka };
  }
  const teks = typeof nilai === 'string' ? nilai.replace(/\s+/g, ' ').trim() : '';
  if (teks.length < definisi.min || teks.length > definisi.maks) {
    return { ok: false, error: `${label} harus ${definisi.min} sampai ${definisi.maks} karakter.` };
  }
  return { ok: true, nilai: teks };
}

function createSettingsService({ database, defaults = {}, cacheMs = 10000, now = () => Date.now() } = {}) {
  if (!database) throw new Error('createSettingsService membutuhkan database.');

  const bawaan = {};
  for (const [kunci, definisi] of Object.entries(DEFINISI)) {
    const dariEnv = defaults[kunci];
    bawaan[kunci] = dariEnv !== undefined && periksaNilai(kunci, dariEnv).ok ? periksaNilai(kunci, dariEnv).nilai : definisi.bawaan;
  }

  let cache = null;

  async function muat() {
    if (cache && now() - cache.dimuatPada < cacheMs) return cache;
    const nilai = { ...bawaan };
    let tersedia = true;
    let terakhir = null;
    try {
      const { rows } = await database.query(
        `SELECT s.key, s.value, s.updated_at, a.name AS updated_by
         FROM app_settings s
         LEFT JOIN accounts a ON a.id = s.updated_by_account_id
         WHERE s.key NOT LIKE 'konten.%'
         ORDER BY s.updated_at DESC`
      );
      for (const row of rows) {
        if (!DEFINISI[row.key]) continue;
        const hasil = periksaNilai(row.key, row.value);
        if (hasil.ok) nilai[row.key] = hasil.nilai;
      }
      if (rows.length) {
        terakhir = { pada: new Date(rows[0].updated_at).toISOString(), oleh: rows[0].updated_by || null };
      }
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      tersedia = false;
    }
    cache = { nilai: Object.freeze(nilai), tersedia, terakhir, dimuatPada: now() };
    return cache;
  }

  async function semua() {
    const isi = await muat();
    return { nilai: isi.nilai, bawaan: Object.freeze({ ...bawaan }), tersedia: isi.tersedia, terakhir: isi.terakhir };
  }

  async function ambil(kunci) {
    if (!DEFINISI[kunci]) throw new Error(`Pengaturan tidak dikenal: ${kunci}`);
    return (await muat()).nilai[kunci];
  }

  // Hanya bagian yang boleh dibaca pengunjung situs tanpa login.
  async function publik() {
    const { nilai } = await muat();
    return {
      pendaftaran: {
        dibuka: nilai['pendaftaran.dibuka'],
        periode: nilai['pendaftaran.periode'],
        pesanTutup: nilai['pendaftaran.pesanTutup']
      },
      asisten: { situs: nilai['asisten.situs'] }
    };
  }

  // perubahan: { 'pendaftaran.dibuka': false, ... }. Hanya kunci yang nilainya benar-benar
  // berbeda yang ditulis, supaya jejak audit hanya mencatat yang memang diubah.
  async function simpan(perubahan, actor) {
    if (!actor || actor.role !== 'admin') return { ok: false, status: 403, error: 'Hanya super admin yang dapat mengubah pengaturan.' };
    if (!perubahan || typeof perubahan !== 'object' || Array.isArray(perubahan)) {
      return { ok: false, error: 'Data pengaturan belum lengkap.' };
    }
    const sekarang = await muat();
    const ditulis = [];
    const errors = {};
    for (const [kunci, nilai] of Object.entries(perubahan)) {
      if (!DEFINISI[kunci]) {
        errors[kunci] = 'Pengaturan ini tidak dikenal.';
        continue;
      }
      const hasil = periksaNilai(kunci, nilai);
      if (!hasil.ok) {
        errors[kunci] = hasil.error;
        continue;
      }
      if (hasil.nilai !== sekarang.nilai[kunci]) ditulis.push([kunci, hasil.nilai]);
    }
    const daftarError = Object.values(errors);
    if (daftarError.length) return { ok: false, error: daftarError[0], errors };
    if (!ditulis.length) return { ok: true, value: { ...(await semua()), berubah: [] } };
    if (!sekarang.tersedia) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };

    try {
      await database.withTransaction(async (tx) => {
        for (const [kunci, nilai] of ditulis) {
          await tx.query(
            `INSERT INTO app_settings (key, value, updated_by_account_id, updated_at)
             VALUES ($1, $2::jsonb, $3, now())
             ON CONFLICT (key) DO UPDATE
               SET value = EXCLUDED.value, updated_by_account_id = EXCLUDED.updated_by_account_id, updated_at = now()`,
            [kunci, JSON.stringify(nilai), actor.id || null]
          );
        }
      });
    } catch (error) {
      if (tabelBelumAda(error)) {
        cache = null;
        return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      }
      throw error;
    }
    cache = null;
    return { ok: true, value: { ...(await semua()), berubah: ditulis.map(([kunci]) => kunci) } };
  }

  // Dipanggil setelah pembaruan database, supaya status "tersedia" langsung terbaca ulang.
  function lupakanCache() {
    cache = null;
  }

  return Object.freeze({ ambil, lupakanCache, publik, semua, simpan });
}

module.exports = { DEFINISI, LABEL, createSettingsService, periksaNilai };
