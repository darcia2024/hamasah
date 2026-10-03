'use strict';

// Presensi per asrama: satu layar untuk mencatat sholat atau kegiatan seluruh santri aktif
// di satu asrama, alih-alih membuka santri satu per satu.
//
// Penyimpanan memakai layanan yang sudah ada untuk setiap santri (recordPrayers dan
// addAttendance), jadi validasi dan batas akses musyrif per asrama tetap sama persis.
// Tidak ada tabel baru.
//
//   - Sholat: menyimpan ulang menimpa status waktu yang sama (upsert di student_prayer_logs).
//   - Kegiatan: presensi unik per santri, tanggal, dan kategori (migrasi 024). Santri yang
//     sudah tercatat ditampilkan sebagai sudah dicatat dan tidak ditimpa; perubahannya
//     lewat koreksi catatan yang sudah ada (dengan alasan dan jejak koreksi).

const PRAYERS = Object.freeze(['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya']);
const PRAYER_STATUSES = Object.freeze(['berjamaah', 'munfarid', 'tidak', 'izin']);
const ATTENDANCE_STATUSES = Object.freeze(['present', 'late', 'excused', 'absent']);
const MAX_ROSTER = 200;

function clean(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isTanggal(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(value));
}

function hariIniJakarta(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function createDormitoryRollService({ database, staffDormitories, recordPrayers, recordAttendance, healthEnabled = async () => false, now = () => new Date() } = {}) {
  if (!database || typeof staffDormitories !== 'function' || typeof recordPrayers !== 'function' || typeof recordAttendance !== 'function') {
    throw new Error('createDormitoryRollService membutuhkan database, staffDormitories, recordPrayers, dan recordAttendance.');
  }

  function staf(actor) {
    return Boolean(actor && ['admin', 'supervisor'].includes(actor.role));
  }

  // Asrama yang boleh dibuka: admin semua, musyrif yang dipegang.
  async function asramaUntuk(actor) {
    const milik = actor.role === 'supervisor' ? await staffDormitories(actor.id) : null;
    const { rows } = await database.query(
      'SELECT id, name FROM dormitories WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[])) ORDER BY name',
      [milik]
    );
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  // { dormitories, dormitoryId, date, mode, prayer|category, students: [{ id, name, status }],
  //   categories } . status null berarti belum dicatat.
  async function roster(actor, query = {}) {
    if (!staf(actor)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif.' };
    const dormitories = await asramaUntuk(actor);
    const mode = query.mode === 'kegiatan' ? 'kegiatan' : 'sholat';
    const date = clean(query.date, 10);
    const prayer = clean(query.prayer, 10);
    const category = clean(query.category);
    const dormitoryId = clean(query.dormitoryId, 40) || (dormitories[0] && dormitories[0].id) || '';
    if (!dormitories.some((item) => item.id === dormitoryId)) {
      return { ok: true, value: { dormitories, dormitoryId: null, date, mode, prayer, category, students: [], categories: [] } };
    }
    if (!isTanggal(date)) return { ok: false, error: 'Tanggal presensi tidak valid.' };
    if (mode === 'sholat' && !PRAYERS.includes(prayer)) return { ok: false, error: 'Pilih waktu sholat.' };

    const { rows: santri } = await database.query(
      `SELECT id, name FROM students WHERE dormitory_id = $1 AND status = 'active' ORDER BY name LIMIT ${MAX_ROSTER}`,
      [dormitoryId]
    );
    const ids = santri.map((row) => row.id);
    let status = new Map();
    if (ids.length && mode === 'sholat') {
      const { rows } = await database.query(
        'SELECT student_id, status FROM student_prayer_logs WHERE student_id = ANY($1::uuid[]) AND prayer_date = $2::date AND prayer = $3',
        [ids, date, prayer]
      );
      status = new Map(rows.map((row) => [row.student_id, row.status]));
    }
    if (ids.length && mode === 'kegiatan' && category) {
      const { rows } = await database.query(
        'SELECT student_id, status FROM student_attendance WHERE student_id = ANY($1::uuid[]) AND session_date = $2::date AND category = $3',
        [ids, date, category]
      );
      status = new Map(rows.map((row) => [row.student_id, row.status]));
    }
    // Kategori kegiatan yang sering dipakai di asrama ini, sebagai saran isian.
    const { rows: kategori } = await database.query(
      `SELECT a.category, count(*)::int AS jumlah FROM student_attendance a
         JOIN students s ON s.id = a.student_id
        WHERE s.dormitory_id = $1
        GROUP BY a.category ORDER BY jumlah DESC, a.category LIMIT 12`,
      [dormitoryId]
    );
    return {
      ok: true,
      value: {
        dormitories,
        dormitoryId,
        date,
        mode,
        prayer: mode === 'sholat' ? prayer : null,
        category: mode === 'kegiatan' ? category : null,
        students: santri.map((row) => ({ id: row.id, name: row.name, status: status.get(row.id) || null })),
        categories: kategori.map((row) => row.category)
      }
    };
  }

  // entries: [{ studentId, status }]. Setiap santri disimpan lewat layanan masing-masing;
  // yang gagal (misalnya di luar asrama musyrif) dilaporkan per santri, sisanya tetap tersimpan.
  async function simpan(actor, input, simpanSatu, statusSah) {
    if (!staf(actor)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif.' };
    const entries = Array.isArray(input && input.entries) ? input.entries : [];
    if (!entries.length) return { ok: false, error: 'Belum ada santri yang diisi statusnya.' };
    if (entries.length > MAX_ROSTER) return { ok: false, error: `Paling banyak ${MAX_ROSTER} santri sekali simpan.` };
    const terlihat = new Set();
    for (const entry of entries) {
      const studentId = clean(entry && entry.studentId, 40);
      if (!studentId || terlihat.has(studentId) || !statusSah.includes(clean(entry && entry.status, 20))) {
        return { ok: false, error: 'Data presensi tidak valid.' };
      }
      terlihat.add(studentId);
    }
    let tersimpan = 0;
    const gagal = [];
    for (const entry of entries) {
      const hasil = await simpanSatu(clean(entry.studentId, 40), clean(entry.status, 20), clean(entry.note, 300));
      if (hasil && hasil.ok) tersimpan += 1;
      else gagal.push({ studentId: entry.studentId, error: (hasil && hasil.error) || 'Belum dapat disimpan.' });
    }
    return { ok: true, value: { tersimpan, gagal } };
  }

  async function saveSholat(actor, input) {
    const date = clean(input && input.date, 10);
    const prayer = clean(input && input.prayer, 10);
    if (!isTanggal(date)) return { ok: false, error: 'Tanggal presensi tidak valid.' };
    if (!PRAYERS.includes(prayer)) return { ok: false, error: 'Pilih waktu sholat.' };
    return simpan(actor, input, (studentId, status) => recordPrayers(studentId, { date, entries: [{ prayer, status }] }, actor), PRAYER_STATUSES);
  }

  async function saveKegiatan(actor, input) {
    const date = clean(input && input.date, 10);
    const category = clean(input && input.category);
    if (!isTanggal(date) || date > hariIniJakarta(now())) return { ok: false, error: 'Tanggal presensi tidak valid atau di masa depan.' };
    if (category.length < 3) return { ok: false, error: 'Nama kegiatan minimal 3 karakter.' };
    // Siang WIB pada tanggal itu, supaya tanggal sesi (WIB) sama dengan tanggal yang dipilih.
    const occurredAt = new Date(`${date}T12:00:00+07:00`).toISOString();
    return simpan(actor, input, (studentId, status, note) => recordAttendance(studentId, { status, category, note, occurredAt }, actor), ATTENDANCE_STATUSES);
  }

  // Ringkasan "Tugas hari ini" untuk beranda musyrif (dan admin): waktu sholat hari ini
  // yang belum dicatat, izin menunggu, pesan wali belum dibaca, dan catatan kesehatan yang
  // perlu perhatian 7 hari terakhir (hanya bila fiturnya aktif). Tabel dari migrasi 045
  // dan 046 yang belum ada dihitung nol.
  async function hitungAman(sql, params) {
    try {
      const { rows } = await database.query(sql, params);
      return rows[0] ? Number(rows[0].jumlah) || 0 : 0;
    } catch (error) {
      if (error && (error.code === '42P01' || /does not exist/i.test(String(error.message || '')))) return 0;
      throw error;
    }
  }

  async function todaySummary(actor) {
    if (!staf(actor)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif.' };
    const milik = actor.role === 'supervisor' ? await staffDormitories(actor.id) : null;
    const tanggal = hariIniJakarta(now());
    const { rows: santri } = await database.query(
      `SELECT id FROM students WHERE status = 'active' AND dormitory_id IS NOT NULL
         AND ($1::uuid[] IS NULL OR dormitory_id = ANY($1::uuid[]))`,
      [milik]
    );
    const ids = santri.map((row) => row.id);
    const { rows: tercatat } = ids.length
      ? await database.query(
        'SELECT prayer, count(*)::int AS jumlah FROM student_prayer_logs WHERE student_id = ANY($1::uuid[]) AND prayer_date = $2::date GROUP BY prayer',
        [ids, tanggal]
      )
      : { rows: [] };
    const sudah = new Map(tercatat.map((row) => [row.prayer, row.jumlah]));
    const sholatBelum = PRAYERS.map((prayer) => ({ prayer, belum: Math.max(0, ids.length - (sudah.get(prayer) || 0)) }))
      .filter((item) => item.belum > 0);
    const [izinMenunggu, pesanBelumDibaca] = ids.length
      ? await Promise.all([
        hitungAman("SELECT count(*)::int AS jumlah FROM student_leave_requests WHERE status = 'menunggu' AND student_id = ANY($1::uuid[])", [ids]),
        hitungAman('SELECT count(*)::int AS jumlah FROM family_messages WHERE read_at IS NULL AND student_id = ANY($1::uuid[])', [ids])
      ])
      : [0, 0];
    let kesehatan = [];
    if (ids.length && (await healthEnabled())) {
      const { rows } = await database.query(
        `SELECT DISTINCT ON (h.student_id) h.student_id, s.name, h.condition, h.occurred_on::text AS tanggal
           FROM student_health_logs h JOIN students s ON s.id = h.student_id
          WHERE h.student_id = ANY($1::uuid[]) AND h.occurred_on >= ($2::date - 6)
            AND h.condition IN ('sakit-ringan', 'perlu-perhatian', 'dirujuk')
          ORDER BY h.student_id, h.occurred_on DESC`,
        [ids, tanggal]
      );
      kesehatan = rows.map((row) => ({ studentId: row.student_id, name: row.name, condition: row.condition, date: row.tanggal }));
    }
    return { ok: true, value: { date: tanggal, students: ids.length, sholatBelum, izinMenunggu, pesanBelumDibaca, kesehatan } };
  }

  return Object.freeze({ roster, saveKegiatan, saveSholat, todaySummary });
}

module.exports = { createDormitoryRollService };
