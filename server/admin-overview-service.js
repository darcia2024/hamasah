'use strict';
// Ringkasan pembinaan untuk dashboard super admin: santri, asrama, dan musyrif dalam
// satu permintaan.
//
// Sebelumnya dashboard admin hanya menampilkan jumlah santri, karena tidak ada sumber
// data gabungan; melihat keadaan satu asrama berarti membuka santri satu per satu.
// Di sini semuanya dihitung database dengan kueri GROUP BY per tabel (bukan satu
// kueri per santri), jadi biayanya tetap kecil walau santri bertambah.
//
// Hanya admin. Catatan kesehatan ikut hanya bila fiturnya diaktifkan
// (HEALTH_RECORDS_ENABLED), sama seperti di halaman lain.

const ADMIN_ROLE = 'admin';
// Batas aman satu respons. Lembaga ini jauh di bawahnya; bila suatu saat terlampaui,
// respons menandainya lewat summary.truncated.
const BATAS_SANTRI = 1000;
const HARI_MS = 24 * 60 * 60 * 1000;

const LABEL_KESEHATAN = Object.freeze({
  sehat: 'Sehat',
  'sakit-ringan': 'Sakit ringan',
  'perlu-perhatian': 'Perlu perhatian',
  dirujuk: 'Dirujuk ke dokter'
});

const URUTAN_TINGKAT = Object.freeze({ tinggi: 0, sedang: 1, info: 2 });

function tanggalJakarta(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
}

