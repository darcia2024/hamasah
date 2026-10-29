'use strict';

const crypto = require('node:crypto');
const { SURAT, TOTAL_AYAT } = require('./quran-surah.js');

// Buku setoran tahfidz digital (migrasi 067).
//
// MENCEGAH PENGHITUNGAN GANDA. Kemajuan hafalan = jumlah ayat UNIK yang pernah disetor sebagai hafalan baru
// (ziyadah), diurutkan menurut tanggal setoran. Satu setoran hafalan baru hanya "menambah" ayat yang belum pernah
// disetor sebelumnya (newAyat); ayat yang sudah pernah disetor tidak dihitung lagi, di setoran yang sama maupun
// berikutnya. Murajaah tidak pernah menambah kemajuan. Pada satu hari, ayat murajaah yang sama dihitung sekali.
// Setoran yang keliru dibatalkan dengan alasan (tetap tersimpan sebagai jejak) dan keluar dari semua hitungan.

const KUALITAS = Object.freeze({ lancar: 'Lancar', 'kurang-lancar': 'Kurang lancar', ulang: 'Perlu diulang' });
const JENIS = Object.freeze({ ziyadah: 'Hafalan baru', murajaah: 'Murajaah' });
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk buku setoran tahfidz. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;

function tabelBelumAda(error) {
  if (!error) return false;
  if (['42P01', '42703'].includes(error.code)) return true;
  return /tahfidz_entries/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function rapi(value, maks = 300) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maks);
}

