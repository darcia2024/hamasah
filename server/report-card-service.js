'use strict';

const crypto = require('node:crypto');
const { createDocumentPdf } = require('./pdf.js');

// Rapor bulanan santri (migrasi 068).
//
// Alur: musyrif menyusun (draft) -> mengajukan tinjauan (review) -> pihak yang berhak menerbitkan (published).
// Wali dan santri hanya melihat rapor yang sudah terbit; PDF hanya bila pengaturan mengizinkan.
//
// Tidak ada angka yang ditulis mati di sini: bobot indikator, batas A/B/C, target, penalti disiplin, dan siapa yang
// berhak menerbitkan dibaca dari report_card_settings (diubah admin). DEFAULT_CONFIG hanya dipakai bila barisnya belum
// ada. Setiap rapor menyimpan salinan pengaturan yang dipakai, jadi riwayat tidak berubah saat pengaturan diganti.
//
// Indikator tanpa data (misalnya absensi kegiatan belum dipakai) tidak dihitung nol: bobotnya dibagi ke indikator
// yang punya data, dan rapor menandainya "belum ada data".

const DEFAULT_CONFIG = Object.freeze({
  weights: Object.freeze({ attendance: 30, tahfidz: 35, discipline: 20, participation: 15 }),
  grades: Object.freeze({ A: 85, B: 70 }),
  tahfidzTargetAyat: 40,
  participationTarget: 4,
  disciplinePenalty: Object.freeze({ ringan: 5, sedang: 10, berat: 20 }),
  publishRoles: Object.freeze(['admin']),
  pdfEnabled: true
});

const INDIKATOR = Object.freeze({ attendance: 'Absensi kegiatan', tahfidz: 'Tahfidz', discipline: 'Kedisiplinan', participation: 'Partisipasi' });
const STATUS = Object.freeze({ draft: 'Draf', review: 'Menunggu peninjauan', published: 'Terbit' });
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk rapor bulanan. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function tabelBelumAda(error) {
  if (!error) return false;
  if (['42P01', '42703'].includes(error.code)) return true;
  return /(monthly_reports|report_card_settings)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function rapi(value, maks) {
  return String(value === undefined || value === null ? '' : value).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, maks);
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : null);
}

function labelBulan(bulan) {
  return `${NAMA_BULAN[Number(bulan.slice(5, 7)) - 1]} ${bulan.slice(0, 4)}`;
}

function rentangBulan(bulan) {
  const tahun = Number(bulan.slice(0, 4));
  const bln = Number(bulan.slice(5, 7));
  return { from: `${bulan}-01`, to: new Date(Date.UTC(tahun, bln, 0)).toISOString().slice(0, 10) };
}

// Validasi pengaturan. Mengembalikan { config } atau { error }.
function periksaConfig(input, lama) {
  const sumber = input || {};
  const config = JSON.parse(JSON.stringify(lama));
  delete config.confirmedAt;
  delete config.confirmedBy;
  const angka = (nilai, nama, min, maks) => {
    const n = Number(nilai);
    if (!Number.isFinite(n) || n < min || n > maks) throw new Error(`${nama} harus angka ${min} sampai ${maks}.`);
    return n;
  };
  try {
    if (sumber.weights !== undefined) {
      const w = {};
      for (const kunci of Object.keys(INDIKATOR)) w[kunci] = angka(sumber.weights && sumber.weights[kunci], `Bobot ${INDIKATOR[kunci]}`, 0, 100);
      if (Math.round(Object.values(w).reduce((a, b) => a + b, 0) * 100) / 100 !== 100) throw new Error('Jumlah bobot semua indikator harus tepat 100.');
      config.weights = w;
    }
    if (sumber.grades !== undefined) {
      const a = angka(sumber.grades && sumber.grades.A, 'Batas nilai A', 1, 100);
      const b = angka(sumber.grades && sumber.grades.B, 'Batas nilai B', 1, 100);
      if (!(a > b)) throw new Error('Batas A harus lebih tinggi dari batas B.');
      config.grades = { A: a, B: b };
    }
    if (sumber.tahfidzTargetAyat !== undefined) config.tahfidzTargetAyat = angka(sumber.tahfidzTargetAyat, 'Target ayat tahfidz per bulan', 1, 6236);
    if (sumber.participationTarget !== undefined) config.participationTarget = angka(sumber.participationTarget, 'Target partisipasi per bulan', 1, 100);
    if (sumber.disciplinePenalty !== undefined) {
      const p = {};
      for (const tingkat of ['ringan', 'sedang', 'berat']) p[tingkat] = angka(sumber.disciplinePenalty && sumber.disciplinePenalty[tingkat], `Pengurang nilai ${tingkat}`, 0, 100);
      config.disciplinePenalty = p;
    }
    if (sumber.publishRoles !== undefined) {
      const peran = Array.isArray(sumber.publishRoles) ? [...new Set(sumber.publishRoles)] : [];
      if (!peran.length || peran.some((r) => !['admin', 'supervisor'].includes(r))) throw new Error('Penerbit rapor harus admin dan/atau musyrif, minimal satu.');
      if (!peran.includes('admin')) throw new Error('Admin harus tetap menjadi salah satu penerbit rapor.');
      config.publishRoles = peran;
    }
    if (sumber.pdfEnabled !== undefined) config.pdfEnabled = Boolean(sumber.pdfEnabled);
  } catch (error) {
    return { error: error.message };
  }
  return { config };
}

