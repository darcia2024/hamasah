'use strict';
// Monitoring pusat untuk admin: kondisi seluruh santri dan asrama dalam satu respons, tanpa
// membuka profil satu per satu.
//
// Isinya:
//   1. Angka hari ini: santri aktif, izin, sakit, asrama, dan musyrif aktif.
//   2. Absensi hari ini: ringkasan, rincian per kegiatan dan per waktu sholat, serta asrama
//      mana yang sudah dan belum diisi musyrifnya. Absensi diisi musyrif di halaman Presensi
//      asrama; di sini hanya dibaca.
//   3. Urusan administrasi santri: paspor, iqamah, lapor diri, lapor pendidikan, dan status
//      pendidikan, masing-masing berstatus baru, diproses, atau selesai (student_cases,
//      migrasi 056).
//
// Paspor dan iqamah dihitung dari visa_tracking dan terhitung mundur ke tanggal habisnya.
// Lapor diri, lapor pendidikan, dan status pendidikan diisi musyrif asramanya (atau admin)
// dengan batas waktu, lalu dihitung mundur dari batas itu. Semua angka berasal dari catatan
// yang benar-benar ada.

const crypto = require('node:crypto');
const { kelompokProgram } = require('./admin-overview-service.js');

const ADMIN_ROLE = 'admin';
const SUPERVISOR_ROLE = 'supervisor';
const HARI_MS = 24 * 60 * 60 * 1000;
const BATAS_SANTRI = 1000;
const PASPOR_PERINGATAN_HARI = 180;
const PASPOR_SEGERA_HARI = 60;
const IQAMAH_PERINGATAN_HARI = 30;
const IQAMAH_SEGERA_HARI = 14;
const MANUAL_SEGERA_HARI = 7;
const SAKIT_MAKS_HARI = 3;
const SELESAI_TAMPIL_HARI = 30;
const DAFTAR_NAMA_PENDEK = 200;
const SHOLAT = Object.freeze(['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya']);
const NEGARA = Object.freeze(['Mesir', 'Indonesia']);
const TABEL_BELUM_ADA = 'Database belum diperbarui untuk monitoring pusat. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';

const JENIS = Object.freeze({
  paspor: { label: 'Paspor hampir kedaluwarsa', otomatis: true },
  iqamah: { label: 'Iqamah bermasalah', otomatis: true },
  'lapor-diri': { label: 'Lapor diri', otomatis: false },
  'lapor-pendidikan': { label: 'Lapor pendidikan', otomatis: false },
  'status-pendidikan': { label: 'Status pendidikan', otomatis: false }
});
const STATUS = Object.freeze(['baru', 'diproses', 'selesai']);
const URUTAN_TINGKAT = Object.freeze({ tinggi: 0, sedang: 1 });

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

// Dipakai hanya bila kolom country belum ada (migrasi 057 belum diterapkan). Ketat: hanya
// wilayah yang jelas menyebut Indonesia; selebihnya Mesir, tempat Hamasah berpusat.
function negaraDariWilayah(area) {
  return /indonesia/i.test(String(area || '')) ? 'Indonesia' : 'Mesir';
}

function tabelBelumAda(error) {
  return Boolean(error) && (error.code === '42P01' || (/student_cases/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''))));
}

function kolomBelumAda(error) {
  return Boolean(error) && (error.code === '42703' || /column .*country.* does not exist/i.test(String(error.message || '')));
}

