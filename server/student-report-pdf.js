// Rapor digital PDF untuk wali dan staf.
//
// Isinya hanya catatan yang benar-benar ada di sistem untuk periode yang dipilih: identitas,
// kehadiran, progres maddah, prestasi, kegiatan, evaluasi pembina, dan catatan disiplin.
// Tidak ada nilai, predikat, atau kalimat penilaian yang dikarang; bagian tanpa catatan
// ditulis apa adanya. Akses mengikuti dashboard santri (wali hanya santrinya sendiri) dan
// nama pencatat tidak ikut untuk wali, karena dashboard sudah membuangnya.
const { createDocumentPdf } = require('./pdf.js');

const STATUS_KEHADIRAN = Object.freeze({ present: 'Hadir', late: 'Terlambat', excused: 'Izin / sakit', absent: 'Tidak hadir' });
const ZONA = 'Asia/Jakarta';

function tanggal(value) {
  if (!value) return '-';
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: String(value).length === 10 ? 'UTC' : ZONA }).format(date);
}

function periodeLabel(period) {
  if (period.from && period.to) return `${tanggal(period.from)} sampai ${tanggal(period.to)}`;
  if (period.from) return `Sejak ${tanggal(period.from)}`;
  if (period.to) return `Sampai ${tanggal(period.to)}`;
  return 'Seluruh catatan';
}

function kosong(blocks, pesan) { blocks.push({ kind: 'muted', text: pesan }); }

const LABEL_HAFALAN = Object.freeze({ lancar: 'lancar', 'kurang-lancar': 'kurang lancar', ulang: 'perlu diulang' });
const LABEL_KONDISI = Object.freeze({ sehat: 'Sehat', 'sakit-ringan': 'Sakit ringan', 'perlu-perhatian': 'Perlu perhatian', dirujuk: 'Dirujuk ke fasilitas kesehatan' });

