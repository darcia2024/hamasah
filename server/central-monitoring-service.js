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
const { BAWAAN: BAWAAN_DOKUMEN } = require('./document-settings-service.js');

const ADMIN_ROLE = 'admin';
const SUPERVISOR_ROLE = 'supervisor';
const HARI_MS = 24 * 60 * 60 * 1000;
const BATAS_SANTRI = 1000;
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

// Absensi asrama dicatat musyrif menurut tanggal Kairo (halaman Presensi dan Kegiatan), jadi "absensi hari ini"
// juga dihitung dengan tanggal Kairo. Dokumen dan tenggat tetap memakai tanggal Jakarta.
function tanggalKairo(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(date);
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

function createCentralMonitoringService({ database, healthEnabled: kesehatanAktif = false, staffDormitories = async () => [], documentSettings = null, now = () => new Date() } = {}) {
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

  // Batas peringatan paspor dan iqamah dari pengaturan admin (migrasi 069); nilai bawaan bila belum ada.
  async function batasDokumen() {
    return documentSettings ? documentSettings.get() : { ...BAWAAN_DOKUMEN };
  }

  // Membaca urusan beserta penanggung jawab dan bukti (migrasi 069). Bila kolomnya belum ada, jatuh ke bacaan lama.
  async function bacaMasalah(kondisi = '', params = []) {
    try {
      return await ambilBoleh(`${SELECT_MASALAH} ${kondisi}`, params);
    } catch (error) {
      if (!error || error.code !== '42703') throw error;
      return ambilBoleh(`${SELECT_MASALAH_LAMA} ${kondisi}`, params);
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
      caseId: row ? row.id : null,
      assignee: row && row.assignee_account_id ? { id: row.assignee_account_id, name: row.assignee_name || null } : null,
      evidenceNote: row ? row.evidence_note || '' : '',
      evidenceFileId: row ? row.evidence_file_id || null : null,
      history: []
    };
  }

  const SELECT_MASALAH = `SELECT c.id, c.student_id, c.kind, c.ref, c.source, c.status, c.note,
                to_char(c.due_on, 'YYYY-MM-DD') AS due_on, c.created_at, c.updated_at, c.resolved_at, acc.name AS by_name,
                c.assignee_account_id, asg.name AS assignee_name, c.evidence_note, c.evidence_file_id
         FROM student_cases c LEFT JOIN accounts acc ON acc.id = c.created_by_account_id LEFT JOIN accounts asg ON asg.id = c.assignee_account_id`;
  const SELECT_MASALAH_LAMA = `SELECT c.id, c.student_id, c.kind, c.ref, c.source, c.status, c.note,
                to_char(c.due_on, 'YYYY-MM-DD') AS due_on, c.created_at, c.updated_at, c.resolved_at, acc.name AS by_name
         FROM student_cases c LEFT JOIN accounts acc ON acc.id = c.created_by_account_id`;

  // Riwayat singkat tiap tiket (lima kejadian terakhir), bila tabelnya sudah ada.
  async function lampirkanRiwayat(daftar) {
    const ids = daftar.map((item) => item.caseId).filter(Boolean);
    if (!ids.length) return;
    const rows = await ambilBoleh(
      `SELECT e.case_id, e.action, e.from_status, e.to_status, e.note, e.created_at, acc.name AS actor_name FROM student_case_events e
         LEFT JOIN accounts acc ON acc.id = e.actor_account_id WHERE e.case_id = ANY($1::uuid[]) ORDER BY e.created_at DESC`, [ids]
    ).catch(() => []);
    const peta = new Map();
    rows.forEach((row) => {
      const daftarEvent = peta.get(row.case_id) || [];
      if (daftarEvent.length < 5) daftarEvent.push({ action: row.action, from: row.from_status, to: row.to_status, note: row.note, at: new Date(row.created_at).toISOString(), by: row.actor_name || null });
      peta.set(row.case_id, daftarEvent);
    });
    daftar.forEach((item) => { if (item.caseId) item.history = peta.get(item.caseId) || []; });
  }

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
    const hariAsrama = tanggalKairo(saatIni);
    const batas = await batasDokumen();
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
      ambil('SELECT student_id, category, status FROM student_attendance WHERE session_date = $1', [hariAsrama]),
      ambilBoleh('SELECT student_id, prayer, status FROM student_prayer_logs WHERE prayer_date = $1', [hariAsrama]),
      ambil(
        `SELECT student_id, to_char(passport_expires_at, 'YYYY-MM-DD') AS paspor,
                to_char(visa_expires_at, 'YYYY-MM-DD') AS iqamah
         FROM visa_tracking`
      ),
      bacaMasalah(),
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
        if (sisa <= batas.passportWarningDays) {
          daftar.push(bentukButir(s, 'paspor', v.paspor, sisa <= batas.passportUrgentDays ? 'tinggi' : 'sedang',
            sisa < 0 ? `Paspor sudah habis ${-sisa} hari lalu` : `Paspor: sisa ${sisa} hari`,
            `${sisa < 0 ? 'Habis' : 'Berlaku sampai'} ${tanggalBaca(v.paspor)}. Perpanjangan iqamah butuh paspor berlaku minimal enam bulan. Peringatan muncul ${batas.passportWarningDays} hari sebelum habis.`,
            sisa, baris.get(`${s.id}|paspor|${v.paspor}`)));
        }
      }
      if (v && v.iqamah) {
        const sisa = selisihHari(hariIni, v.iqamah);
        if (sisa <= batas.iqamahWarningDays) {
          daftar.push(bentukButir(s, 'iqamah', v.iqamah, sisa <= batas.iqamahUrgentDays ? 'tinggi' : 'sedang',
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
    await lampirkanRiwayat(tampil);
    const petugas = await ambilBoleh(`SELECT id, name, role FROM accounts WHERE active AND role IN ('admin', 'supervisor') ORDER BY name`);
    const segera = daftar.filter((item) => item.status !== 'selesai' && item.severity === 'tinggi').length;

    return {
      ok: true,
      value: {
        generatedAt: saatIni.toISOString(),
        today: hariIni,
        attendanceDate: hariAsrama,
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
          staff: petugas.map((p) => ({ id: p.id, name: p.name, role: p.role })),
          documentAlerts: batas,
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
    const masalah = peta.size ? await bacaMasalah(`WHERE c.source = 'manual' AND c.student_id = ANY($1::uuid[])`, [[...peta.keys()]]) : [];
    const batasSelesai = new Date(saatIni.getTime() - SELESAI_TAMPIL_HARI * HARI_MS);
    const items = urutkan(masalah
      .filter((row) => !(row.status === 'selesai' && row.resolved_at && new Date(row.resolved_at) < batasSelesai))
      .map((row) => {
        const m = butirManual(row, hariIni);
        return bentukButir(peta.get(row.student_id), row.kind, row.ref, m.tingkat, m.judul, m.detail, m.sisa, row);
      }));
    await lampirkanRiwayat(items);
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

  // Penanggung jawab harus akun admin atau musyrif yang aktif. Mengembalikan id, null (kosongkan), atau false (tidak sah).
  async function petugasSah(id) {
    if (id === undefined) return undefined;
    if (id === null || id === '') return null;
    if (!/^[\w-]{8,64}$/.test(String(id))) return false;
    const rows = await ambil(`SELECT id FROM accounts WHERE id = $1 AND active AND role IN ('admin', 'supervisor')`, [id]);
    return rows.length ? rows[0].id : false;
  }

  // Bukti penyelesaian berupa berkas harus diunggah untuk santri yang sama lewat tujuan 'case-evidence'.
  async function berkasBuktiSah(fileId, studentId) {
    if (fileId === undefined || fileId === null || fileId === '') return null;
    if (!/^[\w-]{8,64}$/.test(String(fileId))) return false;
    const rows = await ambil(`SELECT id FROM file_objects WHERE id = $1 AND purpose = 'case-evidence' AND entity_id = $2 AND status = 'ready'`, [fileId, String(studentId)]);
    return rows.length ? rows[0].id : false;
  }

  async function catatKejadian(caseId, action, dariStatus, keStatus, catatan, actor) {
    try {
      await ambil(
        `INSERT INTO student_case_events (id, case_id, action, from_status, to_status, note, actor_account_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [crypto.randomUUID(), caseId, action, dariStatus, keStatus, bersih(catatan, 500), actor.id || null]
      );
    } catch (error) {
      if (!error || !['42P01', '42703'].includes(error.code)) throw error;
    }
  }

  // Catat urusan baru (tiket tindak lanjut): lapor diri, lapor pendidikan, status pendidikan. Batas waktu wajib,
  // karena hitung mundur dimulai dari situ. { studentId, kind, note, dueOn, assigneeAccountId? }.
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
    const penanggung = await petugasSah(sumber.assigneeAccountId);
    if (penanggung === false) return { ok: false, status: 422, error: 'Penanggung jawab harus akun admin atau musyrif yang aktif.' };
    const id = crypto.randomUUID();
    try {
      try {
        await ambil(
          `INSERT INTO student_cases (id, student_id, kind, ref, source, status, note, due_on, created_by_account_id, updated_by_account_id, assignee_account_id)
           VALUES ($1::uuid, $2, $3, $1::text, 'manual', 'baru', $4, $5, $6, $6, $7)`,
          [id, sumber.studentId, jenis, catatan, batas, actor.id || null, penanggung || null]
        );
      } catch (error) {
        if (!error || error.code !== '42703') throw error;
        await ambil(
          `INSERT INTO student_cases (id, student_id, kind, ref, source, status, note, due_on, created_by_account_id, updated_by_account_id)
           VALUES ($1::uuid, $2, $3, $1::text, 'manual', 'baru', $4, $5, $6, $6)`,
          [id, sumber.studentId, jenis, catatan, batas, actor.id || null]
        );
      }
    } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 503, error: TABEL_BELUM_ADA };
      throw error;
    }
    await catatKejadian(id, 'dibuat', null, 'baru', catatan, actor);
    return { ok: true, value: { caseId: id, studentId: sumber.studentId, kind: jenis, status: 'baru' } };
  }

  // Ubah satu urusan: { studentId, kind, ref, status, note?, assigneeAccountId?, evidenceNote?, evidenceFileId? }.
  // Menyelesaikan urusan wajib disertai bukti penyelesaian (catatan bukti atau berkas). Untuk paspor dan iqamah barisnya
  // dibuat saat pertama kali diubah (hanya admin). Musyrif hanya mengubah urusan manual untuk santri di asramanya.
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
    const penanggung = await petugasSah(sumber.assigneeAccountId);
    if (penanggung === false) return { ok: false, status: 422, error: 'Penanggung jawab harus akun admin atau musyrif yang aktif.' };
    const berkasBukti = await berkasBuktiSah(sumber.evidenceFileId, sumber.studentId);
    if (berkasBukti === false) return { ok: false, status: 422, error: 'Berkas bukti tidak ditemukan untuk santri ini.' };
    const catatanBukti = sumber.evidenceNote === undefined ? null : bersih(sumber.evidenceNote, 500);
    try {
      const lama = (await ambilBoleh(`${SELECT_MASALAH_LAMA} WHERE c.student_id = $1 AND c.kind = $2 AND c.ref = $3`, [sumber.studentId, jenis, ref]))[0] || null;
      let adaBuktiLama = false;
      let penanggungLama = null;
      if (lama) {
        try {
          const bukti = await ambil('SELECT evidence_note, evidence_file_id, assignee_account_id FROM student_cases WHERE id = $1', [lama.id]);
          adaBuktiLama = Boolean(bukti[0] && (bukti[0].evidence_note || bukti[0].evidence_file_id));
          penanggungLama = bukti[0] ? bukti[0].assignee_account_id || null : null;
        } catch (error) {
          if (!error || error.code !== '42703') throw error;
          adaBuktiLama = true; // migrasi 069 belum diterapkan: bukti belum bisa disimpan, jangan menahan penyelesaian
        }
      }
      if (status === 'selesai' && !(catatanBukti && catatanBukti.length >= 5) && !berkasBukti && !adaBuktiLama) {
        return { ok: false, status: 422, error: 'Tulis bukti penyelesaian (minimal 5 karakter) atau lampirkan berkas bukti sebelum menandai selesai.' };
      }
      let caseId;
      try {
        if (JENIS[jenis].otomatis) {
          const hasil = await ambil(
            `INSERT INTO student_cases (id, student_id, kind, ref, source, status, note, created_by_account_id, updated_by_account_id, resolved_at, assignee_account_id, evidence_note, evidence_file_id)
             VALUES ($1, $2, $3, $4, 'otomatis', $5, coalesce($6::text, ''), $7, $7, CASE WHEN $5::text = 'selesai' THEN now() ELSE NULL END, $8, coalesce($9::text, ''), $10)
             ON CONFLICT (student_id, kind, ref) DO UPDATE
               SET status = EXCLUDED.status,
                   note = coalesce($6::text, student_cases.note),
                   updated_by_account_id = EXCLUDED.updated_by_account_id,
                   resolved_at = CASE WHEN EXCLUDED.status = 'selesai' THEN now() ELSE NULL END,
                   assignee_account_id = CASE WHEN $11::boolean THEN $8 ELSE student_cases.assignee_account_id END,
                   evidence_note = coalesce($9::text, student_cases.evidence_note),
                   evidence_file_id = coalesce($10, student_cases.evidence_file_id),
                   updated_at = now()
             RETURNING id`,
            [crypto.randomUUID(), sumber.studentId, jenis, ref, status, catatan, actor.id || null, penanggung === undefined ? null : penanggung, catatanBukti, berkasBukti, penanggung !== undefined]
          );
          caseId = hasil[0].id;
        } else {
          const hasil = await ambil(
            `UPDATE student_cases
             SET status = $4::text, note = coalesce($5::text, note), updated_by_account_id = $6,
                 resolved_at = CASE WHEN $4::text = 'selesai' THEN now() ELSE NULL END,
                 assignee_account_id = CASE WHEN $7::boolean THEN $8 ELSE assignee_account_id END,
                 evidence_note = coalesce($9::text, evidence_note), evidence_file_id = coalesce($10, evidence_file_id), updated_at = now()
             WHERE student_id = $1 AND kind = $2 AND ref = $3
             RETURNING id`,
            [sumber.studentId, jenis, ref, status, catatan, actor.id || null, penanggung !== undefined, penanggung === undefined ? null : penanggung, catatanBukti, berkasBukti]
          );
          if (!hasil.length) return { ok: false, status: 404, error: 'Urusan tidak ditemukan.' };
          caseId = hasil[0].id;
        }
      } catch (error) {
        if (!error || error.code !== '42703') throw error;
        // Migrasi 069 belum diterapkan: ubah status dengan cara lama, tanpa penanggung jawab dan bukti.
        if (JENIS[jenis].otomatis) {
          const hasil = await ambil(
            `INSERT INTO student_cases (id, student_id, kind, ref, source, status, note, created_by_account_id, updated_by_account_id, resolved_at)
             VALUES ($1, $2, $3, $4, 'otomatis', $5, coalesce($6::text, ''), $7, $7, CASE WHEN $5::text = 'selesai' THEN now() ELSE NULL END)
             ON CONFLICT (student_id, kind, ref) DO UPDATE
               SET status = EXCLUDED.status, note = coalesce($6::text, student_cases.note), updated_by_account_id = EXCLUDED.updated_by_account_id,
                   resolved_at = CASE WHEN EXCLUDED.status = 'selesai' THEN now() ELSE NULL END, updated_at = now()
             RETURNING id`,
            [crypto.randomUUID(), sumber.studentId, jenis, ref, status, catatan, actor.id || null]
          );
          caseId = hasil[0].id;
        } else {
          const hasil = await ambil(
            `UPDATE student_cases SET status = $4::text, note = coalesce($5::text, note), updated_by_account_id = $6,
                 resolved_at = CASE WHEN $4::text = 'selesai' THEN now() ELSE NULL END, updated_at = now()
             WHERE student_id = $1 AND kind = $2 AND ref = $3 RETURNING id`,
            [sumber.studentId, jenis, ref, status, catatan, actor.id || null]
          );
          if (!hasil.length) return { ok: false, status: 404, error: 'Urusan tidak ditemukan.' };
          caseId = hasil[0].id;
        }
      }
      const dariStatus = lama ? lama.status : null;
      if (dariStatus !== status) await catatKejadian(caseId, 'status', dariStatus, status, status === 'selesai' ? (catatanBukti || (berkasBukti ? 'Bukti berupa berkas terlampir.' : 'Memakai bukti yang sudah ada.')) : (catatan || ''), actor);
      if (penanggung !== undefined && penanggungLama !== penanggung) await catatKejadian(caseId, 'penanggung-jawab', dariStatus, status, penanggung ? 'Penanggung jawab ditetapkan.' : 'Penanggung jawab dikosongkan.', actor);
      return { ok: true, value: { caseId, status } };
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
