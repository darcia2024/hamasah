// Rapor digital PDF untuk wali dan staf, bertata letak seperti CV: kolom kiri berisi
// identitas, ringkasan angka, dan kop lembaga; kolom kanan berisi catatan per bagian dalam
// bentuk linimasa bertanggal.
//
// Isinya hanya catatan yang benar-benar ada di sistem untuk periode yang dipilih: identitas,
// kehadiran, progres maddah, prestasi, kegiatan, evaluasi pembina, dan catatan disiplin.
// Tidak ada nilai, predikat, atau kalimat penilaian yang dikarang; bagian tanpa catatan
// ditulis apa adanya. Akses mengikuti dashboard santri (wali hanya santrinya sendiri) dan
// nama pencatat tidak ikut untuk wali, karena dashboard sudah membuangnya.
const fs = require('node:fs');
const path = require('node:path');
const { PdfCanvas, textWidth, wrapWidth } = require('./pdf-canvas.js');
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

// Tata letak A4: kolom kiri 186pt berwarna krem, kolom kanan mulai x 214.
const HALAMAN = Object.freeze({ lebar: 595, tinggi: 842 });
const KIRI = Object.freeze({ lebar: 186, pad: 22 });
const KANAN = Object.freeze({ x: 214, kanan: 555, atas: 800, bawah: 64 });
const LINIMASA = Object.freeze({ tanggal: 64, titik: 72, teks: 82 });