function createCentralMonitoringService({ database, healthEnabled: kesehatanAktif = false, staffDormitories = async () => [], now = () => new Date() } = {}) {
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

  async function bacaAsrama() {
    try {
      return { rows: await ambil('SELECT id, name, area, country FROM dormitories ORDER BY name'), kolomNegara: true };
    } catch (error) {
      if (!kolomBelumAda(error)) throw error;
      const rows = await ambil('SELECT id, name, area FROM dormitories ORDER BY name');
      return { rows: rows.map((row) => ({ ...row, country: negaraDariWilayah(row.area) })), kolomNegara: false };
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

  // Judul dan tingkat satu urusan manual dengan hitung mundur. sisa negatif berarti sudah lewat.
  function butirManual(row, hariIni) {
    const sisa = row.due_on ? selisihHari(hariIni, row.due_on) : null;
    const label = JENIS[row.kind].label;
    let tingkat = 'sedang';
    let judul = label;
    if (sisa !== null) {
      tingkat = sisa <= MANUAL_SEGERA_HARI ? 'tinggi' : 'sedang';
      judul = sisa < 0 ? `${label}: terlambat ${-sisa} hari` : sisa === 0 ? `${label}: batas hari ini` : `${label}: sisa ${sisa} hari`;
    }
    const detail = [row.note, row.due_on ? `Batas ${tanggalBaca(row.due_on)}.` : ''].filter(Boolean).join(' ');
    return { tingkat, judul, detail: detail || 'Belum ada catatan.', sisa };
  }

  function bentukButir(s, jenis, ref, tingkat, judul, detail, sisa, row) {
    return {
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
      daysLeft: sisa,
      status: row ? row.status : 'baru',
      note: row ? row.note : '',
      dueOn: row ? row.due_on : null,
      since: row ? new Date(row.created_at).toISOString() : null,
      updatedAt: row ? new Date(row.updated_at).toISOString() : null,
      recordedBy: row ? row.by_name || null : null,
      caseId: row ? row.id : null
    };
  }

  const SELECT_MASALAH = `SELECT c.id, c.student_id, c.kind, c.ref, c.source, c.status, c.note,
                to_char(c.due_on, 'YYYY-MM-DD') AS due_on, c.created_at, c.updated_at, c.resolved_at, acc.name AS by_name
         FROM student_cases c LEFT JOIN accounts acc ON acc.id = c.created_by_account_id`;

  function urutkan(daftar) {
    return daftar.sort((a, b) => (a.status === 'selesai') - (b.status === 'selesai')
      || URUTAN_TINGKAT[a.severity] - URUTAN_TINGKAT[b.severity]
      || (a.daysLeft === null ? 9999 : a.daysLeft) - (b.daysLeft === null ? 9999 : b.daysLeft)
      || a.studentName.localeCompare(b.studentName, 'id-ID'));
  }

  function cocokStatus(item, status) {
    return status === 'semua' || (status === 'aktif' ? item.status !== 'selesai' : item.status === status);
  }

  async function overview(actor, query) {
    if (!actor || actor.role !== ADMIN_ROLE) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };
    return hitung(query);
  }

  // Urusan administrasi penghuni satu asrama, untuk tab Masalah di Kelola Asrama. Musyrif
  // hanya melihat asrama yang dipegangnya. Status paspor dan iqamah tetap diubah admin.
  async function dormitoryCases(dormitoryId, actor) {
    if (!pelakuStaf(actor)) return { ok: false, status: 403, error: 'Akses musyrif atau admin diperlukan.' };
    if (!/^[\w-]{8,64}$/.test(String(dormitoryId || ''))) return { ok: false, status: 404, error: 'Asrama tidak ditemukan.' };
    const milik = await asramaBoleh(actor);
    if (milik !== null && !milik.includes(dormitoryId)) return { ok: false, status: 403, error: 'Asrama ini bukan asrama yang Anda pegang.' };
    const hasil = await hitung({ dormitoryId, status: 'semua' });
    if (!hasil.ok) return hasil;
    const { items, counts, urgent } = hasil.value.cases;
    return { ok: true, value: { today: hasil.value.today, items, counts, urgent, canChangeStatus: actor.role === ADMIN_ROLE } };
  }

  async function hitung(query) {
    const filter = bacaFilter(query);
    const saatIni = now();
    const hariIni = tanggalJakarta(saatIni);
    const kesehatan = Boolean(typeof kesehatanAktif === 'function' ? await kesehatanAktif() : kesehatanAktif);
    const sejakSakit = new Date(saatIni.getTime() - SAKIT_MAKS_HARI * HARI_MS).toISOString().slice(0, 10);

    const [santri, asramaBaca, musyrif, pembina, izin, sakit, kegiatan, sholat, visa, masalah, cuti] = await Promise.all([
      ambil(
        `SELECT id, name, program, gender, dormitory_id FROM students
         WHERE status = 'active' ORDER BY name LIMIT $1`,
        [BATAS_SANTRI + 1]
      ),
      bacaAsrama(),
      ambil(`SELECT count(*)::int AS jumlah FROM accounts WHERE role = 'supervisor' AND active`),
      ambil(
        `SELECT a.dormitory_id, acc.name FROM staff_dormitory_assignments a
         JOIN accounts acc ON acc.id = a.account_id WHERE acc.active ORDER BY acc.name`
      ),
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
      ambil('SELECT student_id, category, status FROM student_attendance WHERE session_date = $1', [hariIni]),
      ambilBoleh('SELECT student_id, prayer, status FROM student_prayer_logs WHERE prayer_date = $1', [hariIni]),
      ambil(
        `SELECT student_id, to_char(passport_expires_at, 'YYYY-MM-DD') AS paspor,
                to_char(visa_expires_at, 'YYYY-MM-DD') AS iqamah
         FROM visa_tracking`
      ),
      ambilBoleh(SELECT_MASALAH),
      // Santri cuti atau izin panjang tidak dihitung aktif, tapi tempatnya ditahan; angkanya dipisah.
      ambil(`SELECT id, program, dormitory_id FROM students WHERE status = 'leave'`)
    ]);

    const terpotong = santri.length > BATAS_SANTRI;
    if (terpotong) santri.length = BATAS_SANTRI;

    const asramaPer = new Map(asramaBaca.rows.map((row) => [row.id, { id: row.id, name: row.name, country: row.country }]));
    const pembinaPer = new Map();
    pembina.forEach((row) => {
      if (!pembinaPer.has(row.dormitory_id)) pembinaPer.set(row.dormitory_id, []);
      pembinaPer.get(row.dormitory_id).push(row.name);
    });
    const izinPer = new Map(izin.map((row) => [row.student_id, row.kind]));
    const sakitPer = new Set(sakit.filter((row) => row.condition && row.condition !== 'sehat').map((row) => row.student_id));
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

    // Absensi hari ini. Catatan kegiatan dan sholat dikelompokkan per santri lebih dulu.
    const kegiatanPer = new Map();
    kegiatan.forEach((row) => {
      if (!diLingkup.has(row.student_id)) return;
      if (!kegiatanPer.has(row.student_id)) kegiatanPer.set(row.student_id, []);
      kegiatanPer.get(row.student_id).push(row);
    });
    const sholatPer = new Map();
    sholat.forEach((row) => {
      if (!diLingkup.has(row.student_id)) return;
      if (!sholatPer.has(row.student_id)) sholatPer.set(row.student_id, []);
      sholatPer.get(row.student_id).push(row);
    });

    // Satu santri masuk tepat satu golongan menurut catatan kegiatan hari ini: hadir bila ada
    // yang hadir, lalu terlambat, lalu izin, lalu tidak hadir. Yang tidak punya catatan
    // kegiatan dan sedang izin dihitung izin; selebihnya belum dilaporkan.
    let hadir = 0;
    let terlambat = 0;
    let izinDicatat = 0;
    let izinTanpaCatatan = 0;
    const alpa = [];
    const belumDilaporkan = [];
    lingkup.forEach((s) => {
      const catatan = kegiatanPer.get(s.id) || [];
      const ada = (status) => catatan.some((row) => row.status === status);
      if (ada('present')) hadir += 1;
      else if (ada('late')) terlambat += 1;
      else if (ada('excused')) izinDicatat += 1;
      else if (ada('absent')) alpa.push(s);
      else if (izinPer.has(s.id)) izinTanpaCatatan += 1;
      else belumDilaporkan.push(s);
    });
    const ringkasSantri = (s) => ({ id: s.id, name: s.name, dormitory: s.dormitory ? s.dormitory.name : null });

    const totalAsrama = asramaDiLingkup.size;
    const asramaSantri = (s) => (s.dormitory ? s.dormitory.id : null);
    // Rincian per kegiatan: satu baris per kategori yang dicatat hari ini.
    const perKegiatan = new Map();
    kegiatanPer.forEach((baris, id) => {
      const s = diLingkup.get(id);
      baris.forEach((row) => {
        if (!perKegiatan.has(row.category)) perKegiatan.set(row.category, { category: row.category, present: 0, late: 0, excused: 0, absent: 0, dorms: new Set() });
        const butir = perKegiatan.get(row.category);
        if (butir[row.status] !== undefined) butir[row.status] += 1;
        if (asramaSantri(s)) butir.dorms.add(asramaSantri(s));
      });
    });
    const activities = [...perKegiatan.values()]
      .map((b) => ({ category: b.category, present: b.present, late: b.late, excused: b.excused, absent: b.absent, total: b.present + b.late + b.excused + b.absent, dormitoriesFilled: b.dorms.size, dormitoriesTotal: totalAsrama }))
      .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, 'id-ID'));
    // Rincian sholat: lima waktu, selalu ditampilkan walau belum diisi.
    const perSholat = new Map(SHOLAT.map((nama) => [nama, { prayer: nama, berjamaah: 0, munfarid: 0, tidak: 0, izin: 0, dorms: new Set() }]));
    sholatPer.forEach((baris, id) => {
      const s = diLingkup.get(id);
      baris.forEach((row) => {
        const butir = perSholat.get(row.prayer);
        if (!butir || butir[row.status] === undefined) return;
        butir[row.status] += 1;
        if (asramaSantri(s)) butir.dorms.add(asramaSantri(s));
      });
    });
    const prayers = [...perSholat.values()].map((b) => ({
      prayer: b.prayer, berjamaah: b.berjamaah, munfarid: b.munfarid, tidak: b.tidak, izin: b.izin,
      total: b.berjamaah + b.munfarid + b.tidak + b.izin, dormitoriesFilled: b.dorms.size, dormitoriesTotal: totalAsrama
    }));
    // Per asrama: siapa musyrifnya dan seberapa jauh sudah diisi, supaya admin tahu siapa yang perlu diingatkan.
    const perAsrama = new Map();
    lingkup.forEach((s) => {
      if (!s.dormitory) return;
      if (!perAsrama.has(s.dormitory.id)) {
        perAsrama.set(s.dormitory.id, {
          id: s.dormitory.id, name: s.dormitory.name, country: s.country, supervisors: pembinaPer.get(s.dormitory.id) || [],
          students: 0, notReported: 0, activitiesFilled: new Set(), prayersFilled: new Set(), notReportedStudents: []
        });
      }
      const butir = perAsrama.get(s.dormitory.id);
      butir.students += 1;
      (kegiatanPer.get(s.id) || []).forEach((row) => butir.activitiesFilled.add(row.category));
      (sholatPer.get(s.id) || []).forEach((row) => butir.prayersFilled.add(row.prayer));
    });
    belumDilaporkan.forEach((s) => {
      if (s.dormitory && perAsrama.has(s.dormitory.id)) {
        const butir = perAsrama.get(s.dormitory.id);
        butir.notReported += 1;
        butir.notReportedStudents.push({ id: s.id, name: s.name });
      }
    });
    const dormitoriesToday = [...perAsrama.values()].map((b) => ({
      id: b.id, name: b.name, country: b.country, supervisors: b.supervisors, students: b.students,
      reported: b.students - b.notReported, notReported: b.notReported,
      activitiesFilled: b.activitiesFilled.size, prayersFilled: b.prayersFilled.size, notReportedStudents: b.notReportedStudents
    })).sort((a, b) => b.notReported - a.notReported || a.name.localeCompare(b.name, 'id-ID'));

    // Masalah: paspor dan iqamah dihitung, sisanya dibaca dari catatan musyrif dan admin.
    const baris = new Map(masalah.map((row) => [`${row.student_id}|${row.kind}|${row.ref}`, row]));
    const daftar = [];
    for (const s of lingkup) {
      const v = visaPer.get(s.id);
      if (v && v.paspor) {
        const sisa = selisihHari(hariIni, v.paspor);
        if (sisa <= PASPOR_PERINGATAN_HARI) {
          daftar.push(bentukButir(s, 'paspor', v.paspor, sisa <= PASPOR_SEGERA_HARI ? 'tinggi' : 'sedang',
            sisa < 0 ? `Paspor sudah habis ${-sisa} hari lalu` : `Paspor: sisa ${sisa} hari`,
            `${sisa < 0 ? 'Habis' : 'Berlaku sampai'} ${tanggalBaca(v.paspor)}. Perpanjangan iqamah butuh paspor berlaku minimal enam bulan.`,
            sisa, baris.get(`${s.id}|paspor|${v.paspor}`)));
        }
      }
      if (v && v.iqamah) {
        const sisa = selisihHari(hariIni, v.iqamah);
        if (sisa <= IQAMAH_PERINGATAN_HARI) {
          daftar.push(bentukButir(s, 'iqamah', v.iqamah, sisa <= IQAMAH_SEGERA_HARI ? 'tinggi' : 'sedang',
            sisa < 0 ? `Iqamah sudah habis ${-sisa} hari lalu` : `Iqamah: sisa ${sisa} hari`,
            `${sisa < 0 ? 'Habis' : 'Berlaku sampai'} ${tanggalBaca(v.iqamah)}.`,
            sisa, baris.get(`${s.id}|iqamah|${v.iqamah}`)));
        }
      }
    }
    const batasSelesai = new Date(saatIni.getTime() - SELESAI_TAMPIL_HARI * HARI_MS);
    for (const row of masalah) {
      if (row.source !== 'manual') continue;
      const s = diLingkup.get(row.student_id);
      if (!s) continue;
      if (row.status === 'selesai' && row.resolved_at && new Date(row.resolved_at) < batasSelesai) continue;
      const m = butirManual(row, hariIni);
      daftar.push(bentukButir(s, row.kind, row.ref, m.tingkat, m.judul, m.detail, m.sisa, row));
    }

    // Hitungan per status dihitung sebelum filter status, supaya tab status menunjukkan jumlah
    // yang benar. Filter jenis ikut menyempitkan hitungan, karena dipilih bersama yang lain.
    const dasar = daftar.filter((item) => !filter.jenis || item.kind === filter.jenis);
    const hitungStatus = Object.fromEntries(STATUS.map((nama) => [nama, dasar.filter((item) => item.status === nama).length]));
    const hitungJenis = Object.fromEntries(Object.keys(JENIS).map((nama) => [nama, daftar.filter((item) => item.kind === nama && cocokStatus(item, filter.status)).length]));
    const tampil = urutkan(dasar.filter((item) => cocokStatus(item, filter.status)));
    const segera = daftar.filter((item) => item.status !== 'selesai' && item.severity === 'tinggi').length;

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
          onLongLeave: cuti.filter((row) => {
            const tempat = row.dormitory_id ? asramaPer.get(row.dormitory_id) : null;
            const negara = tempat ? tempat.country : 'Belum berasrama';
            return (!filter.negara || negara === filter.negara) && (!filter.asrama || row.dormitory_id === filter.asrama) && (!filter.jenjang || kelompokProgram(row.program) === filter.jenjang);
          }).length,
          homeLeave: sedangIzin.filter((s) => izinPer.get(s.id) === 'pulang-indonesia').length,
          sick: sedangSakit.length,
          dormitories: totalAsrama,
          supervisors: musyrif[0] ? musyrif[0].jumlah : 0,
          truncated: terpotong
        },
        attendanceToday: {
          recordedStudents: lingkup.length - belumDilaporkan.length - izinTanpaCatatan,
          present: hadir,
          late: terlambat,
          excused: izinDicatat,
          absent: alpa.length,
          notReported: belumDilaporkan.length,
          onLeaveUnrecorded: izinTanpaCatatan,
          absentStudents: alpa.slice(0, DAFTAR_NAMA_PENDEK).map(ringkasSantri),
          activities,
          prayers,
          dormitories: dormitoriesToday
        },
        cases: { items: tampil, counts: hitungStatus, byKind: hitungJenis, urgent: segera },
        options: {
          countries: negaraAda,
          dormitories: pilihanAsrama,
          allDormitories: [...asramaPer.values()].sort((a, b) => a.name.localeCompare(b.name, 'id-ID')),
          countrySettable: asramaBaca.kolomNegara,
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

  // Asrama yang boleh disentuh pelaku: admin semua (null), musyrif yang dipegangnya.
  async function asramaBoleh(actor) {
    return actor.role === SUPERVISOR_ROLE ? (await staffDormitories(actor.id)) || [] : null;
  }

  async function santriBoleh(studentId, actor) {
    if (!/^[\w-]{8,64}$/.test(String(studentId || ''))) return false;
    const rows = await ambil(`SELECT dormitory_id FROM students WHERE id = $1 AND status = 'active'`, [studentId]);
    if (!rows.length) return false;
    const milik = await asramaBoleh(actor);
    return milik === null || (rows[0].dormitory_id !== null && milik.includes(rows[0].dormitory_id));
  }

  function pelakuStaf(actor) {
    return Boolean(actor && [ADMIN_ROLE, SUPERVISOR_ROLE].includes(actor.role));
  }

  // Urusan yang dicatat musyrif untuk santri di asramanya (admin: semua): lapor diri, lapor
  // pendidikan, status pendidikan, dengan hitung mundur. Dipakai kartu "Urusan administrasi".
  async function urusan(actor) {
    if (!pelakuStaf(actor)) return { ok: false, status: 403, error: 'Akses musyrif atau admin diperlukan.' };
    const saatIni = now();
    const hariIni = tanggalJakarta(saatIni);
    const milik = await asramaBoleh(actor);
    const santri = await ambil(
      `SELECT s.id, s.name, s.program, s.dormitory_id, d.name AS dormitory
       FROM students s LEFT JOIN dormitories d ON d.id = s.dormitory_id
       WHERE s.status = 'active' AND ($1::uuid[] IS NULL OR s.dormitory_id = ANY($1::uuid[])) ORDER BY s.name`,
      [milik]
    );
    const peta = new Map(santri.map((row) => [row.id, {
      id: row.id, name: row.name, level: kelompokProgram(row.program), country: '', dormitory: row.dormitory ? { id: row.dormitory_id, name: row.dormitory } : null
    }]));
    const masalah = peta.size ? await ambilBoleh(`${SELECT_MASALAH} WHERE c.source = 'manual' AND c.student_id = ANY($1::uuid[])`, [[...peta.keys()]]) : [];
    const batasSelesai = new Date(saatIni.getTime() - SELESAI_TAMPIL_HARI * HARI_MS);
    const items = urutkan(masalah
      .filter((row) => !(row.status === 'selesai' && row.resolved_at && new Date(row.resolved_at) < batasSelesai))
      .map((row) => {
        const m = butirManual(row, hariIni);
        return bentukButir(peta.get(row.student_id), row.kind, row.ref, m.tingkat, m.judul, m.detail, m.sisa, row);
      }));
    return {
      ok: true,
      value: {
        today: hariIni,
        items,
        students: santri.map((row) => ({ id: row.id, name: row.name, dormitory: row.dormitory })),
        kinds: Object.entries(JENIS).filter(([, info]) => !info.otomatis).map(([id, info]) => ({ id, label: info.label })),
        counts: Object.fromEntries(STATUS.map((nama) => [nama, items.filter((item) => item.status === nama).length]))
      }
    };
  }

  // Catat urusan baru: lapor diri, lapor pendidikan, status pendidikan. Batas waktu wajib,
  // karena hitung mundur dimulai dari situ. { studentId, kind, note, dueOn }.
  async function create(input, actor) {
    if (!pelakuStaf(actor)) return { ok: false, status: 403, error: 'Akses musyrif atau admin diperlukan.' };
    const sumber = input || {};
    const jenis = bersih(sumber.kind, 40);
    const catatan = bersih(sumber.note, 500);
    const batas = sumber.dueOn ? String(sumber.dueOn) : '';
    if (!JENIS[jenis] || JENIS[jenis].otomatis) return { ok: false, status: 422, error: 'Jenis urusan belum valid.' };
    if (!isTanggal(batas)) return { ok: false, status: 422, error: 'Isi batas waktunya, supaya hitung mundur bisa jalan.' };
    if (catatan.length < 3) return { ok: false, status: 422, error: 'Tulis catatan singkat tentang urusannya.' };
    if (!(await santriBoleh(sumber.studentId, actor))) return { ok: false, status: 404, error: 'Santri aktif tidak ditemukan.' };
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

  // Ubah status satu urusan: { studentId, kind, ref, status, note }. Untuk paspor dan iqamah
  // barisnya dibuat saat pertama kali diubah (hanya admin). Musyrif hanya mengubah urusan
  // manual untuk santri di asramanya.
  async function setStatus(input, actor) {
    if (!pelakuStaf(actor)) return { ok: false, status: 403, error: 'Akses musyrif atau admin diperlukan.' };
    const sumber = input || {};
    const jenis = bersih(sumber.kind, 40);
    const ref = bersih(sumber.ref, 40);
    const status = bersih(sumber.status, 20);
    const catatan = sumber.note === undefined ? null : bersih(sumber.note, 500);
    if (!JENIS[jenis]) return { ok: false, status: 422, error: 'Jenis urusan belum valid.' };
    if (!STATUS.includes(status)) return { ok: false, status: 422, error: 'Status belum valid.' };
    if (JENIS[jenis].otomatis && actor.role !== ADMIN_ROLE) return { ok: false, status: 403, error: 'Paspor dan iqamah diurus admin.' };
    if (JENIS[jenis].otomatis && !isTanggal(ref)) return { ok: false, status: 422, error: 'Masalah ini belum dikenali.' };
    if (!(await santriBoleh(sumber.studentId, actor))) return { ok: false, status: 404, error: 'Santri aktif tidak ditemukan.' };
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
      if (!hasil.length) return { ok: false, status: 404, error: 'Urusan tidak ditemukan.' };
      return { ok: true, value: { caseId: hasil[0].id, status } };
    } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 503, error: TABEL_BELUM_ADA };
      throw error;
    }
  }

  // Negara satu asrama, untuk saringan: { country }. Hanya admin.
  async function setCountry(dormitoryId, input, actor) {
    if (!actor || actor.role !== ADMIN_ROLE) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };
    const negara = bersih((input || {}).country, 20);
    if (!NEGARA.includes(negara)) return { ok: false, status: 422, error: 'Negara belum valid.' };
    if (!/^[\w-]{8,64}$/.test(String(dormitoryId || ''))) return { ok: false, status: 404, error: 'Asrama tidak ditemukan.' };
    try {
      const rows = await ambil('UPDATE dormitories SET country = $2, updated_at = now() WHERE id = $1 RETURNING id', [dormitoryId, negara]);
      if (!rows.length) return { ok: false, status: 404, error: 'Asrama tidak ditemukan.' };
    } catch (error) {
      if (kolomBelumAda(error)) return { ok: false, status: 503, error: TABEL_BELUM_ADA };
      throw error;
    }
    return { ok: true, value: { dormitoryId, country: negara } };
  }

  return Object.freeze({ overview, dormitoryCases, urusan, create, setStatus, setCountry });
}

module.exports = { createCentralMonitoringService, negaraDariWilayah, JENIS };
