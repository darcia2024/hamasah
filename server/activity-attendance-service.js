'use strict';

const crypto = require('node:crypto');

// Absensi kegiatan (migrasi 066): jenis kegiatan, sesi (jadwal, lokasi, kelompok peserta, petugas), absensi per
// santri, koreksi berjejak, dan rekap.
//
// Dua status yang sengaja terpisah:
//   - status SESI: terjadwal, terlaksana, tidak-terlaksana, dibatalkan. Diputuskan petugas, tidak pernah
//     disimpulkan dari ketidakhadiran santri (kegiatan yang sepi tetap terlaksana).
//   - status ABSENSI santri: hadir, izin, sakit, alpa; "belum dicatat" = belum ada baris.
// Absensi hanya bisa diisi untuk sesi yang ditandai terlaksana. Rekap hanya menghitung sesi terlaksana.
// Musyrif hanya mengisi santri di asrama yang dipegangnya; admin semua.

const STATUS_SESI = Object.freeze({ terjadwal: 'Terjadwal', terlaksana: 'Terlaksana', 'tidak-terlaksana': 'Tidak terlaksana', dibatalkan: 'Dibatalkan' });
const STATUS_ABSENSI = Object.freeze({ hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpa: 'Tidak hadir' });
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk absensi kegiatan. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const JAM = /^([01]\d|2[0-3]):[0-5]\d$/;

function tabelBelumAda(error) {
  if (!error) return false;
  if (['42P01', '42703'].includes(error.code)) return true;
  return /activity_(types|sessions|attendance)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function rapi(value, maks = 300) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maks);
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : null);
}

