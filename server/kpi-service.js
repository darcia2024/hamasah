'use strict';

const crypto = require('node:crypto');

// KPI musyrif dan musyrifah (migrasi 071).
//
// Indikator dapat dikonfigurasi (bobot, jenis sumber, aktif atau tidak). Tiap bulan, admin menghitung penilaian dari data
// sistem (pelaksanaan kegiatan yang dipegang, kelengkapan absensi, tiket tindak lanjut, pekerjaan tambahan yang sudah
// diverifikasi), menyesuaikan nilai satu per satu dengan komentar bila perlu, lalu memfinalkan. Rekap tahunan memakai
// penilaian yang sudah final. Indikator tanpa data tidak dihitung nol: bobotnya dibagi ke indikator yang punya data.
//
// ATURAN KELUHAN WALI: keluhan yang belum diverifikasi TIDAK PERNAH memengaruhi KPI. Hanya keluhan yang diverifikasi admin dan
// ditautkan ke musyrif tertentu yang dihitung, lewat indikator "keluhan-terverifikasi" (nonaktif secara bawaan).

const SUMBER = Object.freeze({
  kegiatan: 'Pelaksanaan kegiatan yang dipegang', 'absensi-terisi': 'Kelengkapan absensi', tiket: 'Tiket tindak lanjut tepat waktu',
  'pekerjaan-tambahan': 'Pekerjaan tambahan terverifikasi', 'keluhan-terverifikasi': 'Keluhan wali terverifikasi', manual: 'Nilai manual penilai'
});
const JENIS_KERJA = Object.freeze({ 'santri-sakit': 'Mengurus santri sakit', pengadaan: 'Pengadaan kebutuhan', institusi: 'Pengurusan institusi', kegiatan: 'Kegiatan tambahan', lainnya: 'Lainnya' });
const BAWAAN = Object.freeze({ grades: Object.freeze({ A: 85, B: 70 }), extraWorkTarget: 2, complaintPenalty: 20, rewardEnabled: false, confirmedAt: null });
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk KPI musyrif. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

function tabelBelumAda(error) {
  if (!error) return false;
  if (['42P01', '42703'].includes(error.code)) return true;
  return /kpi_/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function rapi(value, maks) {
  return String(value === undefined || value === null ? '' : value).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, maks);
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : null);
}

function rentang(bulan) {
  return { from: `${bulan}-01`, to: new Date(Date.UTC(Number(bulan.slice(0, 4)), Number(bulan.slice(5, 7)), 0)).toISOString().slice(0, 10) };
}

