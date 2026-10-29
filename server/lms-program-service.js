'use strict';

const crypto = require('node:crypto');

// LMS internal khusus santri Hamasah (migrasi 076), di atas lms-service.js yang sudah ada:
//   - maddah dikelompokkan per program dan jenjang,
//   - hak akses bisa mengikuti keanggotaan program: peserta batch aktif otomatis terdaftar (source 'program'),
//     dan dicabut otomatis saat tidak lagi aktif. Pendaftaran manual staf (source 'manual') tidak pernah dicabut,
//   - musyrif mencatat kehadiran sesi belajar bersama untuk santri asramanya yang terdaftar di maddah itu.
// Tabel enrollment tetap satu-satunya sumber hak akses, jadi lms-service.js tidak perlu tahu soal program.

const STATUS_HADIR = Object.freeze({ hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpa: 'Alpa' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BELUM_SIAP = 'Database belum diperbarui untuk LMS program. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';

function tabelBelumAda(error) {
  if (!error) return false;
  if (['42P01', '42703'].includes(error.code)) return true;
  return /(course_sessions|course_session_attendance|program_id|auto_access|source)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function rapi(value, maks) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maks);
}

function tanggalValid(teks) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(teks || ''))) return false;
  const d = new Date(`${teks}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === teks;
}

function createLmsProgramService({ database, staffDormitories, lms, now = () => new Date() } = {}) {
  if (!database || typeof staffDormitories !== 'function') throw new Error('createLmsProgramService membutuhkan database dan staffDormitories.');

  const staf = (actor) => Boolean(actor && ['admin', 'teacher', 'supervisor'].includes(actor.role));
  const TOLAK = { ok: false, status: 403, error: 'Hanya admin, pengajar, dan musyrif yang mengelola LMS.' };
  const hariIni = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now());

  async function tulis(fn) {
    try { return await fn(); } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: BELUM_SIAP };
      throw error;
    }
  }

  async function batasAsrama(actor) {
    return actor.role === 'supervisor' ? ((await staffDormitories(actor.id)) || []) : null;
  }

  async function ambilMaddah(courseId) {
    if (!UUID.test(String(courseId))) return null;
    return (await database.query('SELECT id, title, owner_account_id, program_id, level, auto_access FROM courses WHERE id = $1', [courseId])).rows[0] || null;
  }

  // Pengajar dan musyrif hanya mengubah pengaturan maddah miliknya; admin semua.
  const pemilik = (maddah, actor) => actor.role === 'admin' || maddah.owner_account_id === actor.id;

  // ------------------------------------------------------------------ hak akses mengikuti program

  const PESERTA_AKTIF = `SELECT DISTINCT bp.student_id FROM program_batches b JOIN batch_participants bp ON bp.batch_id = b.id
                          WHERE b.program_id = $1 AND bp.status = 'aktif' AND b.status IN ('direncanakan', 'berjalan')`;

  // Menyelaraskan enrollment 'program' satu maddah: tambah peserta aktif, cabut yang sudah tidak aktif.
  async function sinkronMaddah(courseId) {
    const m = await ambilMaddah(courseId);
    if (!m || !m.program_id || !m.auto_access) {
      // Akses otomatis dimatikan: cabut baris yang dibuat otomatis, pendaftaran manual tidak disentuh.
      const dicabut = await database.query(`DELETE FROM course_enrollments WHERE course_id = $1 AND source = 'program'`, [courseId]);
      return { added: 0, removed: dicabut.rowCount || 0 };
    }
    const tambah = await database.query(
      `INSERT INTO course_enrollments (student_id, course_id, enrolled_at, source) SELECT p.student_id, $2, now(), 'program' FROM (${PESERTA_AKTIF}) p
        JOIN students s ON s.id = p.student_id WHERE s.status IN ('active', 'leave') ON CONFLICT (student_id, course_id) DO NOTHING`, [m.program_id, courseId]
    );
    const cabut = await database.query(
      `DELETE FROM course_enrollments e WHERE e.course_id = $2 AND e.source = 'program' AND e.student_id NOT IN (SELECT p.student_id FROM (${PESERTA_AKTIF}) p)`, [m.program_id, courseId]
    );
    return { added: tambah.rowCount || 0, removed: cabut.rowCount || 0 };
  }

  // Menyelaraskan satu santri di semua maddah berakses otomatis (dipanggil saat santri membuka katalognya).
  async function sinkronSantri(studentId) {
    await database.query(
      `INSERT INTO course_enrollments (student_id, course_id, enrolled_at, source)
       SELECT $1, c.id, now(), 'program' FROM courses c
        WHERE c.auto_access AND c.program_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM program_batches b JOIN batch_participants bp ON bp.batch_id = b.id
           WHERE b.program_id = c.program_id AND bp.student_id = $1 AND bp.status = 'aktif' AND b.status IN ('direncanakan', 'berjalan'))
        ON CONFLICT (student_id, course_id) DO NOTHING`, [studentId]
    );
    await database.query(
      `DELETE FROM course_enrollments e USING courses c WHERE e.student_id = $1 AND e.course_id = c.id AND e.source = 'program'
          AND NOT (c.auto_access AND c.program_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM program_batches b JOIN batch_participants bp ON bp.batch_id = b.id
             WHERE b.program_id = c.program_id AND bp.student_id = $1 AND bp.status = 'aktif' AND b.status IN ('direncanakan', 'berjalan')))`, [studentId]
    );
  }

  async function setScope(courseId, input, actor) {
    if (!staf(actor)) return TOLAK;
    const m = await ambilMaddah(courseId);
    if (!m) return { ok: false, status: 404, error: 'Maddah tidak ditemukan.' };
    if (!pemilik(m, actor)) return { ok: false, status: 403, error: 'Hanya pemilik maddah atau admin yang mengubah program dan jenjang.' };
    const s = input || {};
    const programId = s.programId === undefined ? m.program_id : (s.programId || null);
    const jenjang = s.level === undefined ? m.level : rapi(s.level, 60);
    const otomatis = s.autoAccess === undefined ? Boolean(m.auto_access) : Boolean(s.autoAccess);
    if (programId && !UUID.test(String(programId))) return { ok: false, error: 'Program tidak valid.' };
    if (otomatis && !programId) return { ok: false, error: 'Akses otomatis butuh program: pilih program lebih dulu.' };
    return tulis(async () => {
      if (programId) {
        const ada = (await database.query('SELECT 1 FROM programs WHERE id = $1', [programId])).rows[0];
        if (!ada) return { ok: false, status: 404, error: 'Program tidak ditemukan.' };
      }
      await database.query('UPDATE courses SET program_id = $2, level = $3, auto_access = $4, updated_at = now() WHERE id = $1', [courseId, programId, jenjang, otomatis]);
      const sinkron = await sinkronMaddah(courseId);
      return { ok: true, value: { id: courseId, programId, level: jenjang, autoAccess: otomatis, ...sinkron } };
    });
  }

  async function syncCourse(courseId, actor) {
    if (!staf(actor)) return TOLAK;
    const m = await ambilMaddah(courseId);
    if (!m) return { ok: false, status: 404, error: 'Maddah tidak ditemukan.' };
    if (!pemilik(m, actor)) return { ok: false, status: 403, error: 'Hanya pemilik maddah atau admin yang menyinkronkan akses.' };
    return tulis(async () => ({ ok: true, value: await sinkronMaddah(courseId) }));
  }

  // ------------------------------------------------------------------ katalog per program dan jenjang

  function kelompokkan(maddah) {
    const grup = new Map();
    for (const c of maddah) {
      const kunci = `${c.programId || ''}|${c.level || ''}`;
      if (!grup.has(kunci)) grup.set(kunci, { programId: c.programId, programName: c.programName || 'Tanpa program', level: c.level || '', courses: [] });
      grup.get(kunci).courses.push(c);
    }
    return [...grup.values()].sort((a, b) => (a.programId ? 0 : 1) - (b.programId ? 0 : 1) || a.programName.localeCompare(b.programName, 'id') || a.level.localeCompare(b.level, 'id'));
  }

  // Katalog staf: admin dan musyrif melihat semua maddah (musyrif perlu memilih maddah untuk sesi belajar bersama,
  // tetapi hanya pemilik dan admin yang boleh mengubah cakupannya); pengajar hanya yang dimilikinya.
  async function staffCatalog(actor) {
    if (!staf(actor)) return TOLAK;
    return tulis(async () => {
      const { rows } = await database.query(
        `SELECT c.id, c.title, c.description, c.program_id, c.level, c.auto_access, c.owner_account_id, p.name AS program_name,
                (SELECT count(*) FROM course_materials m WHERE m.course_id = c.id AND m.archived_at IS NULL)::int AS materi,
                (SELECT count(*) FROM course_enrollments e WHERE e.course_id = c.id)::int AS terdaftar,
                (SELECT count(*) FROM course_enrollments e WHERE e.course_id = c.id AND e.source = 'program')::int AS otomatis
           FROM courses c LEFT JOIN programs p ON p.id = c.program_id
          WHERE ($1::uuid IS NULL OR c.owner_account_id = $1::uuid) ORDER BY p.name NULLS LAST, c.level, c.title`, [actor.role === 'teacher' ? actor.id : null]
      );
      const programs = (await database.query('SELECT id, name FROM programs WHERE active ORDER BY name')).rows;
      const maddah = rows.map((r) => ({ id: r.id, title: r.title, description: r.description, programId: r.program_id, programName: r.program_name, level: r.level, autoAccess: r.auto_access, canEdit: pemilik({ owner_account_id: r.owner_account_id }, actor), materials: r.materi, enrolled: r.terdaftar, automatic: r.otomatis }));
      return { ok: true, value: { groups: kelompokkan(maddah), programs } };
    });
  }

  // Katalog santri: hanya maddah yang boleh dibuka santri itu (hak akses = enrollment). Pemeriksaan akses ke santri
  // dilakukan lms.listStudentCourses lebih dulu; sinkronisasi program baru jalan setelah akses terbukti sah.
  async function studentCatalog(studentId, actor) {
    const awal = await lms.listStudentCourses(studentId, actor);
    if (!awal.ok) return { ok: false, status: 403, error: awal.error };
    return tulis(async () => {
      if (actor.role === 'student') await sinkronSantri(studentId);
      const daftar = actor.role === 'student' ? await lms.listStudentCourses(studentId, actor) : awal;
      if (!daftar.ok) return { ok: false, status: 403, error: daftar.error };
      const ids = daftar.value.map((c) => c.id);
      const meta = ids.length ? (await database.query('SELECT c.id, c.program_id, c.level, p.name AS program_name FROM courses c LEFT JOIN programs p ON p.id = c.program_id WHERE c.id = ANY($1::uuid[])', [ids])).rows : [];
      const maddah = daftar.value.map((c) => { const m = meta.find((x) => x.id === c.id) || {}; return { id: c.id, title: c.title, description: c.description, programId: m.program_id || null, programName: m.program_name || null, level: m.level || '', progress: c.progress, materials: Array.isArray(c.materials) ? c.materials.length : undefined }; });
      return { ok: true, value: { groups: kelompokkan(maddah) } };
    });
  }

  // ------------------------------------------------------------------ sesi belajar bersama

  async function bolehSesi(sesiId, actor) {
    if (!staf(actor)) return TOLAK;
    if (!UUID.test(String(sesiId))) return { ok: false, status: 404, error: 'Sesi tidak ditemukan.' };
    const s = (await database.query(
      `SELECT s.*, to_char(s.held_on, 'YYYY-MM-DD') AS held_on_text, c.title AS course_title, c.owner_account_id, d.name AS dormitory_name
         FROM course_sessions s JOIN courses c ON c.id = s.course_id LEFT JOIN dormitories d ON d.id = s.dormitory_id WHERE s.id = $1 AND s.archived_at IS NULL`, [sesiId]
    )).rows[0];
    if (!s) return { ok: false, status: 404, error: 'Sesi tidak ditemukan.' };
    if (actor.role === 'teacher' && s.owner_account_id !== actor.id) return { ok: false, status: 404, error: 'Sesi tidak ditemukan.' };
    if (actor.role === 'supervisor') {
      const b = await batasAsrama(actor);
      if (!s.dormitory_id || !b.includes(s.dormitory_id)) return { ok: false, status: 404, error: 'Sesi tidak ditemukan.' };
    }
    return { ok: true, sesi: s };
  }

  const bentukSesi = (s, ringkas = {}) => ({ id: s.id, courseId: s.course_id, courseTitle: s.course_title, materialId: s.material_id || null, dormitoryId: s.dormitory_id || null, dormitoryName: s.dormitory_name || null, title: s.title, heldOn: s.held_on_text, note: s.note || '', ...ringkas });

  async function createSession(courseId, input, actor) {
    if (!staf(actor)) return TOLAK;
    const m = await ambilMaddah(courseId);
    if (!m) return { ok: false, status: 404, error: 'Maddah tidak ditemukan.' };
    if (actor.role === 'teacher' && m.owner_account_id !== actor.id) return { ok: false, status: 403, error: 'Pengajar hanya membuat sesi untuk maddah miliknya.' };
    const s = input || {};
    const judul = rapi(s.title, 120);
    if (judul.length < 3) return { ok: false, error: 'Judul sesi minimal 3 karakter.' };
    const tanggal = s.heldOn || hariIni();
    if (!tanggalValid(tanggal) || tanggal > hariIni()) return { ok: false, error: 'Tanggal sesi tidak valid atau di masa depan.' };
    const asrama = s.dormitoryId || null;
    if (asrama && !UUID.test(String(asrama))) return { ok: false, error: 'Asrama tidak valid.' };
    if (actor.role === 'supervisor') {
      const b = await batasAsrama(actor);
      if (!asrama) return { ok: false, error: 'Pilih asrama binaan Anda untuk sesi ini.' };
      if (!b.includes(asrama)) return { ok: false, status: 403, error: 'Asrama ini bukan asrama yang Anda pegang.' };
    }
    return tulis(async () => {
      if (asrama && !(await database.query('SELECT 1 FROM dormitories WHERE id = $1', [asrama])).rows[0]) return { ok: false, status: 404, error: 'Asrama tidak ditemukan.' };
      if (s.materialId) {
        if (!UUID.test(String(s.materialId)) || !(await database.query('SELECT 1 FROM course_materials WHERE id = $1 AND course_id = $2', [s.materialId, courseId])).rows[0]) return { ok: false, error: 'Materi tidak ditemukan di maddah ini.' };
      }
      const id = crypto.randomUUID();
      await database.query('INSERT INTO course_sessions (id, course_id, material_id, dormitory_id, title, held_on, note, created_by_account_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [id, courseId, s.materialId || null, asrama, judul, tanggal, rapi(s.note, 300), actor.id || null]);
      const izin = await bolehSesi(id, actor);
      return { ok: true, value: bentukSesi(izin.sesi, { recorded: 0, total: 0 }) };
    });
  }

  async function listSessions(actor, { courseId, from, to } = {}) {
    if (!staf(actor)) return TOLAK;
    return tulis(async () => {
      const b = await batasAsrama(actor);
      const { rows } = await database.query(
        `SELECT s.*, to_char(s.held_on, 'YYYY-MM-DD') AS held_on_text, c.title AS course_title, d.name AS dormitory_name,
                (SELECT count(*) FROM course_session_attendance a WHERE a.session_id = s.id)::int AS dicatat,
                (SELECT count(*) FROM course_session_attendance a WHERE a.session_id = s.id AND a.status = 'hadir')::int AS hadir
           FROM course_sessions s JOIN courses c ON c.id = s.course_id LEFT JOIN dormitories d ON d.id = s.dormitory_id
          WHERE s.archived_at IS NULL AND ($1::uuid IS NULL OR s.course_id = $1::uuid) AND ($2::date IS NULL OR s.held_on >= $2::date) AND ($3::date IS NULL OR s.held_on <= $3::date)
            AND ($4::uuid[] IS NULL OR s.dormitory_id = ANY($4::uuid[])) AND ($5::uuid IS NULL OR c.owner_account_id = $5::uuid)
          ORDER BY s.held_on DESC, s.created_at DESC LIMIT 100`,
        [courseId && UUID.test(courseId) ? courseId : null, tanggalValid(from) ? from : null, tanggalValid(to) ? to : null, b, actor.role === 'teacher' ? actor.id : null]
      );
      return { ok: true, value: { items: rows.map((r) => bentukSesi(r, { recorded: r.dicatat, present: r.hadir })) } };
    });
  }

  // Daftar peserta sesi: santri terdaftar di maddah itu; musyrif hanya santri asramanya, sesi asrama hanya santri asrama itu.
  async function roster(sesi, actor) {
    const b = await batasAsrama(actor);
    const { rows } = await database.query(
      `SELECT st.id, st.name, a.status, a.note FROM course_enrollments e JOIN students st ON st.id = e.student_id
         LEFT JOIN course_session_attendance a ON a.session_id = $2 AND a.student_id = st.id
        WHERE e.course_id = $1 AND st.status IN ('active', 'leave') AND ($3::uuid IS NULL OR st.dormitory_id = $3::uuid) AND ($4::uuid[] IS NULL OR st.dormitory_id = ANY($4::uuid[]))
        ORDER BY st.name`, [sesi.course_id, sesi.id, sesi.dormitory_id || null, b]
    );
    return rows.map((r) => ({ studentId: r.id, name: r.name, status: r.status || null, statusLabel: r.status ? STATUS_HADIR[r.status] : null, note: r.note || '' }));
  }

  async function getSession(sesiId, actor) {
    const izin = await bolehSesi(sesiId, actor);
    if (!izin.ok) return izin;
    return tulis(async () => ({ ok: true, value: { ...bentukSesi(izin.sesi), students: await roster(izin.sesi, actor), statuses: Object.entries(STATUS_HADIR).map(([id, label]) => ({ id, label })) } }));
  }

  async function saveAttendance(sesiId, input, actor) {
    const izin = await bolehSesi(sesiId, actor);
    if (!izin.ok) return izin;
    const daftar = Array.isArray(input && input.entries) ? input.entries : [];
    if (!daftar.length) return { ok: false, error: 'Tidak ada kehadiran yang dikirim.' };
    for (const e of daftar) {
      if (!e || !UUID.test(String(e.studentId))) return { ok: false, error: 'Setiap baris butuh studentId.' };
      if (!STATUS_HADIR[e.status]) return { ok: false, error: 'Status kehadiran harus hadir, izin, sakit, atau alpa.' };
    }
    return tulis(async () => {
      const sah = new Set((await roster(izin.sesi, actor)).map((r) => r.studentId));
      const asing = daftar.filter((e) => !sah.has(e.studentId));
      if (asing.length) return { ok: false, status: 422, error: 'Ada santri yang bukan peserta sesi ini (belum terdaftar di maddah, atau bukan santri asrama Anda).' };
      for (const e of daftar) {
        await database.query(
          `INSERT INTO course_session_attendance (session_id, student_id, status, note, recorded_by_account_id, recorded_at) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (session_id, student_id) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, recorded_by_account_id = EXCLUDED.recorded_by_account_id, recorded_at = EXCLUDED.recorded_at`,
          [sesiId, e.studentId, e.status, rapi(e.note, 200), actor.id || null, now()]
        );
      }
      return { ok: true, value: { saved: daftar.length, students: await roster(izin.sesi, actor) } };
    });
  }

  // Rekap kehadiran sesi per santri untuk satu maddah (admin, pemilik, dan musyrif atas santri asramanya).
  async function attendanceSummary(courseId, actor) {
    if (!staf(actor)) return TOLAK;
    const m = await ambilMaddah(courseId);
    if (!m || (actor.role === 'teacher' && m.owner_account_id !== actor.id)) return { ok: false, status: 404, error: 'Maddah tidak ditemukan.' };
    return tulis(async () => {
      const b = await batasAsrama(actor);
      const total = (await database.query('SELECT count(*)::int AS n FROM course_sessions WHERE course_id = $1 AND archived_at IS NULL', [courseId])).rows[0].n;
      const { rows } = await database.query(
        `SELECT st.id, st.name,
                count(*) FILTER (WHERE a.status = 'hadir')::int AS hadir, count(*) FILTER (WHERE a.status = 'izin')::int AS izin,
                count(*) FILTER (WHERE a.status = 'sakit')::int AS sakit, count(*) FILTER (WHERE a.status = 'alpa')::int AS alpa
           FROM course_enrollments e JOIN students st ON st.id = e.student_id
           LEFT JOIN course_session_attendance a ON a.student_id = st.id AND a.session_id IN (SELECT id FROM course_sessions WHERE course_id = $1 AND archived_at IS NULL)
          WHERE e.course_id = $1 AND ($2::uuid[] IS NULL OR st.dormitory_id = ANY($2::uuid[])) GROUP BY st.id, st.name ORDER BY st.name`, [courseId, b]
      );
      return { ok: true, value: { sessions: total, items: rows.map((r) => ({ studentId: r.id, name: r.name, present: r.hadir, excused: r.izin, sick: r.sakit, absent: r.alpa })) } };
    });
  }

  return { setScope, syncCourse, staffCatalog, studentCatalog, createSession, listSessions, getSession, saveAttendance, attendanceSummary, sinkronSantri };
}

module.exports = { createLmsProgramService };