function createStudentReportPdf(dashboard, options = {}) {
  const model = buildStudentReport(dashboard, options);
  const pdf = new PdfCanvas(HALAMAN);
  const lebarKanan = KANAN.kanan - KANAN.x;
  let y = KANAN.atas;

  function latarKiri() {
    pdf.rect(0, 0, KIRI.lebar, HALAMAN.tinggi, WARNA.krem);
    pdf.rect(KIRI.lebar - 3, 0, 3, HALAMAN.tinggi, WARNA.emas);
  }
  // Halaman lanjutan: kolom kiri hanya mengingatkan rapor milik siapa.
  function halamanBaru() {
    pdf.addPage();
    latarKiri();
    pdf.text(KIRI.pad, 790, 'LANJUTAN RAPOR', { size: 7.5, font: 'bold', fill: WARNA.emasTua, spacing: 1.2 });
    pdf.rect(KIRI.pad, 784, 18, 1.5, WARNA.emas);
    let baris = 790 - 10;
    for (const isi of wrapWidth(model.name, 11, 'bold', KIRI.lebar - 3 - KIRI.pad * 2)) {
      baris -= 15;
      pdf.text(KIRI.pad, baris, isi, { size: 11, font: 'bold', fill: WARNA.tinta });
    }
    y = KANAN.atas;
  }
  function pastikan(tinggi) { if (y - tinggi < KANAN.bawah) halamanBaru(); }
  // Paragraf terbungkus di kolom kanan; mengembalikan tinggi yang dipakai.
  function paragraf(x, teks, lebar, gaya, jarak = 1.4) {
    const baris = wrapWidth(teks, gaya.size, gaya.font, lebar);
    baris.forEach((isi) => {
      pastikan(gaya.size * jarak);
      y -= gaya.size * jarak;
      pdf.text(x, y, isi, gaya);
    });
  }

  // Kolom kiri halaman pertama.
  latarKiri();
  const tengahKiri = (KIRI.lebar - 3) / 2;
  let ky = 790;
  pdf.circle(tengahKiri, ky - 40, 40, WARNA.emas);
  pdf.circle(tengahKiri, ky - 40, 35, WARNA.krem);
  pdf.circle(tengahKiri, ky - 40, 32, WARNA.emas);
  pdf.text(tengahKiri, ky - 49, model.initials, { size: 24, font: 'bold', fill: WARNA.putih, align: 'center' });
  ky -= 104;
  const lebarIsiKiri = KIRI.lebar - 3 - KIRI.pad * 2;
  function labelKiri(teks) {
    ky -= 22;
    pdf.text(KIRI.pad, ky, teks.toUpperCase(), { size: 7.5, font: 'bold', fill: WARNA.emasTua, spacing: 1.2 });
    pdf.rect(KIRI.pad, ky - 6, 18, 1.5, WARNA.emas);
    ky -= 10;
  }
  function teksKiri(teks, gaya, jarak = 1.35) {
    for (const baris of wrapWidth(teks, gaya.size, gaya.font, lebarIsiKiri)) {
      ky -= gaya.size * jarak;
      pdf.text(KIRI.pad, ky, baris, gaya);
    }
  }

  labelKiri('Profil');
  for (const [label, nilai] of model.profile) {
    ky -= 4;
    teksKiri(label, { size: 7.5, fill: WARNA.redup });
    teksKiri(nilai, { size: 9.5, font: 'bold', fill: WARNA.tinta });
  }

  labelKiri('Ringkasan');
  for (const stat of model.stats) {
    ky -= 22;
    pdf.text(KIRI.pad, ky, stat.value, { size: 18, font: 'bold', fill: WARNA.tinta });
    pdf.text(KIRI.pad + lebarIsiKiri, ky + 7, stat.label, { size: 7.5, font: 'bold', fill: WARNA.emasTua, align: 'right' });
    pdf.text(KIRI.pad + lebarIsiKiri, ky - 1, stat.note, { size: 7.5, fill: WARNA.redup, align: 'right' });
    ky -= 8;
    if (stat.ratio !== undefined) {
      pdf.rect(KIRI.pad, ky, lebarIsiKiri, 3.5, WARNA.garis);
      pdf.rect(KIRI.pad, ky, lebarIsiKiri * Math.min(1, Math.max(0, stat.ratio)), 3.5, WARNA.emas);
    } else pdf.rect(KIRI.pad, ky + 1, lebarIsiKiri, 0.6, WARNA.garis);
    ky -= 4;
  }

  // Kop lembaga menempel di dasar kolom kiri, seperti kontak di CV.
  const barisLembaga = [model.institution.address, model.institution.contact].filter(Boolean)
    .reduce((jumlah, teks) => jumlah + wrapWidth(teks, 7.5, 'regular', lebarIsiKiri).length, 0);
  const tinggiLembaga = 34 + wrapWidth(model.institution.name, 9, 'bold', lebarIsiKiri).length * 12.2 + barisLembaga * 10.2;
  ky = Math.min(ky, 40 + tinggiLembaga);
  labelKiri('Lembaga');
  ky -= 2;
  teksKiri(model.institution.name, { size: 9, font: 'bold', fill: WARNA.tinta });
  if (model.institution.address) teksKiri(model.institution.address, { size: 7.5, fill: WARNA.redup });
  if (model.institution.contact) teksKiri(model.institution.contact, { size: 7.5, fill: WARNA.redup });

  // Kepala kolom kanan: judul dokumen, nama besar, periode, dan logo.
  const gambar = logo();
  const lebarLogo = 40;
  if (gambar) pdf.image(gambar, KANAN.kanan - lebarLogo, KANAN.atas - 46, lebarLogo, (lebarLogo * gambar.height) / gambar.width);
  const lebarJudul = lebarKanan - (gambar ? lebarLogo + 16 : 0);
  y -= 6;
  pdf.text(KANAN.x, y, model.title.toUpperCase(), { size: 8, font: 'bold', fill: WARNA.emasTua, spacing: 1.4 });
  for (const baris of wrapWidth(model.name, 24, 'bold', lebarJudul)) {
    y -= 28;
    pdf.text(KANAN.x, y, baris, { size: 24, font: 'bold', fill: WARNA.tinta });
  }
  y -= 16;
  pdf.text(KANAN.x, y, `Periode rapor: ${model.period}`, { size: 9, fill: WARNA.redup });
  y -= 16;
  pdf.rect(KANAN.x, y, 44, 3, WARNA.emas);
  pdf.rect(KANAN.x + 50, y + 1, lebarKanan - 50, 0.8, WARNA.garis);
  y -= 8;

  for (const bagian of model.sections) {
    // Judul bagian tidak boleh sendirian di dasar halaman.
    pastikan(96);
    y -= 26;
    const lebar = pdf.text(KANAN.x, y, bagian.title.toUpperCase(), { size: 9, font: 'bold', fill: WARNA.tinta, spacing: 1.2 });
    pdf.rect(KANAN.x + lebar + 10, y + 3, lebarKanan - lebar - 10, 0.8, WARNA.garis);
    if (bagian.note) paragraf(KANAN.x, bagian.note, lebarKanan, { size: 8, font: 'italic', fill: WARNA.redup });
    y -= 4;

    if (bagian.empty && !bagian.entries.length && !bagian.bars && !bagian.intro) {
      paragraf(KANAN.x, bagian.empty, lebarKanan, { size: 9, font: 'italic', fill: WARNA.redup });
      continue;
    }
    if (bagian.intro) paragraf(KANAN.x, bagian.intro, lebarKanan, { size: 9.5, fill: WARNA.tinta });

    // Batang bertumpuk (kehadiran, sholat) beserta keterangannya.
    if (bagian.segments) {
      const total = bagian.segments.reduce((sum, s) => sum + s.count, 0);
      pastikan(34);
      y -= 14;
      let x = KANAN.x;
      for (const s of bagian.segments) {
        if (!s.count || !total) continue;
        const w = (lebarKanan * s.count) / total;
        pdf.rect(x, y, w, 8, s.fill);
        x += w;
      }
      y -= 14;
      x = KANAN.x;
      for (const s of bagian.segments) {
        const teks = `${s.label} ${s.count}`;
        const w = textWidth(teks, 8, 'regular') + 22;
        if (x + w > KANAN.kanan) { x = KANAN.x; y -= 13; }
        pdf.rect(x, y - 0.5, 7, 7, s.fill);
        pdf.text(x + 11, y, teks, { size: 8, fill: WARNA.tinta });
        x += w;
      }
    }

    // Progres per maddah.
    for (const batang of bagian.bars || []) {
      pastikan(34);
      y -= 16;
      const catatan = textWidth(batang.note, 8, 'regular');
      const judul = wrapWidth(batang.label, 9.5, 'bold', lebarKanan - catatan - 14);
      pdf.text(KANAN.kanan, y, batang.note, { size: 8, fill: WARNA.redup, align: 'right' });
      judul.forEach((baris, index) => {
        if (index) y -= 13;
        pdf.text(KANAN.x, y, baris, { size: 9.5, font: 'bold', fill: WARNA.tinta });
      });
      y -= 9;
      pdf.rect(KANAN.x, y, lebarKanan, 4, WARNA.garis);
      pdf.rect(KANAN.x, y, lebarKanan * Math.min(1, Math.max(0, batang.ratio)), 4, WARNA.emas);
    }

    // Linimasa bertanggal.
    const xTeks = KANAN.x + LINIMASA.teks;
    const lebarTeks = KANAN.kanan - xTeks;
    bagian.entries.forEach((entry, index) => {
      const judul = wrapWidth(entry.label, 9.5, 'bold', lebarTeks);
      const isi = entry.text ? wrapWidth(entry.text, 9, 'regular', lebarTeks) : [];
      pastikan(Math.min(judul.length * 13 + isi.length * 12.6, 60) + 10);
      y -= index ? 10 : 6;
      const atas = y;
      y -= 12;
      pdf.text(KANAN.x, y, tanggal(entry.date, 'short'), { size: 8, font: 'bold', fill: WARNA.redup });
      pdf.circle(KANAN.x + LINIMASA.titik, y + 3, 3, WARNA.emas);
      judul.forEach((baris, i) => {
        if (i) { pastikan(13); y -= 13; }
        pdf.text(xTeks, y, baris, { size: 9.5, font: 'bold', fill: WARNA.tinta });
      });
      isi.forEach((baris) => {
        pastikan(12.6);
        y -= 12.6;
        pdf.text(xTeks, y, baris, { size: 9, fill: WARNA.redup });
      });
      // Garis linimasa ke catatan berikutnya, hanya bila masih di halaman yang sama.
      if (index < bagian.entries.length - 1 && y < atas) pdf.line(KANAN.x + LINIMASA.titik, atas - 15, KANAN.x + LINIMASA.titik, y - 10, WARNA.garis, 1);
    });
    if (bagian.after) { y -= 4; paragraf(KANAN.x, bagian.after, lebarKanan, { size: 8, font: 'italic', fill: WARNA.redup }); }
  }

  pastikan(40);
  y -= 22;
  pdf.rect(KANAN.x, y, lebarKanan, 0.8, WARNA.garis);
  y -= 2;
  paragraf(KANAN.x, model.closing, lebarKanan, { size: 8, fill: WARNA.redup });

  // Kaki setiap halaman.
  const total = pdf.pages.length;
  pdf.pages.forEach((ops, index) => {
    pdf.ops = ops;
    pdf.text(KANAN.x, 34, `Rapor ${model.name}`, { size: 7.5, fill: WARNA.redup });
    pdf.text(KANAN.kanan, 34, `Halaman ${index + 1} dari ${total}`, { size: 7.5, font: 'bold', fill: WARNA.emasTua, align: 'right' });
  });
  return pdf.toBuffer();
}

module.exports = { buildStudentReport, createStudentReportPdf };