function tanggalValid(teks) {
  if (!TANGGAL.test(String(teks || ''))) return false;
  const d = new Date(`${teks}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === teks;
}

function createActivityAttendanceService({ database, staffDormitories, now = () => new Date() } = {}) {
  if (!database || typeof staffDormitories !== 'function') throw new Error('createActivityAttendanceService membutuhkan database dan staffDormitories.');

  async function tulis(fn) {
    try { return await fn(); } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  async function baca(fn, kosong) {
    try { return await fn(); } catch (error) {
      if (tabelBelumAda(error)) return kosong;
      throw error;
    }
  }

  const admin = (actor) => Boolean(actor && actor.role === 'admin');
  const staf = (actor) => Boolean(actor && ['admin', 'supervisor'].includes(actor.role));
  const TOLAK = { ok: false, status: 403, error: 'Hanya admin dan musyrif yang mengelola absensi kegiatan.' };

  // null = tanpa batas asrama (admin); selain itu daftar id asrama yang dipegang musyrif.
  async function batasAsrama(actor) {
    return admin(actor) ? null : (await staffDormitories(actor.id)) || [];
  }

  // ------------------------------------------------------------------ jenis kegiatan

  function bentukJenis(row) {
    return { id: row.id, name: row.name, description: row.description || '', active: Boolean(row.active) };
  }

  async function listTypes(actor) {
    if (!staf(actor)) return TOLAK;
    const hasil = await baca(async () => ({ available: true, rows: (await database.query('SELECT * FROM activity_types ORDER BY active DESC, name')).rows }), { available: false, rows: [] });
    return { ok: true, value: { available: hasil.available, items: hasil.rows.map(bentukJenis), statuses: { session: Object.entries(STATUS_SESI).map(([id, label]) => ({ id, label })), attendance: Object.entries(STATUS_ABSENSI).map(([id, label]) => ({ id, label })) } } };
  }

  async function createType(input, actor) {
    if (!admin(actor)) return { ok: false, status: 403, error: 'Hanya admin yang membuat jenis kegiatan.' };
    const name = rapi(input && input.name, 60);
    if (name.length < 2) return { ok: false, error: 'Nama kegiatan 2 sampai 60 karakter.' };
    return tulis(async () => {
      const ada = await database.query('SELECT 1 FROM activity_types WHERE lower(name) = lower($1)', [name]);
      if (ada.rows.length) return { ok: false, status: 409, error: 'Jenis kegiatan dengan nama itu sudah ada.' };
      const { rows } = await database.query('INSERT INTO activity_types (id, name, description) VALUES ($1, $2, $3) RETURNING *', [crypto.randomUUID(), name, rapi(input && input.description)]);
      return { ok: true, value: bentukJenis(rows[0]) };
    });
  }

  async function updateType(id, input, actor) {
    if (!admin(actor)) return { ok: false, status: 403, error: 'Hanya admin yang mengubah jenis kegiatan.' };
    if (!UUID.test(String(id))) return { ok: false, status: 404, error: 'Jenis kegiatan tidak ditemukan.' };
    const sumber = input || {};
    return tulis(async () => {
      const { rows } = await database.query('SELECT * FROM activity_types WHERE id = $1', [id]);
      if (!rows.length) return { ok: false, status: 404, error: 'Jenis kegiatan tidak ditemukan.' };
      const name = sumber.name === undefined ? rows[0].name : rapi(sumber.name, 60);
      if (name.length < 2) return { ok: false, error: 'Nama kegiatan 2 sampai 60 karakter.' };
      const ganda = await database.query('SELECT 1 FROM activity_types WHERE lower(name) = lower($1) AND id <> $2', [name, id]);
      if (ganda.rows.length) return { ok: false, status: 409, error: 'Jenis kegiatan dengan nama itu sudah ada.' };
      const active = sumber.active === undefined ? rows[0].active : Boolean(sumber.active);
      const description = sumber.description === undefined ? rows[0].description : rapi(sumber.description);
      const { rows: baru } = await database.query('UPDATE activity_types SET name = $2, description = $3, active = $4 WHERE id = $1 RETURNING *', [id, name, description, active]);
      return { ok: true, value: bentukJenis(baru[0]) };
    });
  }

  // ------------------------------------------------------------------ sesi

  function bentukSesi(row) {
    return {
      id: row.id, typeId: row.type_id, typeName: row.type_name, title: row.title || '', date: row.session_date_text,
      startTime: row.start_time_text || null, endTime: row.end_time_text || null, location: row.location || '',
      groupKind: row.group_kind, groupLabel: row.group_kind === 'semua' ? 'Semua santri' : `Asrama ${row.dormitory_name || ''}`.trim(),
      dormitoryId: row.dormitory_id || null, staffAccountId: row.staff_account_id || null, staffName: row.staff_name || null,
      status: row.status, statusLabel: STATUS_SESI[row.status], statusReason: row.status_reason || '',
      participants: row.participants === undefined ? undefined : Number(row.participants),
      recorded: row.recorded === undefined ? undefined : Number(row.recorded)
    };
  }

  const SELECT_SESI = `SELECT s.*, to_char(s.session_date, 'YYYY-MM-DD') AS session_date_text, to_char(s.start_time, 'HH24:MI') AS start_time_text,
        to_char(s.end_time, 'HH24:MI') AS end_time_text, t.name AS type_name, d.name AS dormitory_name, a.name AS staff_name,
        (SELECT count(*) FROM students st WHERE st.status = 'active' AND (s.group_kind = 'semua' OR st.dormitory_id = s.dormitory_id)) AS participants,
        (SELECT count(*) FROM activity_attendance aa WHERE aa.session_id = s.id) AS recorded
      FROM activity_sessions s
      JOIN activity_types t ON t.id = s.type_id
      LEFT JOIN dormitories d ON d.id = s.dormitory_id
      LEFT JOIN accounts a ON a.id = s.staff_account_id`;

  async function dapatSesi(id) {
    if (!UUID.test(String(id))) return null;
    const { rows } = await database.query(`${SELECT_SESI} WHERE s.id = $1`, [id]);
    return rows[0] || null;
  }

  // Sesi boleh dikelola musyrif bila untuk semua santri (hanya dilihat) atau untuk asrama yang dipegangnya.
  function sesiDalamBatas(row, batas) {
    if (batas === null) return true;
    return row.group_kind === 'asrama' && batas.includes(row.dormitory_id);
  }

  async function listSessions(actor, { from, to, dormitoryId } = {}) {
    if (!staf(actor)) return TOLAK;
    if ((from && !tanggalValid(from)) || (to && !tanggalValid(to))) return { ok: false, error: 'Rentang tanggal tidak valid.' };
    const batas = await batasAsrama(actor);
    const hasil = await baca(async () => ({
      available: true,
      rows: (await database.query(
        `${SELECT_SESI}
          WHERE ($1::date IS NULL OR s.session_date >= $1::date) AND ($2::date IS NULL OR s.session_date <= $2::date)
            AND ($3::uuid IS NULL OR s.dormitory_id = $3::uuid)
            AND ($4::uuid[] IS NULL OR s.group_kind = 'semua' OR s.dormitory_id = ANY($4::uuid[]))
          ORDER BY s.session_date DESC, s.start_time NULLS LAST, t.name LIMIT 200`,
        [from || null, to || null, dormitoryId && UUID.test(dormitoryId) ? dormitoryId : null, batas]
      )).rows
    }), { available: false, rows: [] });
    return { ok: true, value: { available: hasil.available, items: hasil.rows.map((row) => ({ ...bentukSesi(row), manageable: sesiDalamBatas(row, batas) })) } };
  }

  async function createSession(input, actor) {
    if (!staf(actor)) return TOLAK;
    const sumber = input || {};
    if (!tanggalValid(sumber.date)) return { ok: false, error: 'Tanggal kegiatan tidak valid.' };
    const mulai = sumber.startTime ? String(sumber.startTime) : null;
    const selesai = sumber.endTime ? String(sumber.endTime) : null;
    if ((mulai && !JAM.test(mulai)) || (selesai && !JAM.test(selesai))) return { ok: false, error: 'Jam memakai format HH:MM.' };
    if (mulai && selesai && selesai <= mulai) return { ok: false, error: 'Jam selesai harus sesudah jam mulai.' };
    const groupKind = sumber.groupKind === 'semua' ? 'semua' : 'asrama';
    const batas = await batasAsrama(actor);
    let dormitoryId = null;
    if (groupKind === 'asrama') {
      dormitoryId = String(sumber.dormitoryId || '');
      if (!UUID.test(dormitoryId)) return { ok: false, error: 'Pilih asrama peserta.' };
      if (batas !== null && !batas.includes(dormitoryId)) return { ok: false, status: 403, error: 'Asrama itu bukan tanggung jawab Anda.' };
    } else if (batas !== null) {
      return { ok: false, status: 403, error: 'Kegiatan untuk semua santri dibuat admin.' };
    }
    return tulis(async () => {
      const jenis = await database.query('SELECT active FROM activity_types WHERE id = $1', [UUID.test(String(sumber.typeId)) ? sumber.typeId : null]);
      if (!jenis.rows.length) return { ok: false, error: 'Pilih jenis kegiatan.' };
      if (!jenis.rows[0].active) return { ok: false, error: 'Jenis kegiatan ini sudah dinonaktifkan.' };
      let petugas = null;
      if (sumber.staffAccountId) {
        const a = await database.query(`SELECT id FROM accounts WHERE id = $1 AND active AND role IN ('admin', 'supervisor')`, [UUID.test(String(sumber.staffAccountId)) ? sumber.staffAccountId : null]);
        if (!a.rows.length) return { ok: false, error: 'Petugas harus akun admin atau musyrif yang aktif.' };
        petugas = a.rows[0].id;
      }
      const id = crypto.randomUUID();
      await database.query(
        `INSERT INTO activity_sessions (id, type_id, title, session_date, start_time, end_time, location, group_kind, dormitory_id, staff_account_id, created_by_account_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [id, sumber.typeId, rapi(sumber.title, 120), sumber.date, mulai, selesai, rapi(sumber.location, 120), groupKind, dormitoryId, petugas, actor.id || null, now()]
      );
      return { ok: true, value: { ...bentukSesi(await dapatSesi(id)), manageable: true } };
    });
  }

  async function setSessionStatus(id, input, actor) {
    if (!staf(actor)) return TOLAK;
    const status = String(input && input.status || '');
    if (!STATUS_SESI[status]) return { ok: false, error: 'Status kegiatan tidak dikenal.' };
    const alasan = rapi(input && input.reason);
    if (['tidak-terlaksana', 'dibatalkan'].includes(status) && alasan.length < 5) return { ok: false, error: 'Tulis alasan kegiatan tidak terlaksana (minimal 5 karakter).' };
    return tulis(async () => {
      const sesi = await dapatSesi(id);
      if (!sesi) return { ok: false, status: 404, error: 'Kegiatan tidak ditemukan.' };
      const batas = await batasAsrama(actor);
      if (!sesiDalamBatas(sesi, batas)) return { ok: false, status: 403, error: 'Kegiatan ini bukan tanggung jawab Anda.' };
      if (['tidak-terlaksana', 'dibatalkan'].includes(status) && Number(sesi.recorded) > 0) {
        return { ok: false, status: 409, error: 'Kegiatan sudah punya absensi. Koreksi absensinya lebih dulu bila kegiatan ternyata tidak terlaksana.' };
      }
      await database.query('UPDATE activity_sessions SET status = $2, status_reason = $3 WHERE id = $1', [id, status, ['tidak-terlaksana', 'dibatalkan'].includes(status) ? alasan : '']);
      return { ok: true, value: { ...bentukSesi(await dapatSesi(id)), manageable: true } };
    });
  }

  // ------------------------------------------------------------------ absensi

  async function roster(id, actor) {
    if (!staf(actor)) return TOLAK;
    return tulis(async () => {
      const sesi = await dapatSesi(id);
      if (!sesi) return { ok: false, status: 404, error: 'Kegiatan tidak ditemukan.' };
      const batas = await batasAsrama(actor);
      if (batas !== null && sesi.group_kind === 'asrama' && !batas.includes(sesi.dormitory_id)) return { ok: false, status: 403, error: 'Kegiatan ini bukan tanggung jawab Anda.' };
      const { rows } = await database.query(
        `SELECT st.id, st.name, d.name AS dormitory_name, st.dormitory_id, a.status, a.note, a.recorded_at, rb.name AS recorded_by
           FROM students st
           LEFT JOIN dormitories d ON d.id = st.dormitory_id
           LEFT JOIN activity_attendance a ON a.session_id = $1 AND a.student_id = st.id
           LEFT JOIN accounts rb ON rb.id = a.recorded_by_account_id
          WHERE st.status = 'active' AND ($2::uuid IS NULL OR st.dormitory_id = $2::uuid) AND ($3::uuid[] IS NULL OR st.dormitory_id = ANY($3::uuid[]))
          ORDER BY d.name NULLS LAST, st.name`,
        [id, sesi.group_kind === 'asrama' ? sesi.dormitory_id : null, batas]
      );
      const log = await database.query(
        `SELECT l.student_id, l.from_status, l.to_status, l.reason, l.changed_at, ac.name AS changed_by FROM activity_attendance_log l
           LEFT JOIN accounts ac ON ac.id = l.changed_by_account_id WHERE l.session_id = $1 AND l.from_status IS NOT NULL ORDER BY l.changed_at DESC LIMIT 100`, [id]
      );
      return {
        ok: true,
        value: {
          session: { ...bentukSesi(sesi), manageable: sesiDalamBatas(sesi, batas) },
          students: rows.map((row) => ({ id: row.id, name: row.name, dormitoryName: row.dormitory_name || null, status: row.status || null, statusLabel: row.status ? STATUS_ABSENSI[row.status] : 'Belum dicatat', note: row.note || '', recordedAt: iso(row.recorded_at), recordedBy: row.recorded_by || null })),
          corrections: log.rows.map((row) => ({ studentId: row.student_id, from: row.from_status, to: row.to_status, reason: row.reason, changedAt: iso(row.changed_at), changedBy: row.changed_by || null }))
        }
      };
    });
  }

  // Peserta yang sah dan dalam batas pelaku, dikembalikan sebagai Map id -> { dormitory_id, status } (status absensi saat ini).
  async function pesertaSah(sesi, ids, batas) {
    const { rows } = await database.query(
      `SELECT st.id, st.dormitory_id, a.status FROM students st
         LEFT JOIN activity_attendance a ON a.session_id = $1 AND a.student_id = st.id
        WHERE st.id = ANY($2::uuid[]) AND st.status = 'active' AND ($3::uuid IS NULL OR st.dormitory_id = $3::uuid)`,
      [sesi.id, ids, sesi.group_kind === 'asrama' ? sesi.dormitory_id : null]
    );
    return new Map(rows.filter((row) => batas === null || batas.includes(row.dormitory_id)).map((row) => [row.id, row]));
  }

  // Pengisian dan koreksi lewat satu pintu: baris baru dicatat langsung, baris yang berubah wajib beralasan.
  async function saveAttendance(id, input, actor) {
    if (!staf(actor)) return TOLAK;
    const daftar = Array.isArray(input && input.entries) ? input.entries : [];
    if (!daftar.length) return { ok: false, error: 'Tidak ada absensi yang dikirim.' };
    if (daftar.length > 500) return { ok: false, error: 'Paling banyak 500 santri per simpan.' };
    for (const e of daftar) {
      if (!e || !UUID.test(String(e.studentId)) || !STATUS_ABSENSI[e.status]) return { ok: false, error: 'Setiap baris butuh studentId dan status hadir, izin, sakit, atau alpa.' };
    }
    return tulis(async () => {
      const sesi = await dapatSesi(id);
      if (!sesi) return { ok: false, status: 404, error: 'Kegiatan tidak ditemukan.' };
      const batas = await batasAsrama(actor);
      if (!sesiDalamBatas(sesi, batas) && !(sesi.group_kind === 'semua' && batas !== null)) return { ok: false, status: 403, error: 'Kegiatan ini bukan tanggung jawab Anda.' };
      if (sesi.status !== 'terlaksana') {
        return { ok: false, status: 409, error: sesi.status === 'terjadwal' ? 'Tandai dulu kegiatan ini terlaksana sebelum mengisi absensi.' : 'Kegiatan yang tidak terlaksana tidak memiliki absensi.' };
      }
      const peserta = await pesertaSah(sesi, daftar.map((e) => e.studentId), batas);
      const tidakSah = daftar.filter((e) => !peserta.has(e.studentId));
      if (tidakSah.length) return { ok: false, status: 403, error: `${tidakSah.length} santri bukan peserta kegiatan ini atau bukan tanggung jawab Anda.` };
      const perubahan = daftar.filter((e) => peserta.get(e.studentId).status && peserta.get(e.studentId).status !== e.status);
      const alasan = rapi(input.reason);
      if (perubahan.length && alasan.length < 5) return { ok: false, error: 'Mengubah absensi yang sudah dicatat butuh alasan (minimal 5 karakter).' };
      let baru = 0;
      let diubah = 0;
      for (const e of daftar) {
        const lama = peserta.get(e.studentId).status || null;
        if (lama === e.status) continue;
        await database.query(
          `INSERT INTO activity_attendance (session_id, student_id, status, note, recorded_by_account_id, recorded_at) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (session_id, student_id) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, recorded_by_account_id = EXCLUDED.recorded_by_account_id, recorded_at = EXCLUDED.recorded_at`,
          [id, e.studentId, e.status, rapi(e.note, 200), actor.id || null, now()]
        );
        await database.query(
          'INSERT INTO activity_attendance_log (id, session_id, student_id, from_status, to_status, reason, changed_by_account_id, changed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [crypto.randomUUID(), id, e.studentId, lama, e.status, lama ? alasan : '', actor.id || null, now()]
        );
        if (lama) diubah += 1; else baru += 1;
      }
      return { ok: true, value: { recorded: baru, corrected: diubah, unchanged: daftar.length - baru - diubah } };
    });
  }

  // ------------------------------------------------------------------ rekap

  const POLA_PERIODE = { bulan: /^\d{4}-(0[1-9]|1[0-2])$/, tahun: /^\d{4}$/ };

  async function recap(actor, { by = 'santri', period = 'bulan', value, dormitoryId } = {}) {
    if (!staf(actor)) return TOLAK;
    if (!['santri', 'asrama', 'kegiatan'].includes(by)) return { ok: false, error: 'Rekap per santri, asrama, atau kegiatan.' };
    if (!POLA_PERIODE[period] || !POLA_PERIODE[period].test(String(value || ''))) return { ok: false, error: period === 'bulan' ? 'Bulan memakai format YYYY-MM.' : 'Tahun memakai format YYYY.' };
    const dari = period === 'bulan' ? `${value}-01` : `${value}-01-01`;
    const ke = period === 'bulan' ? `${new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0)).toISOString().slice(0, 10)}` : `${value}-12-31`;
    const batas = await batasAsrama(actor);
    const kunci = { santri: ['st.id', 'st.name'], asrama: ['COALESCE(st.dormitory_id::text, \'-\')', 'COALESCE(d.name, \'Tanpa asrama\')'], kegiatan: ['t.id::text', 't.name'] }[by];
    return baca(async () => {
      const hitung = await database.query(
        `SELECT ${kunci[0]} AS key, ${kunci[1]} AS label,
                count(*) FILTER (WHERE a.status = 'hadir') AS hadir, count(*) FILTER (WHERE a.status = 'izin') AS izin,
                count(*) FILTER (WHERE a.status = 'sakit') AS sakit, count(*) FILTER (WHERE a.status = 'alpa') AS alpa,
                count(*) FILTER (WHERE a.status IS NULL) AS belum, count(DISTINCT s.id) AS sesi
           FROM activity_sessions s
           JOIN activity_types t ON t.id = s.type_id
           JOIN students st ON st.status = 'active' AND (s.group_kind = 'semua' OR st.dormitory_id = s.dormitory_id)
           LEFT JOIN dormitories d ON d.id = st.dormitory_id
           LEFT JOIN activity_attendance a ON a.session_id = s.id AND a.student_id = st.id
          WHERE s.status = 'terlaksana' AND s.session_date BETWEEN $1::date AND $2::date
            AND ($3::uuid[] IS NULL OR st.dormitory_id = ANY($3::uuid[])) AND ($4::uuid IS NULL OR st.dormitory_id = $4::uuid)
          GROUP BY 1, 2 ORDER BY 2`,
        [dari, ke, batas, dormitoryId && UUID.test(dormitoryId) ? dormitoryId : null]
      );
      // Kegiatan yang tidak terlaksana dilaporkan terpisah dan tidak masuk hitungan kehadiran siapa pun.
      const tak = await database.query(
        `SELECT count(*) FILTER (WHERE status = 'tidak-terlaksana') AS tidak, count(*) FILTER (WHERE status = 'dibatalkan') AS batal
           FROM activity_sessions WHERE session_date BETWEEN $1::date AND $2::date AND ($3::uuid[] IS NULL OR group_kind = 'semua' OR dormitory_id = ANY($3::uuid[]))`,
        [dari, ke, batas]
      );
      const items = hitung.rows.map((row) => {
        const n = (x) => Number(x);
        const dasar = n(row.hadir) + n(row.alpa);
        return { key: row.key, label: row.label, hadir: n(row.hadir), izin: n(row.izin), sakit: n(row.sakit), alpa: n(row.alpa), belum: n(row.belum), sessions: n(row.sesi), rate: dasar ? Math.round((n(row.hadir) / dasar) * 100) : null };
      });
      return { ok: true, value: { by, period, value, from: dari, to: ke, available: true, items, sessionsNotHeld: { notHeld: Number(tak.rows[0].tidak), cancelled: Number(tak.rows[0].batal) }, note: 'Persentase = hadir dibagi (hadir + tidak hadir). Izin, sakit, dan yang belum dicatat tidak dihitung. Kegiatan yang tidak terlaksana tidak masuk hitungan.' } };
    }, { ok: true, value: { by, period, value, available: false, items: [], sessionsNotHeld: { notHeld: 0, cancelled: 0 } } });
  }

  // Ringkasan satu santri pada rentang tanggal, untuk rapor bulanan (migrasi 068).
  async function studentSummary(studentId, from, to) {
    return baca(async () => {
      const { rows } = await database.query(
        `SELECT count(*) FILTER (WHERE a.status = 'hadir') AS hadir, count(*) FILTER (WHERE a.status = 'izin') AS izin,
                count(*) FILTER (WHERE a.status = 'sakit') AS sakit, count(*) FILTER (WHERE a.status = 'alpa') AS alpa,
                count(*) FILTER (WHERE a.status IS NULL) AS belum
           FROM activity_sessions s
           JOIN students st ON st.id = $1 AND (s.group_kind = 'semua' OR st.dormitory_id = s.dormitory_id)
           LEFT JOIN activity_attendance a ON a.session_id = s.id AND a.student_id = st.id
          WHERE s.status = 'terlaksana' AND s.session_date BETWEEN $2::date AND $3::date`, [studentId, from, to]
      );
      const n = (x) => Number(x);
      const r = rows[0];
      const dasar = n(r.hadir) + n(r.alpa);
      return { hadir: n(r.hadir), izin: n(r.izin), sakit: n(r.sakit), alpa: n(r.alpa), belum: n(r.belum), rate: dasar ? Math.round((n(r.hadir) / dasar) * 100) : null };
    }, { hadir: 0, izin: 0, sakit: 0, alpa: 0, belum: 0, rate: null });
  }

  return { listTypes, createType, updateType, listSessions, createSession, setSessionStatus, roster, saveAttendance, recap, studentSummary };
}

module.exports = { createActivityAttendanceService, STATUS_SESI, STATUS_ABSENSI };