// care: ringkasan dari student-care-service (atau null). Kesehatan di rapor selalu versi
// wali: kondisi dan catatan untuk wali saja, tanpa keluhan dan tindakan.
function buildStudentReportBlocks(dashboard, { courses = null, care = null, generatedAt = new Date() } = {}) {
  const { student, attendance } = dashboard;
  const period = dashboard.period || {};
  const blocks = [
    { kind: 'title', text: 'Rapor Perkembangan Santri' },
    { kind: 'subtitle', text: 'Hamasah International' },
    { kind: 'rule' },
    { kind: 'text', text: `Nama: ${student.name}` },
    { kind: 'text', text: `Program: ${student.program || '-'}` },
    { kind: 'text', text: `Asrama: ${student.dormitory ? [student.dormitory.name, student.dormitory.area].filter(Boolean).join(', ') : 'Belum ditempatkan'}` },
    { kind: 'text', text: `Kota asal: ${student.city || '-'}` },
    { kind: 'text', text: `Bergabung: ${tanggal(student.joinDate)}` },
    { kind: 'text', text: `Periode rapor: ${periodeLabel(period)}` }
  ];

  blocks.push({ kind: 'heading', text: 'Kehadiran' });
  if (!attendance.total) {
    kosong(blocks, 'Belum ada presensi tercatat pada periode ini.');
  } else {
    blocks.push({ kind: 'text', text: `${attendance.present} dari ${attendance.total} sesi hadir atau terlambat (${attendance.rate}%).` });
    const perStatus = attendance.byStatus || {};
    const rincian = Object.entries(STATUS_KEHADIRAN).filter(([key]) => perStatus[key]).map(([key, label]) => `${label} ${perStatus[key]}`);
    if (rincian.length) blocks.push({ kind: 'text', text: `Rincian: ${rincian.join(', ')}.` });
  }

  if (care) {
    const periodeIbadah = `${tanggal(care.period.from)} sampai ${tanggal(care.period.to)}`;
    blocks.push({ kind: 'heading', text: 'Sholat berjamaah' });
    blocks.push({ kind: 'muted', text: `Periode catatan ibadah: ${periodeIbadah}.` });
    if (!care.prayers.recorded) kosong(blocks, 'Belum ada presensi sholat yang dicatat musyrif pada periode ini.');
    else {
      const t = care.prayers.totals;
      blocks.push({ kind: 'text', text: `${care.prayers.recorded} waktu sholat tercatat: ${t.berjamaah} berjamaah (${care.prayers.berjamaahRate}%), ${t.munfarid} munfarid, ${t.tidak} tidak sholat, ${t.izin} izin.` });
    }
    blocks.push({ kind: 'heading', text: 'Setoran hafalan' });
    if (!care.memorization.length) kosong(blocks, 'Belum ada setoran hafalan pada periode ini.');
    else care.memorization.forEach((setoran) => blocks.push({ kind: 'item', text: `${tanggal(setoran.occurredOn)}: ${setoran.kind === 'ziyadah' ? 'Ziyadah' : 'Murajaah'} ${setoran.portion} (${LABEL_HAFALAN[setoran.grade] || setoran.grade})${setoran.note ? `. ${setoran.note}` : ''}` }));
    if (care.health !== null) {
      blocks.push({ kind: 'heading', text: 'Kesehatan' });
      if (!care.health.length) kosong(blocks, 'Tidak ada catatan kesehatan pada periode ini.');
      else care.health.forEach((catatan) => blocks.push({ kind: 'item', text: `${tanggal(catatan.occurredOn)}: ${LABEL_KONDISI[catatan.condition] || catatan.condition}${catatan.parentNote ? `. ${catatan.parentNote}` : ''}` }));
    }
  }

  blocks.push({ kind: 'heading', text: 'Progres maddah (per tanggal rapor dibuat)' });
  if (courses === null) kosong(blocks, 'Data maddah tidak tersedia untuk akun ini.');
  else if (!courses.length) kosong(blocks, 'Santri belum terdaftar pada maddah mana pun.');
  else {
    for (const course of courses) {
      blocks.push({ kind: 'item', text: `${course.title}: ${course.completedMaterials} dari ${course.totalMaterials} materi selesai (${course.progress}%)` });
    }
  }

  const bagian = [
    ['Prestasi', dashboard.achievements, (entry) => `${tanggal(entry.occurredAt)}: ${entry.title}${entry.description ? `. ${entry.description}` : ''}`, 'Belum ada prestasi tercatat pada periode ini.'],
    ['Kegiatan', dashboard.activities, (entry) => `${tanggal(entry.occurredAt)}: ${entry.title}${entry.description ? `. ${entry.description}` : ''}`, 'Belum ada kegiatan tercatat pada periode ini.'],
    ['Evaluasi pembina', dashboard.evaluations, (entry) => `${tanggal(entry.occurredAt)}${entry.area ? ` (${entry.area})` : ''}: ${entry.note}`, 'Belum ada evaluasi tercatat pada periode ini.'],
    ['Catatan disiplin', dashboard.discipline, (entry) => `${tanggal(entry.occurredAt)}${entry.level ? ` (${entry.level})` : ''}: ${entry.note}`, 'Tidak ada catatan disiplin pada periode ini.']
  ];
  for (const [judul, entries, format, pesanKosong] of bagian) {
    blocks.push({ kind: 'heading', text: judul });
    if (!entries || !entries.length) kosong(blocks, pesanKosong);
    else entries.forEach((entry) => blocks.push({ kind: 'item', text: format(entry) }));
    if (judul === 'Kegiatan' && entries && entries.length >= 20) kosong(blocks, 'Ditampilkan 20 kegiatan terbaru.');
  }

  blocks.push({ kind: 'space', size: 14 }, { kind: 'rule' });
  blocks.push({ kind: 'muted', text: `Disusun otomatis dari catatan pembina di sistem Hamasah International pada ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: ZONA }).format(generatedAt)} WIB. Rapor ini bukan transkrip resmi Universitas Al-Azhar.` });
  return blocks;
}

function createStudentReportPdf(dashboard, options = {}) {
  return createDocumentPdf({ blocks: buildStudentReportBlocks(dashboard, options), footer: `Rapor ${dashboard.student.name}` });
}

module.exports = { buildStudentReportBlocks, createStudentReportPdf };