function geserHari(tanggal, hari) {
  const date = new Date(`${tanggal}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + hari);
  return date.toISOString().slice(0, 10);
}

function selisihHari(dari, ke) {
  return Math.round((new Date(`${ke}T00:00:00Z`) - new Date(`${dari}T00:00:00Z`)) / HARI_MS);
}

const FORMAT_TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// "29 Sep 2026" untuk kalimat peringatan.
function tanggalBaca(tanggal) {
  return FORMAT_TANGGAL.format(new Date(`${tanggal}T00:00:00Z`));
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function kelompokProgram(program) {
  const teks = String(program || '');
  if (/kuliah/i.test(teks)) return 'Kuliah S1 Al-Azhar';
  if (/ma.?had/i.test(teks)) return "Ma'had Al-Azhar";
  return 'Program lain';
}

function persen(bagian, total) {
  return total > 0 ? Math.round((bagian / total) * 100) : null;
}

function petakan(rows, kunci = 'student_id') {
  return new Map(rows.map((row) => [row[kunci], row]));
}

function createAdminOverviewService({ database, healthEnabled = false, now = () => new Date() } = {}) {
  if (!database) throw new Error('createAdminOverviewService membutuhkan database.');

  async function ambil(sql, params = []) {
    return (await database.query(sql, params)).rows;
  }

  async function overview(actor) {
    if (!actor || actor.role !== ADMIN_ROLE) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };

    const saatIni = now();
    const hariIni = tanggalJakarta(saatIni);
    const awal7 = geserHari(hariIni, -6);
    const awal14 = geserHari(hariIni, -13);
    const awal30 = geserHari(hariIni, -29);
    const sejak7 = new Date(saatIni.getTime() - 7 * HARI_MS).toISOString();

    // Santri aktif beserta data dasarnya. Tanggal diambil sebagai teks supaya tidak
    // bergeser oleh zona waktu server.
    const [
      santri, statusSantri, asrama, penugasan, musyrif, kehadiran, sholat, hafalanTerakhir, hafalanHitung,
      kesehatan, pelanggaran, tagihan, visa, aktivitas
    ] = await Promise.all([
      ambil(
        `SELECT s.id, s.name, s.program, s.city, s.gender, s.dormitory_id, s.student_account_id,
                to_char(s.join_date, 'YYYY-MM-DD') AS join_date,
                (SELECT count(*)::int FROM student_parent_accounts p WHERE p.student_id = s.id) AS jumlah_wali
         FROM students s
         WHERE s.status = 'active'
         ORDER BY s.name
         LIMIT $1`,
        [BATAS_SANTRI + 1]
      ),
      ambil('SELECT status, count(*)::int AS jumlah FROM students GROUP BY status'),
      ambil('SELECT id, name, area, gender, capacity FROM dormitories ORDER BY gender, name'),
      ambil(
        `SELECT a.dormitory_id, a.account_id, acc.name
         FROM staff_dormitory_assignments a
         JOIN accounts acc ON acc.id = a.account_id
         ORDER BY acc.name`
      ),
      ambil(`SELECT id, name, email, active FROM accounts WHERE role = 'supervisor' ORDER BY name`),
      ambil(
        `SELECT student_id,
                count(*)::int AS dicatat,
                count(*) FILTER (WHERE status = 'present')::int AS hadir,
                count(*) FILTER (WHERE status = 'late')::int AS terlambat,
                count(*) FILTER (WHERE status = 'excused')::int AS izin,
                count(*) FILTER (WHERE status = 'absent')::int AS alpa
         FROM student_attendance
         WHERE session_date >= $1
         GROUP BY student_id`,
        [awal7]
      ),
      ambil(
        `SELECT student_id,
                count(*)::int AS dicatat,
                count(*) FILTER (WHERE status = 'berjamaah')::int AS berjamaah,
                count(*) FILTER (WHERE status = 'tidak')::int AS tidak
         FROM student_prayer_logs
         WHERE prayer_date >= $1
         GROUP BY student_id`,
        [awal7]
      ),
      ambil(
        `SELECT DISTINCT ON (student_id) student_id, to_char(occurred_on, 'YYYY-MM-DD') AS tanggal, kind, portion, grade
         FROM student_memorization_logs
         ORDER BY student_id, occurred_on DESC, created_at DESC`
      ),
      ambil(
        `SELECT student_id,
                count(*) FILTER (WHERE occurred_on >= $1)::int AS setoran7,
                count(*) FILTER (WHERE occurred_on >= $2 AND grade = 'ulang')::int AS ulang14
         FROM student_memorization_logs
         WHERE occurred_on >= $2
         GROUP BY student_id`,
        [awal7, awal14]
      ),
      healthEnabled
        ? ambil(
          `SELECT DISTINCT ON (student_id) student_id, to_char(occurred_on, 'YYYY-MM-DD') AS tanggal, condition
           FROM student_health_logs
           WHERE occurred_on >= $1
           ORDER BY student_id, occurred_on DESC, created_at DESC`,
          [awal30]
        )
        : Promise.resolve([]),
      ambil(
        `SELECT student_id, count(*)::int AS jumlah
         FROM student_violations
         WHERE occurred_at >= $1::date
         GROUP BY student_id`,
        [awal30]
      ),
      ambil(
        `SELECT student_id,
                count(*)::int AS jumlah,
                coalesce(sum(amount_rupiah), 0)::float8 AS nominal,
                min(issued_at) AS terlama
         FROM invoices
         WHERE status = 'unpaid'
         GROUP BY student_id`
      ),
      ambil(
        `SELECT student_id, status,
                to_char(passport_expires_at, 'YYYY-MM-DD') AS paspor,
                to_char(visa_expires_at, 'YYYY-MM-DD') AS visa
         FROM visa_tracking`
      ),
      // Jejak kerja musyrif: kapan terakhir mencatat dan berapa catatan sepekan ini.
      // Sholat dihitung per santri per hari (satu hari = lima baris, tetap satu catatan).
      ambil(
        `SELECT akun, max(waktu) AS terakhir, count(*) FILTER (WHERE waktu >= $1)::int AS sepekan
         FROM (
           SELECT recorded_by_account_id AS akun, created_at AS waktu FROM student_attendance
           UNION ALL SELECT recorded_by_account_id, max(updated_at) FROM student_prayer_logs GROUP BY recorded_by_account_id, student_id, prayer_date
           UNION ALL SELECT recorded_by_account_id, created_at FROM student_memorization_logs
           UNION ALL SELECT recorded_by_account_id, created_at FROM student_health_logs
           UNION ALL SELECT recorded_by_account_id, created_at FROM student_activities
           UNION ALL SELECT recorded_by_account_id, created_at FROM student_achievements
           UNION ALL SELECT recorded_by_account_id, created_at FROM student_evaluations
           UNION ALL SELECT recorded_by_account_id, created_at FROM student_violations
         ) catatan
         WHERE akun IS NOT NULL
         GROUP BY akun`,
        [sejak7]
      )
    ]);

    const truncated = santri.length > BATAS_SANTRI;
    if (truncated) santri.length = BATAS_SANTRI;

    const kehadiranPer = petakan(kehadiran);
    const sholatPer = petakan(sholat);
    const hafalanTerakhirPer = petakan(hafalanTerakhir);
    const hafalanHitungPer = petakan(hafalanHitung);
    const kesehatanPer = petakan(kesehatan);
    const pelanggaranPer = petakan(pelanggaran);
    const tagihanPer = petakan(tagihan);
    const visaPer = petakan(visa);
    const aktivitasPer = petakan(aktivitas, 'akun');
    const asramaPer = new Map(asrama.map((row) => [row.id, row]));

    const students = santri.map((row) => {
      const hadir = kehadiranPer.get(row.id);
      const ibadah = sholatPer.get(row.id);
      const hafalan = hafalanTerakhirPer.get(row.id);
      const hitungHafalan = hafalanHitungPer.get(row.id);
      const sehat = kesehatanPer.get(row.id);
      const bayar = tagihanPer.get(row.id);
      const izinTinggal = visaPer.get(row.id);
      const tempat = row.dormitory_id ? asramaPer.get(row.dormitory_id) : null;
      return {
        id: row.id,
        name: row.name,
        program: row.program,
        programGroup: kelompokProgram(row.program),
        gender: row.gender || null,
        city: row.city,
        joinDate: row.join_date,
        dormitory: tempat ? { id: tempat.id, name: tempat.name } : null,
        parentAccounts: row.jumlah_wali,
        hasStudentAccount: Boolean(row.student_account_id),
        attendance7: {
          recorded: hadir ? hadir.dicatat : 0,
          present: hadir ? hadir.hadir : 0,
          late: hadir ? hadir.terlambat : 0,
          excused: hadir ? hadir.izin : 0,
          absent: hadir ? hadir.alpa : 0
        },
        prayers7: {
          recorded: ibadah ? ibadah.dicatat : 0,
          congregational: ibadah ? ibadah.berjamaah : 0,
          missed: ibadah ? ibadah.tidak : 0
        },
        memorization: {
          last: hafalan ? { date: hafalan.tanggal, kind: hafalan.kind, portion: hafalan.portion, grade: hafalan.grade } : null,
          deposits7: hitungHafalan ? hitungHafalan.setoran7 : 0,
          repeats14: hitungHafalan ? hitungHafalan.ulang14 : 0
        },
        health: sehat ? { date: sehat.tanggal, condition: sehat.condition, label: LABEL_KESEHATAN[sehat.condition] || sehat.condition } : null,
        violations30: (pelanggaranPer.get(row.id) || { jumlah: 0 }).jumlah,
        billing: {
          unpaidCount: bayar ? bayar.jumlah : 0,
          unpaidAmount: bayar ? Number(bayar.nominal) : 0,
          oldestUnpaidAt: bayar ? iso(bayar.terlama) : null
        },
        visa: izinTinggal ? { status: izinTinggal.status, visaExpiresAt: izinTinggal.visa, passportExpiresAt: izinTinggal.paspor } : null
      };
    });

    const pembinaPer = new Map();
    penugasan.forEach((row) => {
      if (!pembinaPer.has(row.dormitory_id)) pembinaPer.set(row.dormitory_id, []);
      pembinaPer.get(row.dormitory_id).push({ id: row.account_id, name: row.name });
    });

    const dormitories = asrama.map((row) => {
      const penghuni = students.filter((student) => student.dormitory && student.dormitory.id === row.id);
      return {
        id: row.id,
        name: row.name,
        area: row.area,
        gender: row.gender,
        capacity: Number(row.capacity) || 0,
        occupied: penghuni.length,
        supervisors: pembinaPer.get(row.id) || [],
        students: penghuni.map((student) => ({ id: student.id, name: student.name, program: student.program }))
      };
    });

    const supervisors = musyrif.map((row) => {
      const dipegang = dormitories.filter((dorm) => dorm.supervisors.some((pembina) => pembina.id === row.id));
      const jejak = aktivitasPer.get(row.id);
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        active: row.active,
        dormitories: dipegang.map((dorm) => ({ id: dorm.id, name: dorm.name })),
        studentCount: dipegang.reduce((jumlah, dorm) => jumlah + dorm.occupied, 0),
        lastRecordedAt: jejak ? iso(jejak.terakhir) : null,
        records7: jejak ? jejak.sepekan : 0
      };
    });

    const alerts = susunPerhatian({ students, dormitories, supervisors, hariIni, saatIni });

    const totalKehadiran = students.reduce((jumlah, s) => jumlah + s.attendance7.recorded, 0);
    const hadirKehadiran = students.reduce((jumlah, s) => jumlah + s.attendance7.present + s.attendance7.late, 0);
    const totalSholat = students.reduce((jumlah, s) => jumlah + s.prayers7.recorded, 0);
    const berjamaah = students.reduce((jumlah, s) => jumlah + s.prayers7.congregational, 0);
    const program = new Map();
    students.forEach((s) => program.set(s.programGroup, (program.get(s.programGroup) || 0) + 1));
    const status = new Map(statusSantri.map((row) => [row.status, row.jumlah]));

    return {
      ok: true,
      value: {
        generatedAt: saatIni.toISOString(),
        today: hariIni,
        healthEnabled,
        summary: {
          activeStudents: status.get('active') || 0,
          inactiveStudents: status.get('inactive') || 0,
          graduatedStudents: status.get('graduated') || 0,
          putra: students.filter((s) => s.gender === 'putra').length,
          putri: students.filter((s) => s.gender === 'putri').length,
          unplaced: students.filter((s) => !s.dormitory).length,
          withoutParentAccount: students.filter((s) => s.parentAccounts === 0).length,
          programs: [...program.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
          dormitories: dormitories.length,
          capacity: dormitories.reduce((jumlah, d) => jumlah + d.capacity, 0),
          occupied: dormitories.reduce((jumlah, d) => jumlah + d.occupied, 0),
          supervisors: supervisors.filter((s) => s.active).length,
          supervisorsWithoutDormitory: supervisors.filter((s) => s.active && !s.dormitories.length).length,
          attendanceRate7: persen(hadirKehadiran, totalKehadiran),
          prayerRate7: persen(berjamaah, totalSholat),
          unpaidInvoices: students.reduce((jumlah, s) => jumlah + s.billing.unpaidCount, 0),
          unpaidAmount: students.reduce((jumlah, s) => jumlah + s.billing.unpaidAmount, 0),
          alertsHigh: alerts.filter((a) => a.level === 'tinggi').length,
          truncated
        },
        alerts,
        dormitories,
        supervisors,
        students
      }
    };
  }

  return Object.freeze({ overview });
}

// Daftar "perlu perhatian": hal yang sebaiknya ditindaklanjuti admin hari ini.
// tinggi = segera, sedang = pekan ini, info = untuk diketahui.
function susunPerhatian({ students, dormitories, supervisors, hariIni, saatIni }) {
  const daftar = [];
  const tambah = (level, kind, title, detail, ref = {}) => daftar.push({ level, kind, title, detail, ...ref });

  for (const s of students) {
    const ref = { studentId: s.id };
    if (s.health && s.health.condition !== 'sehat' && selisihHari(s.health.date, hariIni) <= 13) {
      tambah(['dirujuk', 'perlu-perhatian'].includes(s.health.condition) ? 'tinggi' : 'sedang', 'kesehatan',
        `${s.name}: ${s.health.label.toLocaleLowerCase('id-ID')}`, `Dicatat ${tanggalBaca(s.health.date)}.`, ref);
    }
    if (s.visa && s.visa.visaExpiresAt) {
      const sisa = selisihHari(hariIni, s.visa.visaExpiresAt);
      if (sisa < 0) tambah('tinggi', 'visa', `${s.name}: visa atau iqamah sudah habis`, `Habis ${tanggalBaca(s.visa.visaExpiresAt)}.`, ref);
      else if (sisa <= 30) tambah(sisa <= 14 ? 'tinggi' : 'sedang', 'visa', `${s.name}: visa habis dalam ${sisa} hari`, `Berlaku sampai ${tanggalBaca(s.visa.visaExpiresAt)}.`, ref);
    }
    if (s.visa && s.visa.passportExpiresAt) {
      const sisa = selisihHari(hariIni, s.visa.passportExpiresAt);
      if (sisa < 0) tambah('tinggi', 'paspor', `${s.name}: paspor sudah habis`, `Habis ${tanggalBaca(s.visa.passportExpiresAt)}.`, ref);
      else if (sisa <= 180) tambah(sisa <= 60 ? 'tinggi' : 'sedang', 'paspor', `${s.name}: paspor habis dalam ${sisa} hari`, 'Paspor perlu berlaku minimal enam bulan untuk perpanjangan iqamah.', ref);
    }
    if (s.attendance7.absent >= 1) {
      tambah(s.attendance7.absent >= 2 ? 'tinggi' : 'sedang', 'kehadiran', `${s.name}: tidak hadir tanpa keterangan`, `${s.attendance7.absent} kali dalam 7 hari terakhir.`, ref);
    }
    if (s.prayers7.missed >= 2) {
      tambah(s.prayers7.missed >= 4 ? 'tinggi' : 'sedang', 'sholat', `${s.name}: sholat terlewat`, `${s.prayers7.missed} waktu dalam 7 hari terakhir.`, ref);
    }
    if (s.memorization.repeats14 >= 2) {
      tambah('info', 'hafalan', `${s.name}: setoran hafalan sering diulang`, `${s.memorization.repeats14} kali diulang dalam 14 hari terakhir.`, ref);
    }
    if (s.violations30 >= 1) {
      tambah(s.violations30 >= 3 ? 'sedang' : 'info', 'pelanggaran', `${s.name}: ${s.violations30} catatan pelanggaran`, 'Dalam 30 hari terakhir.', ref);
    }
    if (s.billing.oldestUnpaidAt && saatIni - new Date(s.billing.oldestUnpaidAt) > 30 * HARI_MS) {
      tambah('sedang', 'tagihan', `${s.name}: tagihan belum lunas lebih dari 30 hari`, `${s.billing.unpaidCount} tagihan menunggu pembayaran.`, ref);
    }
    if (!s.dormitory) {
      tambah('sedang', 'penempatan', `${s.name}: belum ditempatkan di asrama`, 'Tempatkan lewat halaman Monitoring.', ref);
    }
  }

  for (const d of dormitories) {
    const ref = { dormitoryId: d.id };
    if (d.capacity > 0 && d.occupied >= d.capacity) {
      tambah('tinggi', 'asrama', `${d.name} penuh`, `${d.occupied} dari ${d.capacity} tempat terisi.`, ref);
    } else if (d.capacity > 0 && d.occupied / d.capacity >= 0.9) {
      tambah('sedang', 'asrama', `${d.name} hampir penuh`, `${d.occupied} dari ${d.capacity} tempat terisi.`, ref);
    }
    if (!d.supervisors.length) {
      tambah('sedang', 'asrama', `${d.name} belum punya musyrif`, 'Tugaskan musyrif lewat halaman Monitoring.', ref);
    }
  }

  for (const m of supervisors) {
    const ref = { accountId: m.id };
    if (!m.active) {
      if (m.dormitories.length) tambah('info', 'musyrif', `${m.name}: akun nonaktif masih ditugaskan`, `Asrama: ${m.dormitories.map((d) => d.name).join(', ')}.`, ref);
      continue;
    }
    if (!m.dormitories.length) {
      tambah('info', 'musyrif', `${m.name} belum ditugaskan ke asrama`, 'Tanpa penugasan, musyrif tidak melihat santri mana pun.', ref);
    } else if (m.studentCount > 0 && (!m.lastRecordedAt || saatIni - new Date(m.lastRecordedAt) > 2 * HARI_MS)) {
      tambah('sedang', 'musyrif', `${m.name} belum mencatat 2 hari terakhir`,
        m.lastRecordedAt ? `Catatan terakhir ${tanggalBaca(tanggalJakarta(new Date(m.lastRecordedAt)))}.` : 'Belum pernah mencatat.', ref);
    }
  }

  return daftar.sort((a, b) => URUTAN_TINGKAT[a.level] - URUTAN_TINGKAT[b.level]);
}

module.exports = { createAdminOverviewService, kelompokProgram, susunPerhatian };