function tanggalValid(teks) {
  if (!TANGGAL.test(String(teks || ''))) return false;
  const d = new Date(`${teks}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === teks;
}

function huruf(skor, grades) {
  return skor === null ? null : skor >= grades.A ? 'A' : skor >= grades.B ? 'B' : 'C';
}

function createKpiService({ database, now = () => new Date() } = {}) {
  if (!database) throw new Error('createKpiService membutuhkan database.');

  async function tulis(fn) {
    try { return await fn(); } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  const admin = (actor) => Boolean(actor && actor.role === 'admin');
  const musyrif = (actor) => Boolean(actor && actor.role === 'supervisor');
  const hariIni = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now());
  const TOLAK_ADMIN = { ok: false, status: 403, error: 'Hanya admin yang mengelola KPI.' };
  const TOLAK_MUSYRIF = { ok: false, status: 403, error: 'Fitur ini untuk musyrif dan musyrifah.' };

  async function muatConfig() {
    try {
      const { rows } = await database.query('SELECT config FROM kpi_settings WHERE id = 1');
      return { available: true, config: { ...BAWAAN, ...(rows[0] ? rows[0].config : {}) } };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { available: false, config: { ...BAWAAN } };
    }
  }

  // ------------------------------------------------------------------ pengaturan dan indikator

  function bentukIndikator(row) {
    return { id: row.id, code: row.code, name: row.name, description: row.description || '', source: row.source, sourceLabel: SUMBER[row.source], activityTypeId: row.activity_type_id || null, activityTypeName: row.activity_type_name || null, weight: Number(row.weight), active: Boolean(row.active) };
  }

  async function muatIndikator(hanyaAktif = false) {
    const { rows } = await database.query(
      `SELECT i.*, t.name AS activity_type_name FROM kpi_indicators i LEFT JOIN activity_types t ON t.id = i.activity_type_id ${hanyaAktif ? 'WHERE i.active' : ''} ORDER BY i.active DESC, i.sort_order, i.name`
    );
    return rows;
  }

  async function getSettings(actor) {
    if (!admin(actor)) return TOLAK_ADMIN;
    try {
      const { available, config } = await muatConfig();
      const indikator = (await muatIndikator()).map(bentukIndikator);
      const jenisKegiatan = (await database.query('SELECT id, name FROM activity_types WHERE active ORDER BY name').catch(() => ({ rows: [] }))).rows;
      return { ok: true, value: { available, config, indicators: indikator, totalWeight: indikator.filter((i) => i.active).reduce((n, i) => n + i.weight, 0), sources: Object.entries(SUMBER).map(([id, label]) => ({ id, label })), activityTypes: jenisKegiatan, workKinds: Object.entries(JENIS_KERJA).map(([id, label]) => ({ id, label })) } };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { ok: true, value: { available: false, config: { ...BAWAAN }, indicators: [], totalWeight: 0, sources: [], activityTypes: [], workKinds: [] } };
    }
  }

  async function updateSettings(input, actor) {
    if (!admin(actor)) return TOLAK_ADMIN;
    const sumber = input || {};
    return tulis(async () => {
      const { config: lama } = await muatConfig();
      const config = { ...lama };
      const angka = (v, nama, min, maks) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > maks) throw new Error(`${nama} harus angka ${min} sampai ${maks}.`); return n; };
      try {
        if (sumber.grades !== undefined) {
          const a = angka(sumber.grades && sumber.grades.A, 'Batas nilai A', 1, 100);
          const b = angka(sumber.grades && sumber.grades.B, 'Batas nilai B', 1, 100);
          if (!(a > b)) throw new Error('Batas A harus lebih tinggi dari batas B.');
          config.grades = { A: a, B: b };
        }
        if (sumber.extraWorkTarget !== undefined) config.extraWorkTarget = angka(sumber.extraWorkTarget, 'Target pekerjaan tambahan per bulan', 1, 100);
        if (sumber.complaintPenalty !== undefined) config.complaintPenalty = angka(sumber.complaintPenalty, 'Pengurang nilai per keluhan terverifikasi', 0, 100);
        if (sumber.rewardEnabled !== undefined) config.rewardEnabled = Boolean(sumber.rewardEnabled);
      } catch (error) {
        return { ok: false, error: error.message };
      }
      // Menyimpan atau mengonfirmasi = admin sudah memeriksa pengaturan dan bobot indikator; penilaian baru boleh difinalkan.
      config.confirmedAt = now().toISOString();
      await database.query(
        `INSERT INTO kpi_settings (id, config, updated_by_account_id, updated_at) VALUES (1, $1::jsonb, $2, $3)
         ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_by_account_id = EXCLUDED.updated_by_account_id, updated_at = EXCLUDED.updated_at`,
        [JSON.stringify(config), actor.id || null, now()]
      );
      return { ok: true, value: { config } };
    });
  }

  async function createIndicator(input, actor) {
    if (!admin(actor)) return TOLAK_ADMIN;
    const sumber = input || {};
    const nama = rapi(sumber.name, 120);
    if (nama.length < 3) return { ok: false, error: 'Nama indikator 3 sampai 120 karakter.' };
    if (!SUMBER[sumber.source]) return { ok: false, error: 'Pilih sumber penilaian indikator.' };
    const bobot = Number(sumber.weight === undefined ? 10 : sumber.weight);
    if (!Number.isFinite(bobot) || bobot < 0 || bobot > 100) return { ok: false, error: 'Bobot harus angka 0 sampai 100.' };
    const code = nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    if (code.length < 3) return { ok: false, error: 'Nama indikator belum valid.' };
    const tipe = sumber.activityTypeId ? (UUID.test(String(sumber.activityTypeId)) ? sumber.activityTypeId : false) : null;
    if (tipe === false || (tipe && sumber.source !== 'kegiatan')) return { ok: false, error: 'Jenis kegiatan hanya untuk indikator pelaksanaan kegiatan.' };
    return tulis(async () => {
      const ada = await database.query('SELECT 1 FROM kpi_indicators WHERE code = $1 OR lower(name) = lower($2)', [code, nama]);
      if (ada.rows.length) return { ok: false, status: 409, error: 'Indikator dengan nama itu sudah ada.' };
      const { rows } = await database.query(
        'INSERT INTO kpi_indicators (id, code, name, description, source, activity_type_id, weight, active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [crypto.randomUUID(), code, nama, rapi(sumber.description, 300), sumber.source, tipe, bobot, sumber.active === undefined ? true : Boolean(sumber.active)]
      );
      return { ok: true, value: bentukIndikator(rows[0]) };
    });
  }

  async function updateIndicator(id, input, actor) {
    if (!admin(actor)) return TOLAK_ADMIN;
    if (!UUID.test(String(id))) return { ok: false, status: 404, error: 'Indikator tidak ditemukan.' };
    const sumber = input || {};
    return tulis(async () => {
      const { rows } = await database.query('SELECT * FROM kpi_indicators WHERE id = $1', [id]);
      if (!rows.length) return { ok: false, status: 404, error: 'Indikator tidak ditemukan.' };
      const nama = sumber.name === undefined ? rows[0].name : rapi(sumber.name, 120);
      if (nama.length < 3) return { ok: false, error: 'Nama indikator 3 sampai 120 karakter.' };
      const bobot = sumber.weight === undefined ? Number(rows[0].weight) : Number(sumber.weight);
      if (!Number.isFinite(bobot) || bobot < 0 || bobot > 100) return { ok: false, error: 'Bobot harus angka 0 sampai 100.' };
      const tipe = sumber.activityTypeId === undefined ? rows[0].activity_type_id : (sumber.activityTypeId ? (UUID.test(String(sumber.activityTypeId)) ? sumber.activityTypeId : false) : null);
      if (tipe === false) return { ok: false, error: 'Jenis kegiatan tidak valid.' };
      const baru = await database.query(
        'UPDATE kpi_indicators SET name = $2, description = $3, weight = $4, active = $5, activity_type_id = $6 WHERE id = $1 RETURNING *',
        [id, nama, sumber.description === undefined ? rows[0].description : rapi(sumber.description, 300), bobot, sumber.active === undefined ? rows[0].active : Boolean(sumber.active), tipe]
      );
      return { ok: true, value: bentukIndikator(baru.rows[0]) };
    });
  }

  async function listMusyrif(actor) {
    if (!admin(actor)) return TOLAK_ADMIN;
    const { rows } = await database.query(
      `SELECT a.id, a.name, COALESCE(string_agg(d.name, ', ' ORDER BY d.name), '') AS dormitories FROM accounts a
         LEFT JOIN staff_dormitory_assignments sd ON sd.account_id = a.id LEFT JOIN dormitories d ON d.id = sd.dormitory_id
        WHERE a.role = 'supervisor' AND a.active GROUP BY a.id, a.name ORDER BY a.name`
    );
    return { ok: true, value: { items: rows.map((r) => ({ id: r.id, name: r.name, dormitories: r.dormitories })) } };
  }

  // ------------------------------------------------------------------ penghitungan otomatis

  async function hitungOtomatis(indikator, musyrifId, bulan, config) {
    const { from, to } = rentang(bulan);
    const tanya = async (sql, params) => { try { return (await database.query(sql, params)).rows; } catch (error) { if (tabelBelumAda(error)) return null; throw error; } };
    if (indikator.source === 'kegiatan') {
      const rows = await tanya(
        `SELECT status, count(*)::int AS n FROM activity_sessions
          WHERE staff_account_id = $1 AND session_date BETWEEN $2::date AND $3::date AND status <> 'dibatalkan'
            AND ($4::uuid IS NULL OR type_id = $4::uuid) AND (status <> 'terjadwal' OR session_date < $5::date) GROUP BY status`,
        [musyrifId, from, to, indikator.activity_type_id || null, hariIni()]
      );
      if (!rows) return { score: null, detail: 'Data kegiatan belum tersedia.' };
      const n = (s) => rows.filter((r) => r.status === s).reduce((j, r) => j + r.n, 0);
      const total = n('terlaksana') + n('tidak-terlaksana') + n('terjadwal');
      return total ? { score: Math.round((n('terlaksana') / total) * 100), detail: `${n('terlaksana')} dari ${total} kegiatan terlaksana${n('tidak-terlaksana') ? `, ${n('tidak-terlaksana')} tidak terlaksana` : ''}${n('terjadwal') ? `, ${n('terjadwal')} belum ditandai` : ''}.` } : { score: null, detail: 'Tidak ada kegiatan yang dipegang bulan ini.' };
    }
    if (indikator.source === 'absensi-terisi') {
      const rows = await tanya(
        `SELECT s.id, (SELECT count(*) FROM students st WHERE st.status = 'active' AND (s.group_kind = 'semua' OR st.dormitory_id = s.dormitory_id))::int AS peserta,
                (SELECT count(*) FROM activity_attendance a WHERE a.session_id = s.id)::int AS tercatat
           FROM activity_sessions s WHERE s.staff_account_id = $1 AND s.status = 'terlaksana' AND s.session_date BETWEEN $2::date AND $3::date`, [musyrifId, from, to]
      );
      if (!rows) return { score: null, detail: 'Data absensi belum tersedia.' };
      const layak = rows.filter((r) => r.peserta > 0);
      if (!layak.length) return { score: null, detail: 'Tidak ada kegiatan terlaksana yang perlu absensi.' };
      const rata = layak.reduce((n, r) => n + Math.min(1, r.tercatat / r.peserta), 0) / layak.length;
      return { score: Math.round(rata * 100), detail: `Rata-rata ${Math.round(rata * 100)}% peserta tercatat pada ${layak.length} kegiatan.` };
    }
    if (indikator.source === 'tiket') {
      const rows = await tanya(
        `SELECT status, due_on, resolved_at FROM student_cases WHERE assignee_account_id = $1
            AND ((due_on BETWEEN $2::date AND $3::date) OR (resolved_at >= $2::date AND resolved_at < ($3::date + 1)))`, [musyrifId, from, to]
      );
      if (!rows) return { score: null, detail: 'Data tiket belum tersedia.' };
      if (!rows.length) return { score: null, detail: 'Tidak ada tiket yang ditugaskan bulan ini.' };
      const tepat = rows.filter((r) => r.status === 'selesai' && r.resolved_at && (!r.due_on || new Date(r.resolved_at).toISOString().slice(0, 10) <= new Date(r.due_on).toISOString().slice(0, 10))).length;
      return { score: Math.round((tepat / rows.length) * 100), detail: `${tepat} dari ${rows.length} tiket selesai tepat waktu.` };
    }
    if (indikator.source === 'pekerjaan-tambahan') {
      const rows = await tanya(`SELECT count(*)::int AS n FROM kpi_extra_work WHERE musyrif_account_id = $1 AND status = 'diverifikasi' AND work_date BETWEEN $2::date AND $3::date`, [musyrifId, from, to]);
      const n = rows ? rows[0].n : 0;
      return n ? { score: Math.min(100, Math.round((n / config.extraWorkTarget) * 100)), detail: `${n} pekerjaan tambahan terverifikasi (target ${config.extraWorkTarget}).` } : { score: null, detail: 'Belum ada pekerjaan tambahan terverifikasi (bonus; tidak mengurangi).' };
    }
    if (indikator.source === 'keluhan-terverifikasi') {
      // Hanya keluhan yang diverifikasi admin dan ditautkan ke musyrif ini. Keluhan belum diverifikasi tidak pernah terhitung.
      const rows = await tanya(`SELECT count(*)::int AS n FROM parent_feedback WHERE kind = 'keluhan' AND verified_at IS NOT NULL AND kpi_account_id = $1 AND verified_at >= $2::date AND verified_at < ($3::date + 1)`, [musyrifId, from, to]);
      const n = rows ? rows[0].n : 0;
      return { score: Math.max(0, 100 - config.complaintPenalty * n), detail: n ? `${n} keluhan terverifikasi (pengurang ${config.complaintPenalty} per keluhan).` : 'Tidak ada keluhan terverifikasi.' };
    }
    return { score: null, detail: 'Dinilai manual oleh penilai.' };
  }

  function rakit(row, config) {
    const snap = row.snapshot || {};
    const adj = row.adjustments || {};
    const grades = (snap.config && snap.config.grades) || config.grades;
    const items = (snap.indicators || []).map((i) => {
      const a = adj[i.id];
      const skor = a && a.score !== undefined && a.score !== null ? Number(a.score) : (i.auto ? i.auto.score : null);
      return { id: i.id, code: i.code, name: i.name, source: i.source, weight: i.weight, autoScore: i.auto ? i.auto.score : null, detail: i.auto ? i.auto.detail : '', adjusted: Boolean(a && a.score !== undefined && a.score !== null), adjustmentComment: a ? a.comment || '' : '', score: skor };
    });
    const ada = items.filter((i) => i.score !== null);
    const bobot = ada.reduce((n, i) => n + i.weight, 0);
    const total = ada.length && bobot > 0 ? Math.round(ada.reduce((n, i) => n + i.score * i.weight, 0) / bobot) : null;
    return {
      id: row.id, musyrifId: row.musyrif_account_id, musyrifName: row.musyrif_name || null, month: row.month, status: row.status, statusLabel: row.status === 'final' ? 'Final' : 'Draf',
      items, total, grade: huruf(total, grades), grades, comment: row.comment || '', computedAt: iso(row.computed_at), finalizedAt: iso(row.finalized_at), finalizedBy: row.finalized_by || null,
      missing: items.filter((i) => i.score === null).map((i) => i.name)
    };
  }

  const SELECT_EVAL = `SELECT e.*, m.name AS musyrif_name, f.name AS finalized_by FROM kpi_evaluations e JOIN accounts m ON m.id = e.musyrif_account_id LEFT JOIN accounts f ON f.id = e.finalized_by_account_id`;

  async function musyrifSah(id) {
    if (!UUID.test(String(id))) return null;
    return (await database.query(`SELECT id, name FROM accounts WHERE id = $1 AND role = 'supervisor' AND active`, [id])).rows[0] || null;
  }

  async function evaluate(musyrifId, bulan, actor) {
    if (!admin(actor)) return TOLAK_ADMIN;
    if (!BULAN.test(String(bulan))) return { ok: false, error: 'Bulan memakai format YYYY-MM.' };
    if (bulan > hariIni().slice(0, 7)) return { ok: false, error: 'Penilaian belum bisa disusun untuk bulan yang belum berjalan.' };
    return tulis(async () => {
      if (!(await musyrifSah(musyrifId))) return { ok: false, status: 404, error: 'Musyrif tidak ditemukan.' };
      const lama = (await database.query('SELECT * FROM kpi_evaluations WHERE musyrif_account_id = $1 AND month = $2', [musyrifId, bulan])).rows[0];
      if (lama && lama.status === 'final') return { ok: false, status: 409, error: 'Penilaian ini sudah final.' };
      const { config } = await muatConfig();
      const indikator = await muatIndikator(true);
      const daftar = [];
      for (const i of indikator) {
        const auto = await hitungOtomatis(i, musyrifId, bulan, config);
        daftar.push({ id: i.id, code: i.code, name: i.name, source: i.source, weight: Number(i.weight), auto });
      }
      const snapshot = { month: bulan, indicators: daftar, config: { grades: config.grades } };
      let id;
      if (lama) {
        id = lama.id;
        await database.query('UPDATE kpi_evaluations SET snapshot = $2::jsonb, computed_by_account_id = $3, computed_at = $4 WHERE id = $1', [id, JSON.stringify(snapshot), actor.id || null, now()]);
      } else {
        id = crypto.randomUUID();
        await database.query('INSERT INTO kpi_evaluations (id, musyrif_account_id, month, snapshot, computed_by_account_id, computed_at) VALUES ($1, $2, $3, $4::jsonb, $5, $6)', [id, musyrifId, bulan, JSON.stringify(snapshot), actor.id || null, now()]);
      }
      return { ok: true, value: rakit((await database.query(`${SELECT_EVAL} WHERE e.id = $1`, [id])).rows[0], config) };
    });
  }

  async function detail(musyrifId, bulan, actor) {
    if (!admin(actor)) return TOLAK_ADMIN;
    if (!UUID.test(String(musyrifId)) || !BULAN.test(String(bulan))) return { ok: false, error: 'Musyrif atau bulan tidak valid.' };
    return tulis(async () => {
      const { config } = await muatConfig();
      const row = (await database.query(`${SELECT_EVAL} WHERE e.musyrif_account_id = $1 AND e.month = $2`, [musyrifId, bulan])).rows[0];
      const { from, to } = rentang(bulan);
      const bukti = (await database.query(`SELECT b.*, i.name AS indicator_name FROM kpi_evidence b LEFT JOIN kpi_indicators i ON i.id = b.indicator_id WHERE b.musyrif_account_id = $1 AND b.month = $2 ORDER BY b.created_at DESC`, [musyrifId, bulan])).rows;
      const kerja = (await database.query(`SELECT * FROM kpi_extra_work WHERE musyrif_account_id = $1 AND work_date BETWEEN $2::date AND $3::date ORDER BY work_date DESC`, [musyrifId, from, to])).rows;
      return {
        ok: true,
        value: {
          evaluation: row ? rakit(row, config) : null,
          evidence: bukti.map(bentukBukti), extraWork: kerja.map(bentukKerja),
          canFinalize: Boolean(row && row.status === 'draft' && config.confirmedAt), settingsConfirmed: Boolean(config.confirmedAt)
        }
      };
    });
  }

  async function adjust(id, input, actor) {
    if (!admin(actor)) return TOLAK_ADMIN;
    if (!UUID.test(String(id))) return { ok: false, status: 404, error: 'Penilaian tidak ditemukan.' };
    const sumber = input || {};
    return tulis(async () => {
      const row = (await database.query(`${SELECT_EVAL} WHERE e.id = $1`, [id])).rows[0];
      if (!row) return { ok: false, status: 404, error: 'Penilaian tidak ditemukan.' };
      if (row.status === 'final') return { ok: false, status: 409, error: 'Penilaian yang sudah final tidak bisa diubah.' };
      const adj = { ...(row.adjustments || {}) };
      const idIndikator = new Set(((row.snapshot || {}).indicators || []).map((i) => i.id));
      for (const [kunci, nilai] of Object.entries(sumber.adjustments || {})) {
        if (!idIndikator.has(kunci)) return { ok: false, error: 'Indikator tidak ada dalam penilaian ini.' };
        if (nilai === null || nilai.score === null || nilai.score === undefined || nilai.score === '') { delete adj[kunci]; continue; }
        const skor = Number(nilai.score);
        if (!Number.isFinite(skor) || skor < 0 || skor > 100) return { ok: false, error: 'Nilai penyesuaian harus angka 0 sampai 100.' };
        const komentar = rapi(nilai.comment, 500);
        if (komentar.length < 5) return { ok: false, error: 'Setiap penyesuaian nilai wajib disertai komentar (minimal 5 karakter).' };
        adj[kunci] = { score: Math.round(skor), comment: komentar, by: actor.id || null, at: now().toISOString() };
      }
      const komentarAkhir = sumber.comment === undefined ? row.comment : rapi(sumber.comment, 2000);
      await database.query('UPDATE kpi_evaluations SET adjustments = $2::jsonb, comment = $3 WHERE id = $1', [id, JSON.stringify(adj), komentarAkhir]);
      const { config } = await muatConfig();
      return { ok: true, value: rakit((await database.query(`${SELECT_EVAL} WHERE e.id = $1`, [id])).rows[0], config) };
    });
  }

  async function finalize(id, actor) {
    if (!admin(actor)) return TOLAK_ADMIN;
    if (!UUID.test(String(id))) return { ok: false, status: 404, error: 'Penilaian tidak ditemukan.' };
    return tulis(async () => {
      const { config } = await muatConfig();
      const row = (await database.query(`${SELECT_EVAL} WHERE e.id = $1`, [id])).rows[0];
      if (!row) return { ok: false, status: 404, error: 'Penilaian tidak ditemukan.' };
      if (row.status === 'final') return { ok: false, status: 409, error: 'Penilaian ini sudah final.' };
      if (!config.confirmedAt) return { ok: false, status: 409, error: 'Bobot dan batas nilai KPI belum dikonfirmasi admin. Periksa dan simpan pengaturannya lebih dulu.' };
      const hasil = rakit(row, config);
      if (hasil.total === null) return { ok: false, status: 409, error: 'Belum ada indikator yang punya nilai. Tambahkan penyesuaian manual atau tunggu data tersedia.' };
      await database.query(`UPDATE kpi_evaluations SET status = 'final', finalized_by_account_id = $2, finalized_at = $3 WHERE id = $1`, [id, actor.id || null, now()]);
      return { ok: true, value: rakit((await database.query(`${SELECT_EVAL} WHERE e.id = $1`, [id])).rows[0], config) };
    });
  }

  // ------------------------------------------------------------------ bukti, pekerjaan tambahan, penghargaan

  function bentukBukti(row) {
    return { id: row.id, month: row.month, indicatorId: row.indicator_id || null, indicatorName: row.indicator_name || null, description: row.description, fileId: row.file_id || null, createdAt: iso(row.created_at), reviewerComment: row.reviewer_comment || '', reviewedAt: iso(row.reviewed_at) };
  }

  function bentukKerja(row) {
    return { id: row.id, workDate: row.work_date_text || (row.work_date instanceof Date ? row.work_date.toISOString().slice(0, 10) : String(row.work_date).slice(0, 10)), kind: row.kind, kindLabel: JENIS_KERJA[row.kind], description: row.description, fileId: row.file_id || null, status: row.status, statusLabel: { diajukan: 'Menunggu verifikasi', diverifikasi: 'Terverifikasi', ditolak: 'Ditolak' }[row.status], verificationNote: row.verification_note || '', musyrifName: row.musyrif_name || undefined, musyrifId: row.musyrif_account_id };
  }

  async function berkasMilik(fileId, musyrifId) {
    if (!fileId) return null;
    if (!UUID.test(String(fileId))) return false;
    const rows = (await database.query(`SELECT id FROM file_objects WHERE id = $1 AND purpose = 'kpi-evidence' AND entity_id = $2 AND status = 'ready'`, [fileId, String(musyrifId)])).rows;
    return rows.length ? rows[0].id : false;
  }

  async function addEvidence(input, actor) {
    if (!musyrif(actor)) return TOLAK_MUSYRIF;
    const sumber = input || {};
    if (!BULAN.test(String(sumber.month))) return { ok: false, error: 'Bulan memakai format YYYY-MM.' };
    if (sumber.month > hariIni().slice(0, 7)) return { ok: false, error: 'Bulan belum berjalan.' };
    const deskripsi = rapi(sumber.description, 1000);
    if (deskripsi.length < 5) return { ok: false, error: 'Jelaskan bukti pelaksanaan (minimal 5 karakter).' };
    return tulis(async () => {
      const berkas = await berkasMilik(sumber.fileId, actor.id);
      if (berkas === false) return { ok: false, error: 'Berkas bukti tidak ditemukan.' };
      let indikator = null;
      if (sumber.indicatorId) {
        const ada = UUID.test(String(sumber.indicatorId)) ? (await database.query('SELECT id FROM kpi_indicators WHERE id = $1', [sumber.indicatorId])).rows[0] : null;
        if (!ada) return { ok: false, error: 'Indikator tidak ditemukan.' };
        indikator = ada.id;
      }
      const id = crypto.randomUUID();
      await database.query('INSERT INTO kpi_evidence (id, musyrif_account_id, month, indicator_id, description, file_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [id, actor.id, sumber.month, indikator, deskripsi, berkas, now()]);
      return { ok: true, value: bentukBukti((await database.query('SELECT b.*, i.name AS indicator_name FROM kpi_evidence b LEFT JOIN kpi_indicators i ON i.id = b.indicator_id WHERE b.id = $1', [id])).rows[0]) };
    });
  }

  async function commentEvidence(id, input, actor) {
    if (!admin(actor)) return TOLAK_ADMIN;
    const komentar = rapi(input && input.comment, 1000);
    if (komentar.length < 3) return { ok: false, error: 'Tulis komentar penilai (minimal 3 karakter).' };
    if (!UUID.test(String(id))) return { ok: false, status: 404, error: 'Bukti tidak ditemukan.' };
    return tulis(async () => {
      const { rows } = await database.query('UPDATE kpi_evidence SET reviewer_comment = $2, reviewed_by_account_id = $3, reviewed_at = $4 WHERE id = $1 RETURNING *', [id, komentar, actor.id || null, now()]);
      if (!rows.length) return { ok: false, status: 404, error: 'Bukti tidak ditemukan.' };
      return { ok: true, value: bentukBukti(rows[0]) };
    });
  }

  async function addExtraWork(input, actor) {
    if (!musyrif(actor)) return TOLAK_MUSYRIF;
    const sumber = input || {};
    if (!tanggalValid(sumber.workDate) || sumber.workDate > hariIni()) return { ok: false, error: 'Tanggal pekerjaan tidak valid atau di masa depan.' };
    if (!JENIS_KERJA[sumber.kind]) return { ok: false, error: 'Pilih jenis pekerjaan tambahan.' };
    const deskripsi = rapi(sumber.description, 1000);
    if (deskripsi.length < 5) return { ok: false, error: 'Jelaskan pekerjaannya (minimal 5 karakter).' };
    return tulis(async () => {
      const berkas = await berkasMilik(sumber.fileId, actor.id);
      if (berkas === false) return { ok: false, error: 'Berkas bukti tidak ditemukan.' };
      const id = crypto.randomUUID();
      await database.query('INSERT INTO kpi_extra_work (id, musyrif_account_id, work_date, kind, description, file_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [id, actor.id, sumber.workDate, sumber.kind, deskripsi, berkas, now()]);
      return { ok: true, value: bentukKerja((await database.query(`SELECT *, to_char(work_date, 'YYYY-MM-DD') AS work_date_text FROM kpi_extra_work WHERE id = $1`, [id])).rows[0]) };
    });
  }

  async function listExtraWork(actor, status) {
    if (!admin(actor)) return TOLAK_ADMIN;
    return tulis(async () => {
      const { rows } = await database.query(
        `SELECT w.*, to_char(w.work_date, 'YYYY-MM-DD') AS work_date_text, m.name AS musyrif_name FROM kpi_extra_work w JOIN accounts m ON m.id = w.musyrif_account_id
          WHERE ($1::text IS NULL OR w.status = $1) ORDER BY w.created_at DESC LIMIT 100`, [['diajukan', 'diverifikasi', 'ditolak'].includes(status) ? status : null]
      );
      return { ok: true, value: { items: rows.map(bentukKerja) } };
    });
  }

  async function verifyExtraWork(id, input, actor) {
    if (!admin(actor)) return TOLAK_ADMIN;
    const keputusan = String(input && input.decision || '');
    if (!['diverifikasi', 'ditolak'].includes(keputusan)) return { ok: false, error: 'Keputusan harus diverifikasi atau ditolak.' };
    const catatan = rapi(input && input.note, 500);
    if (keputusan === 'ditolak' && catatan.length < 5) return { ok: false, error: 'Tulis alasan penolakan (minimal 5 karakter).' };
    if (!UUID.test(String(id))) return { ok: false, status: 404, error: 'Pekerjaan tidak ditemukan.' };
    return tulis(async () => {
      const lama = (await database.query('SELECT status FROM kpi_extra_work WHERE id = $1', [id])).rows[0];
      if (!lama) return { ok: false, status: 404, error: 'Pekerjaan tidak ditemukan.' };
      if (lama.status !== 'diajukan') return { ok: false, status: 409, error: 'Pekerjaan ini sudah diputuskan.' };
      await database.query('UPDATE kpi_extra_work SET status = $2, verified_by_account_id = $3, verified_at = $4, verification_note = $5 WHERE id = $1', [id, keputusan, actor.id || null, now(), catatan]);
      return { ok: true, value: bentukKerja((await database.query(`SELECT w.*, to_char(w.work_date, 'YYYY-MM-DD') AS work_date_text, m.name AS musyrif_name FROM kpi_extra_work w JOIN accounts m ON m.id = w.musyrif_account_id WHERE w.id = $1`, [id])).rows[0]) };
    });
  }

  async function addReward(input, actor) {
    if (!admin(actor)) return TOLAK_ADMIN;
    const sumber = input || {};
    const judul = rapi(sumber.title, 120);
    if (judul.length < 3) return { ok: false, error: 'Judul penghargaan 3 sampai 120 karakter.' };
    const tanggal = sumber.awardedOn || hariIni();
    if (!tanggalValid(tanggal)) return { ok: false, error: 'Tanggal penghargaan tidak valid.' };
    return tulis(async () => {
      const { config } = await muatConfig();
      if (!config.rewardEnabled) return { ok: false, status: 409, error: 'Program penghargaan belum dijalankan. Aktifkan di pengaturan KPI bila program reward dimulai.' };
      if (!(await musyrifSah(sumber.musyrifId))) return { ok: false, status: 404, error: 'Musyrif tidak ditemukan.' };
      const id = crypto.randomUUID();
      await database.query('INSERT INTO kpi_rewards (id, musyrif_account_id, title, reason, awarded_on, awarded_by_account_id) VALUES ($1, $2, $3, $4, $5, $6)', [id, sumber.musyrifId, judul, rapi(sumber.reason, 500), tanggal, actor.id || null]);
      return { ok: true, value: { id, title: judul, awardedOn: tanggal } };
    });
  }

  // ------------------------------------------------------------------ rekap, perbandingan, dan tampilan musyrif

  async function rekapTahun(musyrifIds, tahun, config) {
    const { rows } = await database.query(`${SELECT_EVAL} WHERE e.status = 'final' AND e.month LIKE $1 AND e.musyrif_account_id = ANY($2::uuid[]) ORDER BY e.month`, [`${tahun}-%`, musyrifIds]);
    return rows.map((r) => rakit(r, config));
  }

  async function comparison(actor, tahun) {
    if (!admin(actor)) return TOLAK_ADMIN;
    const th = /^\d{4}$/.test(String(tahun)) ? String(tahun) : hariIni().slice(0, 4);
    return tulis(async () => {
      const { config } = await muatConfig();
      const daftar = (await listMusyrif(actor)).value.items;
      const final = daftar.length ? await rekapTahun(daftar.map((m) => m.id), th, config) : [];
      const baris = daftar.map((m) => {
        const milik = final.filter((f) => f.musyrifId === m.id);
        const perBulan = Object.fromEntries(milik.map((f) => [f.month, f.total]));
        const nilai = milik.filter((f) => f.total !== null).map((f) => f.total);
        const rata = nilai.length ? Math.round(nilai.reduce((a, b) => a + b, 0) / nilai.length) : null;
        return { musyrifId: m.id, name: m.name, dormitories: m.dormitories, months: perBulan, finalMonths: nilai.length, average: rata, grade: huruf(rata, config.grades) };
      });
      const perIndikator = new Map();
      final.forEach((f) => f.items.forEach((i) => { if (i.score !== null) { const a = perIndikator.get(i.name) || { name: i.name, jumlah: 0, total: 0 }; a.jumlah += 1; a.total += i.score; perIndikator.set(i.name, a); } }));
      return { ok: true, value: { year: th, grades: config.grades, items: baris, indicators: [...perIndikator.values()].map((a) => ({ name: a.name, average: Math.round(a.total / a.jumlah) })) } };
    });
  }

  // Tampilan musyrif: hanya penilaian final miliknya, bukti, pekerjaan tambahan, dan penghargaan (bila program berjalan).
  async function mine(actor, tahun) {
    if (!actor || !['supervisor', 'admin'].includes(actor.role)) return TOLAK_MUSYRIF;
    if (actor.role === 'admin') return { ok: false, status: 403, error: 'Admin melihat KPI semua musyrif di tab Penilaian.' };
    const th = /^\d{4}$/.test(String(tahun)) ? String(tahun) : hariIni().slice(0, 4);
    return tulis(async () => {
      const { config } = await muatConfig();
      const final = await rekapTahun([actor.id], th, config);
      const nilai = final.filter((f) => f.total !== null).map((f) => f.total);
      const rata = nilai.length ? Math.round(nilai.reduce((a, b) => a + b, 0) / nilai.length) : null;
      const bukti = (await database.query(`SELECT b.*, i.name AS indicator_name FROM kpi_evidence b LEFT JOIN kpi_indicators i ON i.id = b.indicator_id WHERE b.musyrif_account_id = $1 AND b.month LIKE $2 ORDER BY b.created_at DESC`, [actor.id, `${th}-%`])).rows;
      const kerja = (await database.query(`SELECT *, to_char(work_date, 'YYYY-MM-DD') AS work_date_text FROM kpi_extra_work WHERE musyrif_account_id = $1 AND to_char(work_date, 'YYYY') = $2 ORDER BY work_date DESC`, [actor.id, th])).rows;
      const hadiah = config.rewardEnabled ? (await database.query(`SELECT id, title, reason, to_char(awarded_on, 'YYYY-MM-DD') AS awarded_on FROM kpi_rewards WHERE musyrif_account_id = $1 ORDER BY awarded_on DESC`, [actor.id])).rows : [];
      const indikator = (await muatIndikator(true)).map(bentukIndikator);
      return {
        ok: true,
        value: {
          year: th, grades: config.grades, evaluations: final.map((f) => ({ ...f, musyrifName: undefined })),
          annual: { average: rata, grade: huruf(rata, config.grades), finalMonths: nilai.length },
          evidence: bukti.map(bentukBukti), extraWork: kerja.map(bentukKerja), indicators: indikator,
          rewardsEnabled: Boolean(config.rewardEnabled), rewards: hadiah.map((h) => ({ id: h.id, title: h.title, reason: h.reason, awardedOn: h.awarded_on })),
          workKinds: Object.entries(JENIS_KERJA).map(([id, label]) => ({ id, label }))
        }
      };
    });
  }

  return { getSettings, updateSettings, createIndicator, updateIndicator, listMusyrif, evaluate, detail, adjust, finalize, addEvidence, commentEvidence, addExtraWork, listExtraWork, verifyExtraWork, addReward, comparison, mine };
}

module.exports = { createKpiService, SUMBER };
