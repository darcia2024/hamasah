// Rapor digital PDF untuk wali dan staf, bertata letak seperti CV satu halaman: kepala
// dengan nama besar dan pita emas, paragraf pembuka, kolom kiri berisi ringkasan, profil,
// dan kop lembaga; kolom kanan berisi catatan per bagian.
//
// Isinya hanya catatan yang benar-benar ada di sistem untuk periode yang dipilih: identitas,
// kehadiran, progres maddah, prestasi, kegiatan, evaluasi pembina, dan catatan disiplin.
// Tidak ada nilai, predikat, atau kalimat penilaian yang dikarang; bagian tanpa catatan
// ditulis apa adanya. Akses mengikuti dashboard santri (wali hanya santrinya sendiri) dan
// nama pencatat tidak ikut untuk wali, karena dashboard sudah membuangnya.
const fs = require('node:fs');
const path = require('node:path');
const { PdfCanvas } = require('./pdf-canvas.js');
const { parseTrueType } = require('./pdf-font.js');
const { decodePng } = require('./pdf-image.js');
const { BAWAAN } = require('./templates.js');

const STATUS_KEHADIRAN = Object.freeze({ present: 'Hadir', late: 'Terlambat', excused: 'Izin / sakit', absent: 'Tidak hadir' });
const ZONA = 'Asia/Jakarta';

function tanggal(value, gaya = 'long') {
  if (!value) return '-';
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '-';
  const format = gaya === 'short' ? { day: 'numeric', month: 'short', year: 'numeric' } : { dateStyle: 'long' };
  return new Intl.DateTimeFormat('id-ID', { ...format, timeZone: String(value).length === 10 ? 'UTC' : ZONA }).format(date);
}

function periodeLabel(period) {
  if (period.from && period.to) return `${tanggal(period.from)} sampai ${tanggal(period.to)}`;
  if (period.from) return `Sejak ${tanggal(period.from)}`;
  if (period.to) return `Sampai ${tanggal(period.to)}`;
  return 'Seluruh catatan';
}

function inisial(nama) {
  const huruf = String(nama || '').split(/\s+/).map((kata) => kata.replace(/[^A-Za-zÀ-ÿ]/g, '')).filter(Boolean);
  // Huruf depan nama pertama dan nama terakhir.
  return (huruf.length > 1 ? [huruf[0], huruf[huruf.length - 1]] : huruf).map((kata) => kata[0].toUpperCase()).join('') || '?';
}

const kapital = (teks) => String(teks || '').replace(/^./, (huruf) => huruf.toUpperCase());

const LABEL_HAFALAN = Object.freeze({ lancar: 'lancar', 'kurang-lancar': 'kurang lancar', ulang: 'perlu diulang' });
const LABEL_KONDISI = Object.freeze({ sehat: 'Sehat', 'sakit-ringan': 'Sakit ringan', 'perlu-perhatian': 'Perlu perhatian', dirujuk: 'Dirujuk ke fasilitas kesehatan' });

const WARNA = Object.freeze({
  emas: '#E7B10C', emasMuda: '#F4CF55', emasTua: '#7A5800', tinta: '#1F1B10', redup: '#6B6250',
  krem: '#FFF7DC', garis: '#E9DDB4', abu: '#C9BC97', abuTua: '#8C8270', putih: '#FFFFFF'
});

