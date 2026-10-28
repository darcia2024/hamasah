'use strict';
// Monitoring pusat untuk admin: kondisi seluruh santri dan asrama dalam satu respons, tanpa
// membuka profil satu per satu.
//
// Isinya tiga hal:
//   1. Angka hari ini: santri aktif, izin, sakit, asrama, dan musyrif aktif.
//   2. Absensi hari ini: berapa yang hadir, siapa yang belum hadir (dicatat alpa), dan siapa
//      yang belum dilaporkan sama sekali.
//   3. Daftar masalah yang perlu ditindaklanjuti: paspor, iqamah, lapor diri, lapor
//      pendidikan, dan status pendidikan, masing-masing dengan status baru, diproses, atau
//      selesai (tabel student_cases, migrasi 056).
//
// Paspor dan iqamah dihitung dari visa_tracking; yang lain dicatat admin. Semua angka berasal
// dari catatan yang benar-benar ada. Filter (negara, asrama, jenjang, jenis masalah, status)
// dijalankan di sini supaya angka di kartu ikut menyempit bersama daftarnya.

const crypto = require('node:crypto');
const { kelompokProgram } = require('./admin-overview-service.js');

const ADMIN_ROLE = 'admin';
const HARI_MS = 24 * 60 * 60 * 1000;
const BATAS_SANTRI = 1000;
const PASPOR_PERINGATAN_HARI = 180;
const PASPOR_SEGERA_HARI = 60;
const IQAMAH_PERINGATAN_HARI = 30;
const IQAMAH_SEGERA_HARI = 14;
const SAKIT_MAKS_HARI = 3;
const DAFTAR_NAMA_PENDEK = 200;
const TABEL_BELUM_ADA = 'Database belum diperbarui untuk monitoring pusat. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';

const JENIS = Object.freeze({
  paspor: { label: 'Paspor hampir kedaluwarsa', otomatis: true },
  iqamah: { label: 'Iqamah bermasalah', otomatis: true },
  'lapor-diri': { label: 'Lapor diri belum selesai', otomatis: false },
  'lapor-pendidikan': { label: 'Lapor pendidikan belum selesai', otomatis: false },
  'status-pendidikan': { label: 'Status pendidikan bermasalah', otomatis: false }
});
const STATUS = Object.freeze(['baru', 'diproses', 'selesai']);
const URUTAN_TINGKAT = Object.freeze({ tinggi: 0, sedang: 1 });
// Wilayah asrama yang berarti di Indonesia. Selain itu dianggap Mesir, tempat Hamasah berpusat.
const PETA_INDONESIA = /indonesia|bogor|jakarta|bandung|depok|bekasi|tangerang|jawa|sumatra|sumatera|kalimantan|sulawesi|bali/i;

function tanggalJakarta(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
}

function selisihHari(dari, ke) {
  return Math.round((new Date(`${ke}T00:00:00Z`) - new Date(`${dari}T00:00:00Z`)) / HARI_MS);
}

const FORMAT_TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
function tanggalBaca(tanggal) {
  return FORMAT_TANGGAL.format(new Date(`${tanggal}T00:00:00Z`));
}

function bersih(value, maks) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maks);
}

function isTanggal(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function negaraDariWilayah(area) {
  return PETA_INDONESIA.test(String(area || '')) ? 'Indonesia' : 'Mesir';
}

function tabelBelumAda(error) {
  return Boolean(error) && (error.code === '42P01' || /student_cases/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || '')));
}

