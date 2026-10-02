'use strict';

const crypto = require('node:crypto');
const { kelompokProgram } = require('./admin-overview-service.js');

// Perjalanan santri: roadmap studi per kelompok program dan santri teladan bulanan.
//
// Data disimpan di tabel student_study_phases dan student_honors (migrasi 044). Kode ini
// boleh online lebih dulu daripada migrasinya: selama tabel belum ada, pembacaan
// mengembalikan kosong (roadmap tanpa fase aktif, Hall of Fame tanpa isi) dan penyimpanan
// ditolak dengan pesan yang mengarah ke tombol pembaruan database di halaman Pengaturan.

// Fase per kelompok program. Hanya program yang fasenya sudah dikonfirmasi yang ada di
// sini; santri program lain tidak melihat roadmap. Nama fase Kuliah S1 mengikuti dokumen
// penawaran (DOKUMENTASI_FITUR_DAN_ESTIMASI_HARGA.md, Modul 2B), tanpa tanggal karena
// setiap angkatan berbeda. Fase Ma'had menunggu daftar dari klien.
const ROADMAPS = Object.freeze({
  'Kuliah S1 Al-Azhar': Object.freeze([
    "Dauroh Ta'hili & karantina bahasa",
    'Ujian Muadalah & kedatangan di Kairo',
    'Talaqqi kitab turats & Markaz Lughoh',
    'Kuliah reguler S1 Al-Azhar',
    'Wisuda Lc. Al-Azhar'
  ])
});

const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk roadmap dan santri teladan. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';
const BULAN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const KANDIDAT_MAKSIMAL = 10;