// Model rapor: semua teks yang tercetak, tanpa urusan tata letak.
// care: ringkasan dari student-care-service (atau null). Kesehatan di rapor selalu versi
// wali: kondisi dan catatan untuk wali saja, tanpa keluhan dan tindakan.
// kop: blok "kop" dari halaman Template (nama lembaga, alamat, kontak, catatan rapor).
function buildStudentReport(dashboard, { courses = null, care = null, generatedAt = new Date(), kop = BAWAAN.kop } = {}) {
  const { student, attendance } = dashboard;
  const period = dashboard.period || {};
  const sections = [];
  const stats = [];

  const kehadiran = { title: 'Kehadiran', entries: [] };
  if (!attendance.total) {
    kehadiran.empty = 'Belum ada presensi tercatat pada periode ini.';
    stats.push({ label: 'Kehadiran', value: '-', note: 'Belum ada presensi' });
  } else {
    kehadiran.intro = `${attendance.present} dari ${attendance.total} sesi hadir atau terlambat (${attendance.rate}%).`;
    const perStatus = attendance.byStatus || {};
    const warna = { present: WARNA.emas, late: WARNA.emasMuda, excused: WARNA.abu, absent: WARNA.abuTua };
    kehadiran.segments = Object.entries(STATUS_KEHADIRAN).filter(([key]) => perStatus[key]).map(([key, label]) => ({ label, count: perStatus[key], fill: warna[key] }));
    stats.push({ label: 'Kehadiran', value: `${attendance.rate}%`, note: `${attendance.present} dari ${attendance.total} sesi`, ratio: attendance.rate / 100 });
  }
  sections.push(kehadiran);

  if (care) {
    const sholat = { title: 'Sholat berjamaah', note: `Periode catatan ibadah: ${tanggal(care.period.from)} sampai ${tanggal(care.period.to)}.`, entries: [] };
    if (!care.prayers.recorded) {
      sholat.empty = 'Belum ada presensi sholat yang dicatat musyrif pada periode ini.';
      stats.push({ label: 'Sholat berjamaah', value: '-', note: 'Belum dicatat' });
    } else {
      const t = care.prayers.totals;
      sholat.intro = `${care.prayers.recorded} waktu sholat tercatat, ${t.berjamaah} di antaranya berjamaah (${care.prayers.berjamaahRate}%).`;
      sholat.segments = [
        { label: 'Berjamaah', count: t.berjamaah, fill: WARNA.emas },
        { label: 'Munfarid', count: t.munfarid, fill: WARNA.emasMuda },
        { label: 'Izin', count: t.izin, fill: WARNA.abu },
        { label: 'Tidak sholat', count: t.tidak, fill: WARNA.abuTua }
      ];
      stats.push({ label: 'Sholat berjamaah', value: `${care.prayers.berjamaahRate}%`, note: `${t.berjamaah} dari ${care.prayers.recorded} waktu`, ratio: care.prayers.berjamaahRate / 100 });
    }
    sections.push(sholat);

    sections.push({
      title: 'Setoran hafalan',
      entries: care.memorization.map((setoran) => ({ date: setoran.occurredOn, label: `${setoran.kind === 'ziyadah' ? 'Ziyadah' : 'Murajaah'} ${setoran.portion}`, text: `${kapital(LABEL_HAFALAN[setoran.grade] || setoran.grade)}${setoran.note ? `. ${setoran.note}` : ''}` })),
      empty: 'Belum ada setoran hafalan pada periode ini.'
    });
    stats.push({ label: 'Setoran hafalan', value: String(care.memorization.length), note: care.memorization.length ? 'setoran tercatat' : 'Belum ada setoran' });

    if (care.health !== null) {
      sections.push({
        title: 'Kesehatan',
        entries: care.health.map((catatan) => ({ date: catatan.occurredOn, label: LABEL_KONDISI[catatan.condition] || catatan.condition, text: catatan.parentNote || '' })),
        empty: 'Tidak ada catatan kesehatan pada periode ini.'
      });
    }
  }

  const maddah = { title: 'Progres maddah', note: 'Per tanggal rapor dibuat.', entries: [] };
  if (courses === null) maddah.empty = 'Data maddah tidak tersedia untuk akun ini.';
  else if (!courses.length) maddah.empty = 'Santri belum terdaftar pada maddah mana pun.';
  else maddah.bars = courses.map((course) => ({ label: course.title, note: `${course.completedMaterials} dari ${course.totalMaterials} materi selesai (${course.progress}%)`, ratio: course.progress / 100 }));
  sections.push(maddah);

  const catatan = (entries, judul, isi) => (entries || []).map((entry) => ({ date: entry.occurredAt, label: judul(entry), text: isi(entry) }));
  sections.push(
    { title: 'Prestasi', entries: catatan(dashboard.achievements, (e) => e.title, (e) => e.description || ''), empty: 'Belum ada prestasi tercatat pada periode ini.' },
    { title: 'Kegiatan', entries: catatan(dashboard.activities, (e) => e.title, (e) => e.description || ''), empty: 'Belum ada kegiatan tercatat pada periode ini.', ...((dashboard.activities || []).length >= 20 ? { after: 'Ditampilkan 20 kegiatan terbaru.' } : {}) },
    { title: 'Evaluasi pembina', entries: catatan(dashboard.evaluations, (e) => e.area || 'Evaluasi', (e) => e.note), empty: 'Belum ada evaluasi tercatat pada periode ini.' },
    { title: 'Catatan disiplin', entries: catatan(dashboard.discipline, (e) => e.level ? `Tingkat ${e.level}` : 'Catatan', (e) => e.note), empty: 'Tidak ada catatan disiplin pada periode ini.' }
  );
  stats.push({ label: 'Prestasi', value: String((dashboard.achievements || []).length), note: (dashboard.achievements || []).length ? 'prestasi tercatat' : 'Belum ada prestasi' });

  // Paragraf pembuka: hanya merangkum angka yang sudah ada di atas, tanpa penilaian.
  const ringkas = [attendance.total ? `kehadiran kelas ${attendance.rate}% (${attendance.present} dari ${attendance.total} sesi)` : 'presensi kelas belum tercatat'];
  if (care) {
    ringkas.push(care.prayers.recorded ? `sholat berjamaah ${care.prayers.berjamaahRate}% dari ${care.prayers.recorded} waktu yang dicatat` : 'presensi sholat belum dicatat');
    ringkas.push(`${care.memorization.length} setoran hafalan`);
  }
  ringkas.push(`${(dashboard.achievements || []).length} prestasi`, `${(dashboard.activities || []).length} kegiatan`);
  const rentang = period.from || period.to ? `selama periode ${periodeLabel(period).replace(/^S/, 's')}` : 'dari seluruh catatan yang ada';
  const summary = `Rapor ini merangkum catatan pembina untuk ${student.name} ${rentang}. Tercatat ${ringkas.slice(0, -1).join(', ')}, dan ${ringkas[ringkas.length - 1]}.`;

  return {
    title: 'Rapor Perkembangan Santri',
    name: student.name,
    initials: inisial(student.name),
    period: periodeLabel(period),
    profile: [
      ['Program', student.program || '-'],
      ['Asrama', student.dormitory ? [student.dormitory.name, student.dormitory.area].filter(Boolean).join(', ') : 'Belum ditempatkan'],
      ['Kota asal', student.city || '-'],
      ['Bergabung', tanggal(student.joinDate)]
    ],
    summary,
    stats,
    sections,
    institution: { name: kop.namaLembaga, address: kop.alamat ? kop.alamat.split('\n').join(', ') : '', contact: kop.kontak || '' },
    closing: `Disusun otomatis dari catatan pembina di sistem ${kop.namaLembaga} pada ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: ZONA }).format(generatedAt)} WIB.${kop.catatanRapor ? ` ${kop.catatanRapor}` : ''}`
  };
}