function createCentralMonitoringService({ database, healthEnabled: kesehatanAktif = false, now = () => new Date() } = {}) {
  if (!database) throw new Error('createCentralMonitoringService membutuhkan database.');

  async function ambil(sql, params = []) {
    return (await database.query(sql, params)).rows;
  }

  // Tabel yang boleh belum ada (pembaruan database belum diterapkan) dibaca sebagai kosong.
  async function ambilBoleh(sql, params = []) {
    try {
      return await ambil(sql, params);
    } catch (error) {
      if (error && error.code === '42P01') return [];
      throw error;
    }
  }

  function bacaFilter(query) {
    const sumber = query || {};
    const ambilNilai = (kunci) => bersih(sumber[kunci], 80);
    const status = ambilNilai('status') || 'aktif';
    return {
      negara: ambilNilai('country'),
      asrama: ambilNilai('dormitoryId'),
      jenjang: ambilNilai('level'),
      jenis: ambilNilai('kind'),
      status: ['aktif', 'semua', ...STATUS].includes(status) ? status : 'aktif'
    };
  }

  async function overview(actor, query) {
    if (!actor || actor.role !== ADMIN_ROLE) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };
    const filter = bacaFilter(query);
    const saatIni = now();
    const hariIni = tanggalJakarta(saatIni);
    const kesehatan = Boolean(typeof kesehatanAktif === 'function' ? await kesehatanAktif() : kesehatanAktif);
    const sejakSakit = new Date(saatIni.getTime() - SAKIT_MAKS_HARI * HARI_MS).toISOString().slice(0, 10);

    const [santri, asrama, musyrif, izin, sakit, absensi, visa, masalah] = await Promise.all([
      ambil(
        `SELECT id, name, program, gender, dormitory_id FROM students
         WHERE status = 'active' ORDER BY name LIMIT $1`,
        [BATAS_SANTRI + 1]
      ),
      ambil('SELECT id, name, area FROM dormitories ORDER BY name'),
      ambil(`SELECT count(*)::int AS jumlah FROM accounts WHERE role = 'supervisor' AND active`),
      // Izin yang sedang berjalan: disetujui, sudah mulai, belum berakhir, dan santrinya belum kembali.
      ambilBoleh(
        `SELECT DISTINCT student_id, kind FROM student_leave_requests
         WHERE status = 'disetujui' AND starts_at <= $1 AND ends_at >= $1 AND returned_at IS NULL`,
        [saatIni.toISOString()]
      ),
      kesehatan
        ? ambilBoleh(
          `SELECT DISTINCT ON (student_id) student_id, condition FROM student_health_logs
           WHERE occurred_on >= $1 ORDER BY student_id, occurred_on DESC, created_at DESC`,
          [sejakSakit]
        )
        : Promise.resolve([]),
      ambil(
        `SELECT student_id,
                count(*) FILTER (WHERE status = 'present')::int AS hadir,
                count(*) FILTER (WHERE status = 'late')::int AS terlambat,
                count(*) FILTER (WHERE status = 'excused')::int AS izin,
                count(*) FILTER (WHERE status = 'absent')::int AS alpa
         FROM student_attendance WHERE session_date = $1 GROUP BY student_id`,
        [hariIni]
      ),
      ambil(
        `SELECT student_id, to_char(passport_expires_at, 'YYYY-MM-DD') AS paspor,
                to_char(visa_expires_at, 'YYYY-MM-DD') AS iqamah
         FROM visa_tracking`
      ),
      ambilBoleh(
        `SELECT id, student_id, kind, ref, source, status, note,
                to_char(due_on, 'YYYY-MM-DD') AS due_on, created_at, updated_at, resolved_at
         FROM student_cases`
      )
    ]);

    const terpotong = santri.length > BATAS_SANTRI;
    if (terpotong) santri.length = BATAS_SANTRI;

    const asramaPer = new Map(asrama.map((row) => [row.id, { id: row.id, name: row.name, country: negaraDariWilayah(row.area) }]));
    const izinPer = new Map(izin.map((row) => [row.student_id, row.kind]));
    const sakitPer = new Set(sakit.filter((row) => row.condition && row.condition !== 'sehat').map((row) => row.student_id));
    const absensiPer = new Map(absensi.map((row) => [row.student_id, row]));
    const visaPer = new Map(visa.map((row) => [row.student_id, row]));

    const semua = santri.map((row) => {
      const tempat = row.dormitory_id ? asramaPer.get(row.dormitory_id) : null;
      return {
        id: row.id,
        name: row.name,
        level: kelompokProgram(row.program),
        dormitory: tempat ? { id: tempat.id, name: tempat.name } : null,
        country: tempat ? tempat.country : 'Belum berasrama'
      };
    });

    // Pilihan filter dibangun dari seluruh santri aktif, bukan dari hasil yang sudah disaring,
    // supaya pilihan tidak menghilang setelah dipakai.
    const negaraAda = [...new Set(semua.map((s) => s.country))].sort((a, b) => a.localeCompare(b, 'id-ID'));
    const jenjangAda = [...new Set(semua.map((s) => s.level))].sort((a, b) => a.localeCompare(b, 'id-ID'));
    const dipakaiAsrama = new Set(semua.filter((s) => s.dormitory).map((s) => s.dormitory.id));
    const pilihanAsrama = [...asramaPer.values()]
      .filter((a) => dipakaiAsrama.has(a.id) || a.id === filter.asrama)
      .sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));

    const lingkup = semua.filter((s) => (!filter.negara || s.country === filter.negara)
      && (!filter.asrama || (s.dormitory && s.dormitory.id === filter.asrama))
      && (!filter.jenjang || s.level === filter.jenjang));
    const diLingkup = new Map(lingkup.map((s) => [s.id, s]));

    // Angka hari ini.
    const sedangIzin = lingkup.filter((s) => izinPer.has(s.id));
    const sedangSakit = lingkup.filter((s) => sakitPer.has(s.id) || izinPer.get(s.id) === 'sakit');
    const asramaDiLingkup = new Set(lingkup.filter((s) => s.dormitory).map((s) => s.dormitory.id));

    // Absensi hari ini. Santri yang sedang izin dan belum dicatat dihitung sebagai izin,
    // bukan "belum dilaporkan", karena ketidakhadirannya sudah diketahui.
    let hadir = 0;
    let terlambat = 0;
    let izinDicatat = 0;
    const alpa = [];
    const belumDilaporkan = [];
    lingkup.forEach((s) => {
      const catatan = absensiPer.get(s.id);
      const rekam = catatan ? catatan.hadir + catatan.terlambat + catatan.izin + catatan.alpa : 0;
      if (catatan && catatan.hadir > 0) hadir += 1;
      else if (catatan && catatan.terlambat > 0) terlambat += 1;
      else if (catatan && catatan.izin > 0) izinDicatat += 1;
      if (catatan && catatan.alpa > 0 && catatan.hadir === 0 && catatan.terlambat === 0) alpa.push(s);
      if (!rekam && !izinPer.has(s.id)) belumDilaporkan.push(s);
    });
    const ringkasSantri = (s) => ({ id: s.id, name: s.name, dormitory: s.dormitory ? s.dormitory.name : null });

    // Masalah: paspor dan iqamah dihitung, sisanya dibaca dari catatan admin.
    const baris = new Map(masalah.map((row) => [`${row.student_id}|${row.kind}|${row.ref}`, row]));
    const daftar = [];
    const tambah = (s, jenis, ref, tingkat, judul, detail, row) => {
      daftar.push({
        key: `${s.id}|${jenis}|${ref}`,
        studentId: s.id,
        studentName: s.name,
        dormitory: s.dormitory ? s.dormitory.name : null,
        country: s.country,
        level: s.level,
        kind: jenis,
        kindLabel: JENIS[jenis].label,
        ref,
        severity: tingkat,
        title: judul,
        detail,
        status: row ? row.status : 'baru',
        note: row ? row.note : '',
        dueOn: row ? row.due_on : null,
        since: row ? new Date(row.created_at).toISOString() : null,
        updatedAt: row ? new Date(row.updated_at).toISOString() : null,
        caseId: row ? row.id : null
      });
    };
    for (const s of lingkup) {
      const v = visaPer.get(s.id);
      if (v && v.paspor) {
        const sisa = selisihHari(hariIni, v.paspor);
        if (sisa <= PASPOR_PERINGATAN_HARI) {
          tambah(s, 'paspor', v.paspor, sisa <= PASPOR_SEGERA_HARI ? 'tinggi' : 'sedang',
            sisa < 0 ? 'Paspor sudah habis' : `Paspor habis dalam ${sisa} hari`,
            `${sisa < 0 ? 'Habis' : 'Berlaku sampai'} ${tanggalBaca(v.paspor)}. Perpanjangan iqamah butuh paspor berlaku minimal enam bulan.`,
            baris.get(`${s.id}|paspor|${v.paspor}`));
        }
      }
      if (v && v.iqamah) {
        const sisa = selisihHari(hariIni, v.iqamah);
        if (sisa <= IQAMAH_PERINGATAN_HARI) {
          tambah(s, 'iqamah', v.iqamah, sisa <= IQAMAH_SEGERA_HARI ? 'tinggi' : 'sedang',
            sisa < 0 ? 'Iqamah sudah habis' : `Iqamah habis dalam ${sisa} hari`,
            `${sisa < 0 ? 'Habis' : 'Berlaku sampai'} ${tanggalBaca(v.iqamah)}.`,
            baris.get(`${s.id}|iqamah|${v.iqamah}`));
        }
      }
    }
    for (const row of masalah) {
      if (row.source !== 'manual') continue;
      const s = diLingkup.get(row.student_id);
      if (!s) continue;
      tambah(s, row.kind, row.ref, 'sedang', JENIS[row.kind].label, row.note || 'Belum ada catatan.', row);
    }

    // Hitungan per status dihitung sebelum filter status, supaya tab status menunjukkan jumlah
    // yang benar. Filter jenis ikut menyempitkan hitungan, karena dipilih bersama yang lain.
    const dasar = daftar.filter((item) => !filter.jenis || item.kind === filter.jenis);
    const hitungStatus = Object.fromEntries(STATUS.map((nama) => [nama, dasar.filter((item) => item.status === nama).length]));
    const hitungJenis = Object.fromEntries(Object.keys(JENIS).map((nama) => [nama, daftar.filter((item) => item.kind === nama && (filter.status === 'semua' || (filter.status === 'aktif' ? item.status !== 'selesai' : item.status === filter.status))).length]));
    const tampil = dasar.filter((item) => (filter.status === 'semua'
      || (filter.status === 'aktif' ? item.status !== 'selesai' : item.status === filter.status)));
    tampil.sort((a, b) => (STATUS.indexOf(a.status) === 2) - (STATUS.indexOf(b.status) === 2)
      || URUTAN_TINGKAT[a.severity] - URUTAN_TINGKAT[b.severity]
      || a.studentName.localeCompare(b.studentName, 'id-ID'));

    return {
      ok: true,
      value: {
        generatedAt: saatIni.toISOString(),
        today: hariIni,
        healthEnabled: kesehatan,
        filter,
        totals: {
          activeStudents: lingkup.length,
          onLeave: sedangIzin.length,
          sick: sedangSakit.length,
          dormitories: asramaDiLingkup.size,
          supervisors: musyrif[0] ? musyrif[0].jumlah : 0,
          truncated: terpotong
        },
        attendanceToday: {
          recordedStudents: lingkup.filter((s) => absensiPer.has(s.id)).length,
          present: hadir,
          late: terlambat,
          excused: izinDicatat,
          absent: alpa.length,
          notReported: belumDilaporkan.length,
          onLeaveUnrecorded: sedangIzin.filter((s) => !absensiPer.has(s.id)).length,
          absentStudents: alpa.slice(0, DAFTAR_NAMA_PENDEK).map(ringkasSantri),
          notReportedStudents: belumDilaporkan.slice(0, DAFTAR_NAMA_PENDEK).map(ringkasSantri)
        },
        cases: { items: tampil, counts: hitungStatus, byKind: hitungJenis },
        options: {
          countries: negaraAda,
          dormitories: pilihanAsrama,
          levels: jenjangAda,
          students: semua.map((s) => ({ id: s.id, name: s.name, dormitory: s.dormitory ? s.dormitory.name : null })),
          kinds: Object.entries(JENIS).map(([id, info]) => ({ id, label: info.label })),
          statuses: [
            { id: 'aktif', label: 'Belum selesai' },
            { id: 'baru', label: 'Baru' },
            { id: 'diproses', label: 'Sedang diproses' },
            { id: 'selesai', label: 'Selesai' },
            { id: 'semua', label: 'Semua' }
          ]
        }
      }
    };
  }

  async function santriAktif(studentId) {
    const rows = await ambil(`SELECT id FROM students WHERE id = $1 AND status = 'active'`, [studentId]);
    return rows.length > 0;
  }

  // Masalah manual: lapor diri, lapor pendidikan, status pendidikan. { studentId, kind, note, dueOn }.
  async function create(input, actor) {
    if (!actor || actor.role !== ADMIN_ROLE) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };
    const sumber = input || {};
    const jenis = bersih(sumber.kind, 40);
    const catatan = bersih(sumber.note, 500);
    const batas = sumber.dueOn ? String(sumber.dueOn) : null;
    if (!JENIS[jenis] || JENIS[jenis].otomatis) return { ok: false, status: 422, error: 'Jenis masalah belum valid.' };
    if (catatan.length < 3) return { ok: false, status: 422, error: 'Tulis catatan singkat tentang masalahnya.' };
    if (batas && !isTanggal(batas)) return { ok: false, status: 422, error: 'Tanggal batas belum valid.' };
    if (!/^[\w-]{8,64}$/.test(String(sumber.studentId || '')) || !(await santriAktif(sumber.studentId))) {
      return { ok: false, status: 404, error: 'Santri aktif tidak ditemukan.' };
    }
    const id = crypto.randomUUID();
    try {
      await ambil(
        `INSERT INTO student_cases (id, student_id, kind, ref, source, status, note, due_on, created_by_account_id, updated_by_account_id)
         VALUES ($1::uuid, $2, $3, $1::text, 'manual', 'baru', $4, $5, $6, $6)`,
        [id, sumber.studentId, jenis, catatan, batas, actor.id || null]
      );
    } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 503, error: TABEL_BELUM_ADA };
      throw error;
    }
    return { ok: true, value: { caseId: id, studentId: sumber.studentId, kind: jenis, status: 'baru' } };
  }

  // Ubah status satu masalah: { studentId, kind, ref, status, note }. Untuk paspor dan iqamah
  // barisnya dibuat saat pertama kali diubah.
  async function setStatus(input, actor) {
    if (!actor || actor.role !== ADMIN_ROLE) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };
    const sumber = input || {};
    const jenis = bersih(sumber.kind, 40);
    const ref = bersih(sumber.ref, 40);
    const status = bersih(sumber.status, 20);
    const catatan = sumber.note === undefined ? null : bersih(sumber.note, 500);
    if (!JENIS[jenis]) return { ok: false, status: 422, error: 'Jenis masalah belum valid.' };
    if (!STATUS.includes(status)) return { ok: false, status: 422, error: 'Status belum valid.' };
    if (JENIS[jenis].otomatis && !isTanggal(ref)) return { ok: false, status: 422, error: 'Masalah ini belum dikenali.' };
    if (!/^[\w-]{8,64}$/.test(String(sumber.studentId || '')) || !(await santriAktif(sumber.studentId))) {
      return { ok: false, status: 404, error: 'Santri aktif tidak ditemukan.' };
    }
    try {
      if (JENIS[jenis].otomatis) {
        const hasil = await ambil(
          `INSERT INTO student_cases (id, student_id, kind, ref, source, status, note, created_by_account_id, updated_by_account_id, resolved_at)
           VALUES ($1, $2, $3, $4, 'otomatis', $5, coalesce($6::text, ''), $7, $7, CASE WHEN $5::text = 'selesai' THEN now() ELSE NULL END)
           ON CONFLICT (student_id, kind, ref) DO UPDATE
             SET status = EXCLUDED.status,
                 note = coalesce($6::text, student_cases.note),
                 updated_by_account_id = EXCLUDED.updated_by_account_id,
                 resolved_at = CASE WHEN EXCLUDED.status = 'selesai' THEN now() ELSE NULL END,
                 updated_at = now()
           RETURNING id`,
          [crypto.randomUUID(), sumber.studentId, jenis, ref, status, catatan, actor.id || null]
        );
        return { ok: true, value: { caseId: hasil[0].id, status } };
      }
      const hasil = await ambil(
        `UPDATE student_cases
         SET status = $4::text, note = coalesce($5::text, note), updated_by_account_id = $6,
             resolved_at = CASE WHEN $4::text = 'selesai' THEN now() ELSE NULL END, updated_at = now()
         WHERE student_id = $1 AND kind = $2 AND ref = $3
         RETURNING id`,
        [sumber.studentId, jenis, ref, status, catatan, actor.id || null]
      );
      if (!hasil.length) return { ok: false, status: 404, error: 'Masalah tidak ditemukan.' };
      return { ok: true, value: { caseId: hasil[0].id, status } };
    } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 503, error: TABEL_BELUM_ADA };
      throw error;
    }
  }

  return Object.freeze({ overview, create, setStatus });
}

module.exports = { createCentralMonitoringService, negaraDariWilayah, JENIS };