function nilaiHuruf(skor, grades) {
  if (skor === null) return null;
  return skor >= grades.A ? 'A' : skor >= grades.B ? 'B' : 'C';
}

function createReportCardService({ database, accessFor, staffDormitories, activityAttendance, tahfidz, now = () => new Date() } = {}) {
  if (!database || typeof accessFor !== 'function' || typeof staffDormitories !== 'function') throw new Error('createReportCardService membutuhkan database, accessFor, dan staffDormitories.');

  async function tulis(fn) {
    try { return await fn(); } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  const staf = (actor) => Boolean(actor && ['admin', 'supervisor'].includes(actor.role));

  async function akses(studentId, actor, perlu) {
    if (!actor || !UUID.test(String(studentId))) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    const hasil = await accessFor(studentId, actor);
    if (!hasil.exists) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    if (!hasil[perlu]) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
    return { ok: true };
  }

  async function muatConfig() {
    try {
      const { rows } = await database.query('SELECT config FROM report_card_settings WHERE id = 1');
      return { available: true, config: { ...DEFAULT_CONFIG, ...(rows[0] ? rows[0].config : {}) } };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { available: false, config: { ...DEFAULT_CONFIG } };
    }
  }

  // ------------------------------------------------------------------ pengaturan

  async function getSettings(actor) {
    if (!staf(actor)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif.' };
    const { available, config } = await muatConfig();
    return { ok: true, value: { available, config, indicators: Object.entries(INDIKATOR).map(([id, label]) => ({ id, label })), canEdit: actor.role === 'admin' } };
  }

  async function updateSettings(input, actor) {
    if (!actor || actor.role !== 'admin') return { ok: false, status: 403, error: 'Hanya admin yang mengubah pengaturan rapor.' };
    return tulis(async () => {
      const { config: lama } = await muatConfig();
      const hasil = periksaConfig(input, lama);
      if (hasil.error) return { ok: false, error: hasil.error };
      // Menyimpan atau mengonfirmasi pengaturan = admin sudah memeriksanya; rapor baru boleh terbit sesudahnya.
      hasil.config.confirmedAt = now().toISOString();
      hasil.config.confirmedBy = actor.name || actor.id || null;
      await database.query(
        `INSERT INTO report_card_settings (id, config, updated_by_account_id, updated_at) VALUES (1, $1::jsonb, $2, $3)
         ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_by_account_id = EXCLUDED.updated_by_account_id, updated_at = EXCLUDED.updated_at`,
        [JSON.stringify(hasil.config), actor.id || null, now()]
      );
      return { ok: true, value: { available: true, config: hasil.config } };
    });
  }

  // ------------------------------------------------------------------ penghitungan

  async function hitungIndikator(studentId, bulan, config) {
    const { from, to } = rentangBulan(bulan);
    const hitung = async (tabel) => Number((await database.query(`SELECT count(*) AS n FROM ${tabel} WHERE student_id = $1 AND occurred_at >= $2::date AND occurred_at < ($3::date + 1)`, [studentId, from, to])).rows[0].n);
    let absensi = activityAttendance ? await activityAttendance.studentSummary(studentId, from, to) : null;
    if (absensi) absensi = { ...absensi, source: 'kegiatan' };
    // Sistem absensi kegiatan belum dipakai pada bulan ini: pakai presensi harian asrama (sistem lama) supaya bulan-bulan
    // sebelumnya tidak kosong. Sumbernya ditandai di rapor.
    if (!absensi || absensi.hadir + absensi.izin + absensi.sakit + absensi.alpa + absensi.belum === 0) {
      const lama = await database.query(`SELECT status, count(*) AS n FROM student_attendance WHERE student_id = $1 AND occurred_at >= $2::date AND occurred_at < ($3::date + 1) GROUP BY status`, [studentId, from, to]);
      const n = (s) => lama.rows.filter((r) => s.includes(r.status)).reduce((j, r) => j + Number(r.n), 0);
      const hadir = n(['present', 'late']);
      const alpa = n(['absent']);
      if (hadir + alpa + n(['excused'])) absensi = { hadir, izin: n(['excused']), sakit: 0, alpa, belum: 0, rate: hadir + alpa ? Math.round((hadir / (hadir + alpa)) * 100) : null, source: 'presensi-asrama' };
    }
    const setoran = tahfidz ? await tahfidz.monthSummary(studentId, bulan) : null;
    const pelanggaran = (await database.query(`SELECT level, count(*) AS n FROM student_violations WHERE student_id = $1 AND occurred_at >= $2::date AND occurred_at < ($3::date + 1) GROUP BY level`, [studentId, from, to])).rows;
    const kegiatan = await hitung('student_activities');
    const prestasi = await hitung('student_achievements');

    const penalti = pelanggaran.reduce((jumlah, r) => jumlah + Number(r.n) * (config.disciplinePenalty[r.level] === undefined ? config.disciplinePenalty.ringan : config.disciplinePenalty[r.level]), 0);
    const sudahPakaiTahfidz = setoran && setoran.available && (setoran.entries > 0 || setoran.uniqueAyat > 0);
    const skor = {
      attendance: absensi && absensi.rate !== null ? absensi.rate : null,
      tahfidz: sudahPakaiTahfidz ? Math.min(100, Math.round((setoran.newAyat / config.tahfidzTargetAyat) * 100)) : null,
      discipline: Math.max(0, 100 - penalti),
      participation: config.participationTarget > 0 ? Math.min(100, Math.round(((kegiatan + prestasi) / config.participationTarget) * 100)) : null
    };
    return {
      raw: {
        attendance: absensi,
        tahfidz: setoran && setoran.available ? { newAyat: setoran.newAyat, murajaahAyat: setoran.murajaahAyat, entries: setoran.entries, uniqueAyat: setoran.uniqueAyat, lancar: setoran.lancar, perluDiulang: setoran.perluDiulang } : null,
        discipline: { violations: pelanggaran.reduce((n, r) => n + Number(r.n), 0), byLevel: Object.fromEntries(pelanggaran.map((r) => [r.level, Number(r.n)])), penalty: penalti },
        participation: { activities: kegiatan, achievements: prestasi }
      },
      scores: skor
    };
  }

  function totalSkor(skor, weights) {
    const ada = Object.keys(INDIKATOR).filter((k) => skor[k] !== null);
    const bobot = ada.reduce((n, k) => n + weights[k], 0);
    if (!ada.length || bobot <= 0) return null;
    return Math.round(ada.reduce((n, k) => n + skor[k] * weights[k], 0) / bobot);
  }

  async function bangunSnapshot(studentId, bulan, config) {
    const { raw, scores } = await hitungIndikator(studentId, bulan, config);
    const total = totalSkor(scores, config.weights);
    return {
      month: bulan, raw, scores, total, grade: nilaiHuruf(total, config.grades),
      missing: Object.keys(INDIKATOR).filter((k) => scores[k] === null),
      config: { weights: config.weights, grades: config.grades, tahfidzTargetAyat: config.tahfidzTargetAyat, participationTarget: config.participationTarget, disciplinePenalty: config.disciplinePenalty }
    };
  }

  // ------------------------------------------------------------------ rapor

  function bentuk(row, { internal }) {
    const snap = row.snapshot || {};
    const dasar = {
      id: row.id, studentId: row.student_id, month: row.month, monthLabel: labelBulan(row.month), status: row.status, statusLabel: STATUS[row.status],
      total: snap.total === undefined ? null : snap.total, grade: snap.grade || null, scores: snap.scores || {}, raw: snap.raw || {}, missing: snap.missing || [],
      weights: snap.config ? snap.config.weights : null, grades: snap.config ? snap.config.grades : null,
      note: row.musyrif_note || '', recommendation: row.recommendation || '', publishedAt: iso(row.published_at)
    };
    if (!internal) return dasar;
    return { ...dasar, generatedAt: iso(row.generated_at), generatedBy: row.generated_by || null, submittedAt: iso(row.submitted_at), submittedBy: row.submitted_by || null, publishedBy: row.published_by || null };
  }

  const SELECT = `SELECT r.*, g.name AS generated_by, s.name AS submitted_by, p.name AS published_by FROM monthly_reports r
      LEFT JOIN accounts g ON g.id = r.generated_by_account_id LEFT JOIN accounts s ON s.id = r.submitted_by_account_id LEFT JOIN accounts p ON p.id = r.published_by_account_id`;

  async function ambilRow(studentId, bulan) {
    const { rows } = await database.query(`${SELECT} WHERE r.student_id = $1 AND r.month = $2`, [studentId, bulan]);
    return rows[0] || null;
  }

  async function compose(studentId, bulan, actor) {
    if (!staf(actor)) return { ok: false, status: 403, error: 'Rapor disusun oleh musyrif atau admin.' };
    if (!BULAN.test(String(bulan))) return { ok: false, error: 'Bulan memakai format YYYY-MM.' };
    const izin = await akses(studentId, actor, 'write');
    if (!izin.ok) return izin;
    if (bulan > now().toISOString().slice(0, 7)) return { ok: false, error: 'Rapor belum bisa disusun untuk bulan yang belum berjalan.' };
    return tulis(async () => {
      const lama = await ambilRow(studentId, bulan);
      if (lama && lama.status === 'published') return { ok: false, status: 409, error: 'Rapor ini sudah terbit. Tarik kembali dulu bila ingin menyusun ulang.' };
      const { config } = await muatConfig();
      const snapshot = await bangunSnapshot(studentId, bulan, config);
      if (lama) {
        // Menyusun ulang mengembalikan rapor ke draf: tinjauan sebelumnya tidak berlaku untuk angka yang berbeda.
        await database.query(`UPDATE monthly_reports SET snapshot = $2::jsonb, status = 'draft', generated_by_account_id = $3, generated_at = $4, submitted_by_account_id = NULL, submitted_at = NULL WHERE id = $1`, [lama.id, JSON.stringify(snapshot), actor.id || null, now()]);
      } else {
        await database.query('INSERT INTO monthly_reports (id, student_id, month, snapshot, generated_by_account_id, generated_at) VALUES ($1, $2, $3, $4::jsonb, $5, $6)', [crypto.randomUUID(), studentId, bulan, JSON.stringify(snapshot), actor.id || null, now()]);
      }
      return { ok: true, value: bentuk(await ambilRow(studentId, bulan), { internal: true }) };
    });
  }

  async function update(studentId, bulan, input, actor) {
    if (!staf(actor)) return { ok: false, status: 403, error: 'Rapor diubah oleh musyrif atau admin.' };
    const izin = await akses(studentId, actor, 'write');
    if (!izin.ok) return izin;
    const sumber = input || {};
    return tulis(async () => {
      const row = BULAN.test(String(bulan)) ? await ambilRow(studentId, bulan) : null;
      if (!row) return { ok: false, status: 404, error: 'Rapor bulan ini belum disusun.' };
      if (row.status === 'published') return { ok: false, status: 409, error: 'Rapor yang sudah terbit tidak bisa diubah. Tarik kembali dulu.' };
      const catatan = sumber.note === undefined ? row.musyrif_note : rapi(sumber.note, 2000);
      const rekomendasi = sumber.recommendation === undefined ? row.recommendation : rapi(sumber.recommendation, 1000);
      let status = row.status;
      let diajukan = [row.submitted_by_account_id, row.submitted_at];
      if (sumber.status !== undefined) {
        if (!['draft', 'review'].includes(sumber.status)) return { ok: false, error: 'Status hanya draft atau review. Penerbitan lewat tombol terbitkan.' };
        if (sumber.status === 'review') {
          if (catatan.length < 10) return { ok: false, error: 'Tulis catatan musyrif (minimal 10 karakter) sebelum diajukan untuk ditinjau.' };
          if (!rekomendasi) return { ok: false, error: 'Tulis rekomendasi pembinaan sebelum diajukan untuk ditinjau.' };
          diajukan = [actor.id || null, now()];
        } else {
          diajukan = [null, null];
        }
        status = sumber.status;
      }
      await database.query('UPDATE monthly_reports SET musyrif_note = $2, recommendation = $3, status = $4, submitted_by_account_id = $5, submitted_at = $6 WHERE id = $1', [row.id, catatan, rekomendasi, status, diajukan[0], diajukan[1]]);
      return { ok: true, value: bentuk(await ambilRow(studentId, bulan), { internal: true }) };
    });
  }

  async function publish(studentId, bulan, input, actor) {
    if (!staf(actor)) return { ok: false, status: 403, error: 'Hanya pihak berwenang yang menerbitkan rapor.' };
    const izin = await akses(studentId, actor, 'write');
    if (!izin.ok) return izin;
    const tarik = Boolean(input && input.retract);
    return tulis(async () => {
      const { config } = await muatConfig();
      if (!config.publishRoles.includes(actor.role)) return { ok: false, status: 403, error: 'Peran Anda belum diberi wewenang menerbitkan rapor. Hubungi admin.' };
      if (!tarik && !config.confirmedAt) return { ok: false, status: 409, error: 'Pengaturan penilaian rapor (bobot dan batas A/B/C) belum dikonfirmasi admin. Admin perlu memeriksanya di tab Pengaturan dan menyimpannya lebih dulu.' };
      const row = BULAN.test(String(bulan)) ? await ambilRow(studentId, bulan) : null;
      if (!row) return { ok: false, status: 404, error: 'Rapor bulan ini belum disusun.' };
      if (tarik) {
        if (row.status !== 'published') return { ok: false, status: 409, error: 'Rapor ini belum terbit.' };
        await database.query(`UPDATE monthly_reports SET status = 'review', published_by_account_id = NULL, published_at = NULL WHERE id = $1`, [row.id]);
      } else {
        if (row.status !== 'review') return { ok: false, status: 409, error: row.status === 'published' ? 'Rapor ini sudah terbit.' : 'Rapor harus diajukan untuk ditinjau sebelum diterbitkan.' };
        await database.query(`UPDATE monthly_reports SET status = 'published', published_by_account_id = $2, published_at = $3 WHERE id = $1`, [row.id, actor.id || null, now()]);
      }
      return { ok: true, value: bentuk(await ambilRow(studentId, bulan), { internal: true }) };
    });
  }

  // Keluarga hanya melihat rapor terbit, beserta tren nilai antar bulan.
  async function list(studentId, actor) {
    const izin = await akses(studentId, actor, 'view');
    if (!izin.ok) return izin;
    const internal = staf(actor);
    let rows;
    try {
      rows = (await database.query(`${SELECT} WHERE r.student_id = $1 AND ($2::boolean OR r.status = 'published') ORDER BY r.month DESC LIMIT 36`, [studentId, internal])).rows;
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { ok: true, value: { available: false, items: [], trend: [] } };
    }
    const { config } = await muatConfig();
    const items = rows.map((row) => bentuk(row, { internal }));
    const trend = rows.filter((r) => r.status === 'published').map((r) => ({ month: r.month, label: labelBulan(r.month), total: (r.snapshot || {}).total === undefined ? null : r.snapshot.total, grade: (r.snapshot || {}).grade || null })).reverse();
    return { ok: true, value: { available: true, items, trend, pdfEnabled: Boolean(config.pdfEnabled) || internal, canPublish: internal && config.publishRoles.includes(actor.role) } };
  }

  // Daftar santri dalam cakupan musyrif/admin beserta status rapor bulan itu, untuk layar kerja musyrif.
  async function monthOverview(bulan, actor) {
    if (!staf(actor)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif.' };
    if (!BULAN.test(String(bulan))) return { ok: false, error: 'Bulan memakai format YYYY-MM.' };
    const batas = actor.role === 'admin' ? null : (await staffDormitories(actor.id)) || [];
    try {
      const { rows } = await database.query(
        `SELECT st.id, st.name, d.name AS dormitory_name, r.status, r.snapshot->>'grade' AS grade, r.snapshot->>'total' AS total
           FROM students st LEFT JOIN dormitories d ON d.id = st.dormitory_id LEFT JOIN monthly_reports r ON r.student_id = st.id AND r.month = $1
          WHERE st.status = 'active' AND ($2::uuid[] IS NULL OR st.dormitory_id = ANY($2::uuid[])) ORDER BY d.name NULLS LAST, st.name`, [bulan, batas]
      );
      const { config } = await muatConfig();
      return { ok: true, value: { available: true, month: bulan, monthLabel: labelBulan(bulan), canPublish: config.publishRoles.includes(actor.role), items: rows.map((row) => ({ studentId: row.id, name: row.name, dormitoryName: row.dormitory_name || null, status: row.status || null, statusLabel: row.status ? STATUS[row.status] : 'Belum disusun', grade: row.grade || null, total: row.total === null || row.total === undefined ? null : Number(row.total) })) } };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { ok: true, value: { available: false, month: bulan, items: [] } };
    }
  }

  // ------------------------------------------------------------------ PDF

  async function pdf(studentId, bulan, actor) {
    const izin = await akses(studentId, actor, 'view');
    if (!izin.ok) return izin;
    if (!BULAN.test(String(bulan))) return { ok: false, error: 'Bulan memakai format YYYY-MM.' };
    const internal = staf(actor);
    return tulis(async () => {
      const row = await ambilRow(studentId, bulan);
      if (!row || (!internal && row.status !== 'published')) return { ok: false, status: 404, error: 'Rapor belum tersedia.' };
      const { config } = await muatConfig();
      if (!internal && !config.pdfEnabled) return { ok: false, status: 403, error: 'Unduhan PDF rapor belum diaktifkan oleh Hamasah.' };
      const siswa = (await database.query('SELECT st.name, st.program, d.name AS dormitory_name FROM students st LEFT JOIN dormitories d ON d.id = st.dormitory_id WHERE st.id = $1', [studentId])).rows[0];
      const r = bentuk(row, { internal: false });
      const blok = [
        { kind: 'title', text: `Rapor Bulanan ${r.monthLabel}` },
        { kind: 'subtitle', text: [siswa.name, siswa.program, siswa.dormitory_name].filter(Boolean).join(' · ') },
        ...(r.status === 'published' ? [] : [{ kind: 'muted', text: 'DRAF: belum diterbitkan dan belum terlihat oleh wali.' }]),
        { kind: 'rule' },
        { kind: 'heading', text: 'Nilai keseluruhan' },
        { kind: 'text', text: r.total === null ? 'Belum ada data yang cukup untuk dinilai.' : `Nilai ${r.total} · Kategori ${r.grade}` },
        { kind: 'muted', text: r.grades ? `Kategori A mulai ${r.grades.A}, B mulai ${r.grades.B}, di bawahnya C.` : '' },
        { kind: 'heading', text: 'Rincian indikator' }
      ];
      for (const [kunci, label] of Object.entries(INDIKATOR)) {
        const skor = r.scores[kunci];
        blok.push({ kind: 'item', text: `${label}: ${skor === null || skor === undefined ? 'belum ada data' : skor}${r.weights ? ` (bobot ${r.weights[kunci]}%)` : ''}` });
      }
      const a = r.raw.attendance;
      if (a) blok.push({ kind: 'muted', text: `Absensi (${a.source === 'presensi-asrama' ? 'presensi harian asrama' : 'absensi kegiatan'}): hadir ${a.hadir}, izin ${a.izin}, sakit ${a.sakit}, tidak hadir ${a.alpa}, belum dicatat ${a.belum}.` });
      const t = r.raw.tahfidz;
      if (t) blok.push({ kind: 'muted', text: `Tahfidz: ${t.newAyat} ayat hafalan baru, ${t.murajaahAyat} ayat murajaah, ${t.entries} setoran.` });
      if (r.raw.discipline) blok.push({ kind: 'muted', text: `Kedisiplinan: ${r.raw.discipline.violations} catatan.` });
      if (r.raw.participation) blok.push({ kind: 'muted', text: `Partisipasi: ${r.raw.participation.activities} kegiatan dan ${r.raw.participation.achievements} prestasi tercatat.` });
      blok.push({ kind: 'heading', text: 'Catatan musyrif' }, { kind: 'text', text: r.note || '-' }, { kind: 'heading', text: 'Rekomendasi pembinaan' }, { kind: 'text', text: r.recommendation || '-' });
      return { ok: true, value: { buffer: createDocumentPdf({ blocks: blok, footer: `Rapor ${r.monthLabel} · ${siswa.name}` }), fileName: `rapor-${bulan}.pdf` } };
    });
  }

  return { getSettings, updateSettings, compose, update, publish, list, monthOverview, pdf };
}

module.exports = { createReportCardService, DEFAULT_CONFIG, periksaConfig };