function tanggalValid(teks) {
  if (!TANGGAL.test(String(teks || ''))) return false;
  const d = new Date(`${teks}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === teks;
}

function hariIni(sekarang) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(sekarang);
}

// Hitung ayat baru tiap setoran secara kronologis dan himpunan ayat unik yang tercakup.
// entries: setoran yang tidak dibatalkan { id, date, createdAt, kind, surah, ayahFrom, ayahTo, ... }.
function hitungSetoran(entries) {
  const urut = [...entries].sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt)));
  const cakupan = new Map(); // surat -> Set ayat yang pernah disetor sebagai hafalan baru
  const hasil = urut.map((e) => {
    const panjang = e.ayahTo - e.ayahFrom + 1;
    let baru = 0;
    if (e.kind === 'ziyadah') {
      const set = cakupan.get(e.surah) || new Set();
      for (let a = e.ayahFrom; a <= e.ayahTo; a += 1) {
        if (!set.has(a)) { set.add(a); baru += 1; }
      }
      cakupan.set(e.surah, set);
    }
    return { ...e, ayat: panjang, newAyat: baru, repeatedAyat: e.kind === 'ziyadah' ? panjang - baru : 0 };
  });
  return { entries: hasil, coverage: cakupan };
}

// Ayat murajaah unik per hari (ayat sama di hari sama dihitung sekali), lalu dijumlahkan.
function murajaahPerHari(entries) {
  const perHari = new Map();
  entries.filter((e) => e.kind === 'murajaah').forEach((e) => {
    const set = perHari.get(e.date) || new Set();
    for (let a = e.ayahFrom; a <= e.ayahTo; a += 1) set.add(`${e.surah}:${a}`);
    perHari.set(e.date, set);
  });
  return perHari;
}

function createTahfidzService({ database, accessFor, now = () => new Date() } = {}) {
  if (!database || typeof accessFor !== 'function') throw new Error('createTahfidzService membutuhkan database dan accessFor.');

  async function tulis(fn) {
    try { return await fn(); } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  async function akses(studentId, actor, perlu) {
    if (!actor || !UUID.test(String(studentId))) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    const hasil = await accessFor(studentId, actor);
    if (!hasil.exists) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    if (!hasil[perlu]) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
    return { ok: true };
  }

  const opsi = {
    surahs: SURAT.map((s) => ({ number: s.number, name: s.name, ayat: s.ayat })),
    kinds: Object.entries(JENIS).map(([id, label]) => ({ id, label })),
    qualities: Object.entries(KUALITAS).map(([id, label]) => ({ id, label }))
  };

  function bentukBaris(row) {
    return {
      id: row.id, date: row.entry_date_text, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      kind: row.kind, surah: Number(row.surah), ayahFrom: Number(row.ayah_from), ayahTo: Number(row.ayah_to), quality: row.quality,
      examiner: row.examiner || '', note: row.note || ''
    };
  }

  async function muatSemua(studentId) {
    const { rows } = await database.query(
      `SELECT e.*, to_char(e.entry_date, 'YYYY-MM-DD') AS entry_date_text, e.voided_at IS NOT NULL AS dibatalkan, rb.name AS recorded_by, vb.name AS voided_by
         FROM tahfidz_entries e LEFT JOIN accounts rb ON rb.id = e.recorded_by_account_id LEFT JOIN accounts vb ON vb.id = e.voided_by_account_id
        WHERE e.student_id = $1 ORDER BY e.entry_date, e.created_at`, [studentId]
    );
    return rows;
  }

  // ------------------------------------------------------------------ tulis

  async function addEntry(studentId, input, actor) {
    if (!actor || !['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Setoran dicatat oleh musyrif atau admin.' };
    const izin = await akses(studentId, actor, 'write');
    if (!izin.ok) return izin;
    const sumber = input || {};
    const tanggal = String(sumber.date || '');
    if (!tanggalValid(tanggal)) return { ok: false, error: 'Tanggal setoran tidak valid.' };
    if (tanggal > hariIni(now())) return { ok: false, error: 'Tanggal setoran tidak boleh di masa depan.' };
    if (!JENIS[sumber.kind]) return { ok: false, error: 'Pilih jenis setoran: hafalan baru atau murajaah.' };
    if (!KUALITAS[sumber.quality]) return { ok: false, error: 'Pilih kualitas setoran.' };
    const surat = SURAT[Number(sumber.surah) - 1];
    if (!surat) return { ok: false, error: 'Pilih surat.' };
    const dari = Number(sumber.ayahFrom);
    const sampai = Number(sumber.ayahTo === undefined || sumber.ayahTo === '' ? sumber.ayahFrom : sumber.ayahTo);
    if (!Number.isInteger(dari) || !Number.isInteger(sampai) || dari < 1 || sampai < dari || sampai > surat.ayat) {
      return { ok: false, error: `Ayat harus antara 1 dan ${surat.ayat} untuk surat ${surat.name}, dan ayat akhir tidak boleh sebelum ayat awal.` };
    }
    return tulis(async () => {
      // Hitung dampak sebelum disimpan supaya penguji tahu berapa ayat yang benar-benar baru.
      const lama = hitungSetoran((await muatSemua(studentId)).filter((r) => !r.dibatalkan).map((r) => ({ ...bentukBaris(r) })));
      const id = crypto.randomUUID();
      const dibuat = now();
      await database.query(
        `INSERT INTO tahfidz_entries (id, student_id, entry_date, kind, surah, ayah_from, ayah_to, quality, examiner, note, recorded_by_account_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [id, studentId, tanggal, sumber.kind, surat.number, dari, sampai, sumber.quality, rapi(sumber.examiner, 80), rapi(sumber.note), actor.id || null, dibuat]
      );
      const sesudah = hitungSetoran((await muatSemua(studentId)).filter((r) => !r.dibatalkan).map((r) => ({ ...bentukBaris(r) })));
      const barisBaru = sesudah.entries.find((e) => e.id === id);
      return {
        ok: true,
        value: {
          id, newAyat: barisBaru.newAyat, repeatedAyat: barisBaru.repeatedAyat, ayat: barisBaru.ayat,
          totalUnique: [...sesudah.coverage.values()].reduce((n, s) => n + s.size, 0),
          previousUnique: [...lama.coverage.values()].reduce((n, s) => n + s.size, 0),
          notice: sumber.kind === 'ziyadah' && barisBaru.repeatedAyat
            ? `${barisBaru.repeatedAyat} dari ${barisBaru.ayat} ayat sudah pernah disetor sebagai hafalan baru, jadi hanya ${barisBaru.newAyat} ayat yang menambah kemajuan.`
            : (sumber.kind === 'murajaah' ? 'Murajaah dicatat dan tidak menambah jumlah hafalan.' : '')
        }
      };
    });
  }

  async function voidEntry(studentId, entryId, input, actor) {
    if (!actor || !['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya musyrif atau admin yang membatalkan setoran.' };
    const izin = await akses(studentId, actor, 'write');
    if (!izin.ok) return izin;
    const alasan = rapi(input && input.reason);
    if (alasan.length < 5) return { ok: false, error: 'Alasan pembatalan wajib diisi (minimal 5 karakter).' };
    if (!UUID.test(String(entryId))) return { ok: false, status: 404, error: 'Setoran tidak ditemukan.' };
    return tulis(async () => {
      const { rows } = await database.query('SELECT voided_at FROM tahfidz_entries WHERE id = $1 AND student_id = $2', [entryId, studentId]);
      if (!rows.length) return { ok: false, status: 404, error: 'Setoran tidak ditemukan.' };
      if (rows[0].voided_at) return { ok: false, status: 409, error: 'Setoran ini sudah dibatalkan.' };
      await database.query('UPDATE tahfidz_entries SET voided_at = $2, voided_by_account_id = $3, void_reason = $4 WHERE id = $1', [entryId, now(), actor.id || null, alasan]);
      return { ok: true, value: { id: entryId, voided: true } };
    });
  }

  // ------------------------------------------------------------------ baca

  function ringkasBulan(hitung, murajaahHari, bulan) {
    const awalan = `${bulan}-`;
    const dalam = hitung.entries.filter((e) => e.date.startsWith(awalan));
    const murajaahBulan = new Set();
    murajaahHari.forEach((set, tanggal) => { if (tanggal.startsWith(awalan)) set.forEach((a) => murajaahBulan.add(a)); });
    return {
      month: bulan, entries: dalam.length, newAyat: dalam.reduce((n, e) => n + e.newAyat, 0),
      ziyadahEntries: dalam.filter((e) => e.kind === 'ziyadah').length, murajaahEntries: dalam.filter((e) => e.kind === 'murajaah').length,
      murajaahAyat: murajaahBulan.size, lancar: dalam.filter((e) => e.quality === 'lancar').length, perluDiulang: dalam.filter((e) => e.quality === 'ulang').length
    };
  }

  async function overview(studentId, actor, { month } = {}) {
    const izin = await akses(studentId, actor, 'view');
    if (!izin.ok) return izin;
    const bulan = month && BULAN.test(String(month)) ? String(month) : hariIni(now()).slice(0, 7);
    let baris;
    try {
      baris = await muatSemua(studentId);
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { ok: true, value: { available: false, options: opsi } };
    }
    const staf = ['admin', 'supervisor'].includes(actor.role);
    const aktif = baris.filter((r) => !r.dibatalkan).map(bentukBaris);
    const hitung = hitungSetoran(aktif);
    const murajaahHari = murajaahPerHari(aktif);
    const unik = [...hitung.coverage.values()].reduce((n, s) => n + s.size, 0);

    const perSurat = [...hitung.coverage.entries()].sort((a, b) => a[0] - b[0]).map(([nomor, set]) => ({ surah: nomor, name: SURAT[nomor - 1].name, covered: set.size, ayat: SURAT[nomor - 1].ayat, complete: set.size === SURAT[nomor - 1].ayat }));

    // Rekap harian dalam bulan terpilih dan bulanan 12 bulan terakhir.
    const hari = new Map();
    hitung.entries.filter((e) => e.date.startsWith(`${bulan}-`)).forEach((e) => {
      const h = hari.get(e.date) || { date: e.date, entries: 0, newAyat: 0, murajaahAyat: 0 };
      h.entries += 1;
      h.newAyat += e.newAyat;
      hari.set(e.date, h);
    });
    murajaahHari.forEach((set, tanggal) => { if (tanggal.startsWith(`${bulan}-`)) { const h = hari.get(tanggal) || { date: tanggal, entries: 0, newAyat: 0, murajaahAyat: 0 }; h.murajaahAyat = set.size; hari.set(tanggal, h); } });
    const bulanIni = new Date(`${hariIni(now()).slice(0, 7)}-01T00:00:00Z`);
    const bulanan = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(bulanIni.getUTCFullYear(), bulanIni.getUTCMonth() - 11 + i, 1));
      return ringkasBulan(hitung, murajaahHari, d.toISOString().slice(0, 7));
    });

    const daftar = [...hitung.entries].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 40).map((e) => {
      const asli = baris.find((r) => r.id === e.id);
      return {
        id: e.id, date: e.date, kind: e.kind, kindLabel: JENIS[e.kind], surah: e.surah, surahName: SURAT[e.surah - 1].name, ayahFrom: e.ayahFrom, ayahTo: e.ayahTo,
        quality: e.quality, qualityLabel: KUALITAS[e.quality], examiner: e.examiner, note: e.note, newAyat: e.newAyat, repeatedAyat: e.repeatedAyat,
        ...(staf ? { recordedBy: asli.recorded_by || null } : {})
      };
    });
    const dibatalkan = staf ? baris.filter((r) => r.dibatalkan).slice(-10).map((r) => ({ ...bentukBaris(r), surahName: SURAT[r.surah - 1].name, voidReason: r.void_reason, voidedBy: r.voided_by || null })) : undefined;

    return {
      ok: true,
      value: {
        available: true,
        progress: { uniqueAyat: unik, totalAyat: TOTAL_AYAT, percent: Math.round((unik / TOTAL_AYAT) * 1000) / 10, completeSurahs: perSurat.filter((s) => s.complete).length, surahs: perSurat },
        month: ringkasBulan(hitung, murajaahHari, bulan),
        daily: [...hari.values()].sort((a, b) => b.date.localeCompare(a.date)),
        monthly: bulanan,
        entries: daftar,
        ...(dibatalkan ? { voided: dibatalkan } : {}),
        options: opsi
      }
    };
  }

  // Ringkasan satu bulan untuk rapor bulanan (migrasi 068). Tanpa pemeriksaan akses: pemanggil sudah memeriksanya.
  async function monthSummary(studentId, bulan) {
    try {
      const aktif = (await muatSemua(studentId)).filter((r) => !r.dibatalkan).map(bentukBaris);
      return { available: true, ...ringkasBulan(hitungSetoran(aktif), murajaahPerHari(aktif), bulan), uniqueAyat: [...hitungSetoran(aktif).coverage.values()].reduce((n, s) => n + s.size, 0) };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { available: false, month: bulan, entries: 0, newAyat: 0, murajaahAyat: 0, uniqueAyat: 0 };
    }
  }

  return { addEntry, voidEntry, overview, monthSummary };
}

module.exports = { createTahfidzService, hitungSetoran };