let logoCache;
function logo() {
  if (logoCache === undefined) {
    try { logoCache = decodePng(fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo-emblem-gold.png'))); } catch { logoCache = null; }
  }
  return logoCache;
}

// Font rapor: Plus Jakarta Sans (assets/fonts, OFL). Bila berkasnya tidak ada, Helvetica.
let fontCache;
function fontRapor() {
  if (fontCache === undefined) {
    try {
      const folder = path.join(__dirname, '..', 'assets', 'fonts');
      const baca = (nama) => parseTrueType(fs.readFileSync(path.join(folder, `${nama}.ttf`)), nama);
      fontCache = { regular: baca('PlusJakartaSans-Regular'), bold: baca('PlusJakartaSans-Bold'), italic: baca('PlusJakartaSans-Italic') };
    } catch { fontCache = null; }
  }
  return fontCache;
}

// Tata letak A4 mengikuti CV satu halaman: kotak inisial di kiri atas, nama besar rata
// kanan dengan garis miring emas, keterangan santri di balik garis pemisah, paragraf
// pembuka, lalu kolom kiri (ringkasan, lembaga) dan kolom kanan bergaris linimasa
// (catatan per bagian) yang boleh berlanjut ke halaman berikut.
const HALAMAN = Object.freeze({ lebar: 595, tinggi: 842 });
const KIRI = Object.freeze({ x: 62, kanan: 204 });
const KANAN = Object.freeze({ garis: 236, x: 252, kanan: 551, atas: 798, bawah: 70 });
const NAMA_KANAN = 380;

function createStudentReportPdf(dashboard, options = {}) {
  const model = buildStudentReport(dashboard, options);
  const pdf = new PdfCanvas({ ...HALAMAN, fonts: fontRapor() });
  const lebarKanan = KANAN.kanan - KANAN.x;
  let y = 0;
  let garisAtas = null;

  function tepiHalaman() {
    pdf.rect(30, 170, 0.8, 642, WARNA.tinta);
    pdf.text(34, 64, model.institution.name.toLowerCase(), { size: 8, fill: WARNA.redup, spacing: 1.2, vertical: true });
  }
  // Garis linimasa kolom kanan ditutup di setiap akhir halaman.
  function tutupGaris() {
    if (garisAtas !== null && garisAtas > y) pdf.rect(KANAN.garis - 0.4, y - 4, 0.8, garisAtas - y + 4, WARNA.tinta);
  }
  function halamanBaru() {
    tutupGaris();
    pdf.addPage();
    tepiHalaman();
    pdf.text(KIRI.x, 790, model.name, { size: 10, font: 'bold', fill: WARNA.tinta });
    pdf.text(KIRI.x, 777, 'Lanjutan rapor', { size: 8, font: 'italic', fill: WARNA.redup });
    y = KANAN.atas;
    if (garisAtas !== null) garisAtas = KANAN.atas + 8;
  }
  function pastikan(tinggi) { if (y - tinggi < KANAN.bawah) halamanBaru(); }
  function paragraf(x, teks, lebar, gaya, jarak = 1.5) {
    for (const baris of pdf.wrap(teks, gaya.size, gaya.font || 'regular', lebar)) {
      pastikan(gaya.size * jarak);
      y -= gaya.size * jarak;
      pdf.text(x, y, baris, gaya);
    }
  }
  function centang(yy) { pdf.rect(KANAN.garis - 3.5, yy + 3, 7, 0.8, WARNA.tinta); }

  // Kepala.
  tepiHalaman();
  pdf.rect(KIRI.x, 632, 114, 210, WARNA.krem);
  const gambar = logo();
  if (gambar) pdf.image(gambar, KIRI.x + 41, 760, 32, (32 * gambar.height) / gambar.width);
  pdf.text(KIRI.x + 57, 692, model.initials, { size: 46, font: 'bold', fill: WARNA.emasTua, align: 'center' });
  pdf.polygon([[KIRI.x, 652], [KIRI.x, 672], [KIRI.x + 40, 632], [KIRI.x + 20, 632]], WARNA.emas);

  pdf.rect(392, 744, 0.8, 98, WARNA.tinta);
  pdf.circle(392.4, 744, 1.6, WARNA.tinta);

  const kata = String(model.name).trim().split(/\s+/);
  const depan = kata.length > 1 ? kata.slice(0, -1).join(' ') : '';
  const belakang = kata[kata.length - 1] || '';
  const ruangNama = NAMA_KANAN - (KIRI.x + 130);
  let besar = 36;
  while (besar > 18 && pdf.measure(belakang, besar, 'bold') > ruangNama) besar -= 1;
  let kecil = 21;
  while (kecil > 12 && pdf.measure(depan, kecil, 'bold') > ruangNama - 18) kecil -= 1;
  if (depan) {
    const lebarDepan = pdf.text(NAMA_KANAN, 778, depan, { size: kecil, font: 'bold', fill: WARNA.tinta, align: 'right' });
    const x = NAMA_KANAN - lebarDepan - 15;
    pdf.polygon([[x, 776], [x + 5, 776], [x + 12, 796], [x + 7, 796]], WARNA.emas);
  }
  pdf.text(NAMA_KANAN, 744, belakang, { size: besar, font: 'bold', fill: WARNA.tinta, align: 'right' });
  const lebarJudul = pdf.text(NAMA_KANAN, 708, model.title.toUpperCase(), { size: 9.5, fill: WARNA.tinta, spacing: 0.8, align: 'right' });
  pdf.rect(NAMA_KANAN - lebarJudul - 12, 700, 0.8, 24, WARNA.tinta);

  // Keterangan santri di sebelah kanan garis pemisah, seperti baris kontak di CV.
  let ky = 800;
  for (const [label, nilai] of [...model.profile, ['Periode', model.period]]) {
    const awalan = `${label}: `;
    const lebarLabel = pdf.measure(awalan, 7.8, 'bold');
    const baris = pdf.wrap(nilai, 7.8, 'regular', KANAN.kanan - 404 - lebarLabel);
    pdf.text(404, ky, awalan, { size: 7.8, font: 'bold', fill: WARNA.tinta });
    baris.forEach((isi, i) => {
      pdf.text(404 + lebarLabel, ky, isi, { size: 7.8, fill: WARNA.redup });
      if (i < baris.length - 1) ky -= 11;
    });
    ky -= 13;
  }

  // Paragraf pembuka.
  y = Math.min(ky - 6, 684);
  paragraf(KANAN.garis, model.summary, KANAN.kanan - KANAN.garis, { size: 8.5, fill: WARNA.redup }, 1.6);
  const awalKolom = Math.min(y, 640) - 40;

  // Kolom kiri: ringkasan angka dan kop lembaga.
  ky = awalKolom;
  function judulKiri(teks) {
    pdf.text(KIRI.x, ky, teks.toUpperCase(), { size: 12, font: 'bold', fill: WARNA.tinta, spacing: 0.6 });
    ky -= 20;
  }
  judulKiri('Ringkasan');
  pdf.text(KIRI.x, ky, '// ANGKA PERIODE INI', { size: 7.5, font: 'bold', fill: WARNA.tinta, spacing: 0.4 });
  ky -= 16;
  for (const stat of model.stats) {
    pdf.circle(KIRI.x + 3, ky + 3, 1.5, WARNA.tinta);
    pdf.text(KIRI.x + 13, ky, stat.label, { size: 8.5, fill: WARNA.redup });
    pdf.text(KIRI.kanan, ky, stat.value, { size: 8.5, font: 'bold', fill: WARNA.tinta, align: 'right' });
    ky -= 15;
  }
  ky -= 18;
  judulKiri('Lembaga');
  for (const [teks, gaya] of [[model.institution.name, { size: 8.5, font: 'bold' }], [model.institution.address, { size: 8 }], [model.institution.contact, { size: 8 }]]) {
    if (!teks) continue;
    for (const baris of pdf.wrap(teks, gaya.size, gaya.font || 'regular', KIRI.kanan - KIRI.x)) {
      pdf.text(KIRI.x, ky, baris, { ...gaya, fill: gaya.font ? WARNA.tinta : WARNA.redup });
      ky -= gaya.size * 1.5;
    }
  }

  // Kolom kanan: setiap bagian seperti "Pengalaman kerja" di CV.
  y = awalKolom + 12;
  garisAtas = awalKolom + 16;
  model.sections.forEach((bagian, urutan) => {
    // Judul bagian tidak boleh sendirian di dasar halaman.
    pastikan(110);
    y -= urutan ? 30 : 12;
    pdf.text(KANAN.x, y, bagian.title.toUpperCase(), { size: 12, font: 'bold', fill: WARNA.tinta, spacing: 0.6 });
    centang(y);
    if (bagian.note) paragraf(KANAN.x, bagian.note, lebarKanan, { size: 7.5, font: 'italic', fill: WARNA.redup });
    y -= 4;

    if (bagian.empty && !bagian.entries.length && !bagian.bars && !bagian.intro) {
      paragraf(KANAN.x, bagian.empty, lebarKanan, { size: 8.5, font: 'italic', fill: WARNA.redup });
      return;
    }
    if (bagian.intro) paragraf(KANAN.x, bagian.intro, lebarKanan, { size: 8.5, fill: WARNA.tinta });

    // Rincian kehadiran atau sholat sebagai butir sejajar.
    if (bagian.segments) {
      pastikan(16);
      y -= 14;
      let x = KANAN.x + 10;
      for (const s of bagian.segments) {
        const teks = `${s.label} ${s.count}`;
        const w = pdf.measure(teks, 8.5) + 24;
        if (x + w > KANAN.kanan) { x = KANAN.x + 10; pastikan(13); y -= 13; }
        pdf.circle(x - 7, y + 3, 1.5, WARNA.tinta);
        pdf.text(x, y, teks, { size: 8.5, fill: WARNA.redup });
        x += w;
      }
    }

    // Progres per maddah: judul tebal, keterangan miring, batang tipis.
    (bagian.bars || []).forEach((batang, index) => {
      const judul = pdf.wrap(batang.label, 9.5, 'bold', lebarKanan);
      pastikan(34 + judul.length * 13);
      y -= index ? 18 : 10;
      judul.forEach((baris) => {
        y -= 13;
        pdf.text(KANAN.x, y, baris, { size: 9.5, font: 'bold', fill: WARNA.tinta });
      });
      y -= 12;
      pdf.text(KANAN.x, y, batang.note, { size: 8.5, font: 'italic', fill: WARNA.tinta });
      y -= 9;
      pdf.rect(KANAN.x, y, 150, 3, WARNA.garis);
      pdf.rect(KANAN.x, y, 150 * Math.min(1, Math.max(0, batang.ratio)), 3, WARNA.emas);
    });

    // Catatan bertanggal: judul tebal, tanggal miring, lalu isinya.
    bagian.entries.forEach((entry, index) => {
      const judul = pdf.wrap(entry.label, 9.5, 'bold', lebarKanan);
      const isi = entry.text ? pdf.wrap(entry.text, 8.5, 'regular', lebarKanan) : [];
      pastikan(Math.min(28 + judul.length * 13 + isi.length * 12.6, 76));
      y -= index ? 14 : 8;
      judul.forEach((baris) => {
        pastikan(13);
        y -= 13;
        pdf.text(KANAN.x, y, baris, { size: 9.5, font: 'bold', fill: WARNA.tinta });
      });
      y -= 12;
      pdf.text(KANAN.x, y, tanggal(entry.date), { size: 8.5, font: 'italic', fill: WARNA.tinta });
      isi.forEach((baris) => {
        pastikan(12.6);
        y -= 12.6;
        pdf.text(KANAN.x, y, baris, { size: 8.5, fill: WARNA.redup });
      });
    });
    if (bagian.after) { y -= 4; paragraf(KANAN.x, bagian.after, lebarKanan, { size: 7.5, font: 'italic', fill: WARNA.redup }); }
  });
  tutupGaris();
  garisAtas = null;

  pastikan(40);
  y -= 26;
  paragraf(KANAN.x, model.closing, lebarKanan, { size: 7.5, font: 'italic', fill: WARNA.redup });

  // Kaki setiap halaman.
  const total = pdf.pages.length;
  pdf.pages.forEach((ops, index) => {
    pdf.ops = ops;
    pdf.text(KIRI.x, 40, `Rapor ${model.name}`, { size: 7.5, fill: WARNA.redup });
    pdf.text(KANAN.kanan, 40, `Halaman ${index + 1} dari ${total}`, { size: 7.5, font: 'bold', fill: WARNA.emasTua, align: 'right' });
  });
  return pdf.toBuffer();
}

module.exports = { buildStudentReport, createStudentReportPdf, fontRapor };