function tabelBelumAda(error) {
  if (!error) return false;
  if (error.code === '42P01') return true;
  return /student_(study_phases|honors)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// 'YYYY-MM' -> { awal: 'YYYY-MM-01', akhir: awal bulan berikutnya } atau null.
function rentangBulan(bulan) {
  const cocok = BULAN.exec(String(bulan || ''));
  if (!cocok) return null;
  const tahun = Number(cocok[1]);
  const ke = Number(cocok[2]);
  const berikut = ke === 12 ? `${tahun + 1}-01` : `${tahun}-${String(ke + 1).padStart(2, '0')}`;
  return { bulan: `${cocok[1]}-${cocok[2]}`, awal: `${cocok[1]}-${cocok[2]}-01`, akhir: `${berikut}-01` };
}

function persen(bagian, total) {
  return total > 0 ? Math.round((bagian / total) * 100) : null;
}

function createStudentJourneyService({ database, accessFor, getStudent, now = () => new Date() } = {}) {
  if (!database || typeof accessFor !== 'function' || typeof getStudent !== 'function') {
    throw new Error('createStudentJourneyService membutuhkan database, accessFor, dan getStudent.');
  }

  function adminOnly(actor) {
    return Boolean(actor && actor.role === 'admin');
  }

  // ------------------------------------------------------------------- roadmap

  // { program, phases: [{ number, title, state: done|current|upcoming }], current }
  // atau value null bila program santri belum punya roadmap.
  async function roadmap(studentId, actor) {
    const akses = await accessFor(studentId, actor);
    if (!akses.exists) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    if (!akses.view) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
    const student = await getStudent(studentId);
    const program = kelompokProgram(student.program);
    const fase = ROADMAPS[program];
    if (!fase) return { ok: true, value: null };
    let current = null;
    try {
      const { rows } = await database.query('SELECT phase FROM student_study_phases WHERE student_id = $1', [studentId]);
      current = rows[0] ? Number(rows[0].phase) : null;
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { ok: true, value: null };
    }
    if (current !== null && (current < 1 || current > fase.length)) current = null;
    return {
      ok: true,
      value: {
        program,
        current,
        phases: fase.map((title, indeks) => {
          const number = indeks + 1;
          const state = current === null ? 'upcoming' : number < current ? 'done' : number === current ? 'current' : 'upcoming';
          return { number, title, state };
        })
      }
    };
  }

  // phase: nomor fase, atau null untuk mengosongkan. Hanya admin.
  async function setPhase(studentId, phase, actor) {
    if (!adminOnly(actor)) return { ok: false, status: 403, error: 'Hanya super admin yang dapat mengatur fase studi.' };
    const student = await getStudent(studentId);
    if (!student) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    const fase = ROADMAPS[kelompokProgram(student.program)];
    if (!fase) return { ok: false, error: 'Program santri ini belum punya roadmap studi.' };
    const nomor = phase === null || phase === '' || phase === undefined ? null : Number(phase);
    if (nomor !== null && (!Number.isInteger(nomor) || nomor < 1 || nomor > fase.length)) {
      return { ok: false, error: `Fase studi harus 1 sampai ${fase.length}.` };
    }
    try {
      if (nomor === null) {
        await database.query('DELETE FROM student_study_phases WHERE student_id = $1', [studentId]);
      } else {
        await database.query(
          `INSERT INTO student_study_phases (student_id, phase, updated_by_account_id, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (student_id) DO UPDATE
             SET phase = EXCLUDED.phase, updated_by_account_id = EXCLUDED.updated_by_account_id, updated_at = now()`,
          [studentId, nomor, actor.id || null]
        );
      }
    } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
    return { ok: true, value: { phase: nomor, title: nomor ? fase[nomor - 1] : null } };
  }

  // -------------------------------------------------------------- santri teladan

  // Untuk santri dan wali: bulan terakhir yang punya santri teladan. Hanya nama, program,
  // gelar, dan alasan; tidak ada id santri atau data lain.
  async function honorsForViewers() {
    try {
      const { rows } = await database.query(
        `SELECT h.honor_month::text AS bulan, s.name, s.program, h.title, h.reason
           FROM student_honors h JOIN students s ON s.id = h.student_id
          WHERE h.honor_month = (SELECT max(honor_month) FROM student_honors)
          ORDER BY h.created_at, s.name`
      );
      return { ok: true, value: { month: rows[0] ? rows[0].bulan.slice(0, 7) : null, items: rows.map((row) => ({ name: row.name, program: row.program, title: row.title, reason: row.reason })) } };
    } catch (error) {
      if (tabelBelumAda(error)) return { ok: true, value: { month: null, items: [] } };
      throw error;
    }
  }

  // Untuk admin: santri teladan satu bulan beserta id-nya (untuk dihapus).
  async function honorsForMonth(bulan, actor) {
    if (!adminOnly(actor)) return { ok: false, status: 403, error: 'Hanya super admin.' };
    const rentang = rentangBulan(bulan);
    if (!rentang) return { ok: false, error: 'Bulan harus berformat YYYY-MM.' };
    try {
      const { rows } = await database.query(
        `SELECT h.id, h.student_id, s.name, s.program, h.title, h.reason
           FROM student_honors h JOIN students s ON s.id = h.student_id
          WHERE h.honor_month = $1::date ORDER BY h.created_at`,
        [rentang.awal]
      );
      return { ok: true, value: { month: rentang.bulan, tersedia: true, items: rows.map((row) => ({ id: row.id, studentId: row.student_id, name: row.name, program: row.program, title: row.title, reason: row.reason })) } };
    } catch (error) {
      if (tabelBelumAda(error)) return { ok: true, value: { month: rentang.bulan, tersedia: false, items: [] } };
      throw error;
    }
  }

  // Kandidat dari data bulan itu: persen sholat berjamaah, persen hadir kegiatan, dan
  // jumlah setoran hafalan baru. Hanya bahan pertimbangan; admin yang memutuskan.
  async function candidates(bulan, actor) {
    if (!adminOnly(actor)) return { ok: false, status: 403, error: 'Hanya super admin.' };
    const rentang = rentangBulan(bulan);
    if (!rentang) return { ok: false, error: 'Bulan harus berformat YYYY-MM.' };
    const { rows } = await database.query(
      `SELECT s.id, s.name, s.program,
              (SELECT count(*)::int FROM student_prayer_logs p WHERE p.student_id = s.id AND p.prayer_date >= $1::date AND p.prayer_date < $2::date) AS sholat,
              (SELECT count(*)::int FROM student_prayer_logs p WHERE p.student_id = s.id AND p.prayer_date >= $1::date AND p.prayer_date < $2::date AND p.status = 'berjamaah') AS berjamaah,
              (SELECT count(*)::int FROM student_attendance a WHERE a.student_id = s.id AND a.occurred_at >= $1::date AND a.occurred_at < $2::date) AS kegiatan,
              (SELECT count(*)::int FROM student_attendance a WHERE a.student_id = s.id AND a.occurred_at >= $1::date AND a.occurred_at < $2::date AND a.status = 'present') AS hadir,
              (SELECT count(*)::int FROM student_memorization_logs m WHERE m.student_id = s.id AND m.occurred_on >= $1::date AND m.occurred_on < $2::date AND m.kind = 'ziyadah') AS ziyadah
         FROM students s
        WHERE s.status = 'active'`,
      [rentang.awal, rentang.akhir]
    );
    const items = rows
      .map((row) => ({
        studentId: row.id,
        name: row.name,
        program: row.program,
        berjamaahRate: persen(row.berjamaah, row.sholat),
        prayers: row.sholat,
        attendanceRate: persen(row.hadir, row.kegiatan),
        activities: row.kegiatan,
        ziyadah: row.ziyadah
      }))
      // Santri tanpa catatan sama sekali di bulan itu tidak bisa dinilai.
      .filter((item) => item.prayers + item.activities + item.ziyadah > 0)
      .sort((kiri, kanan) => (kanan.berjamaahRate ?? -1) - (kiri.berjamaahRate ?? -1)
        || (kanan.attendanceRate ?? -1) - (kiri.attendanceRate ?? -1)
        || kanan.ziyadah - kiri.ziyadah
        || kiri.name.localeCompare(kanan.name, 'id-ID'))
      .slice(0, KANDIDAT_MAKSIMAL);
    return { ok: true, value: { month: rentang.bulan, items } };
  }

  async function addHonor(input, actor) {
    if (!adminOnly(actor)) return { ok: false, status: 403, error: 'Hanya super admin.' };
    const source = input || {};
    const rentang = rentangBulan(source.month);
    const title = clean(source.title);
    const reason = clean(source.reason);
    if (!rentang) return { ok: false, error: 'Bulan harus berformat YYYY-MM.' };
    if (title.length < 3 || title.length > 80) return { ok: false, error: 'Gelar penghargaan 3 sampai 80 karakter.' };
    if (reason.length < 10 || reason.length > 300) return { ok: false, error: 'Alasan penghargaan 10 sampai 300 karakter.' };
    const student = await getStudent(clean(source.studentId));
    if (!student || student.status !== 'active') return { ok: false, error: 'Pilih santri aktif.' };
    try {
      const { rows } = await database.query(
        `INSERT INTO student_honors (id, honor_month, student_id, title, reason, created_by_account_id, created_at)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7)
         ON CONFLICT (honor_month, student_id) DO NOTHING
         RETURNING id`,
        [crypto.randomUUID(), rentang.awal, student.id, title, reason, actor.id || null, now()]
      );
      if (!rows.length) return { ok: false, error: `${student.name} sudah menjadi santri teladan bulan ini.` };
      return { ok: true, value: { id: rows[0].id, month: rentang.bulan, studentId: student.id, name: student.name, title, reason } };
    } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  async function removeHonor(id, actor) {
    if (!adminOnly(actor)) return { ok: false, status: 403, error: 'Hanya super admin.' };
    try {
      const { rows } = await database.query(
        `DELETE FROM student_honors h USING students s
          WHERE h.id = $1 AND s.id = h.student_id
          RETURNING h.id, s.name, h.honor_month::text AS bulan`,
        [id]
      );
      if (!rows.length) return { ok: false, status: 404, error: 'Santri teladan tidak ditemukan.' };
      return { ok: true, value: { id: rows[0].id, name: rows[0].name, month: rows[0].bulan.slice(0, 7) } };
    } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  return Object.freeze({ addHonor, candidates, honorsForMonth, honorsForViewers, removeHonor, roadmap, setPhase });
}

module.exports = { ROADMAPS, createStudentJourneyService, rentangBulan };
