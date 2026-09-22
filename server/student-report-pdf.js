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

function buildStudentReportBlocks(dashboard, { courses = null, generatedAt = new Date() } = {}) {
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
