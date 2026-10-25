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

const persen = (jumlah, total) => (total ? `${Math.round((jumlah * 100) / total)}%` : '-');

const kapital = (teks) => String(teks || '').replace(/^./, (huruf) => huruf.toUpperCase());

const LABEL_HAFALAN = Object.freeze({ lancar: 'lancar', 'kurang-lancar': 'kurang lancar', ulang: 'perlu diulang' });
const LABEL_KONDISI = Object.freeze({ sehat: 'Sehat', 'sakit-ringan': 'Sakit ringan', 'perlu-perhatian': 'Perlu perhatian', dirujuk: 'Dirujuk ke fasilitas kesehatan' });


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
    kehadiran.table = {
      columns: [{ title: 'Status', width: 0.5 }, { title: 'Jumlah sesi', width: 0.25, align: 'right' }, { title: 'Persentase', width: 0.25, align: 'right' }],
      rows: Object.entries(STATUS_KEHADIRAN).filter(([key]) => perStatus[key]).map(([key, label]) => [label, String(perStatus[key]), persen(perStatus[key], attendance.total)])
    };
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
      sholat.table = {
        columns: [{ title: 'Status', width: 0.5 }, { title: 'Jumlah waktu', width: 0.25, align: 'right' }, { title: 'Persentase', width: 0.25, align: 'right' }],
        rows: [['Berjamaah', t.berjamaah], ['Munfarid', t.munfarid], ['Izin', t.izin], ['Tidak sholat', t.tidak]]
          .map(([label, jumlah]) => [label, String(jumlah), persen(jumlah, care.prayers.recorded)])
      };
      stats.push({ label: 'Sholat berjamaah', value: `${care.prayers.berjamaahRate}%`, note: `${t.berjamaah} dari ${care.prayers.recorded} waktu`, ratio: care.prayers.berjamaahRate / 100 });
    }
    sections.push(sholat);

    sections.push({
      title: 'Setoran hafalan',
      entries: [],
      ...(care.memorization.length ? {
        table: {
          columns: [{ title: 'Tanggal', width: 0.2 }, { title: 'Setoran', width: 0.32 }, { title: 'Kelancaran', width: 0.2 }, { title: 'Catatan', width: 0.28 }],
          rows: care.memorization.map((setoran) => [tanggal(setoran.occurredOn, 'short'), `${setoran.kind === 'ziyadah' ? 'Ziyadah' : 'Murajaah'} ${setoran.portion}`, kapital(LABEL_HAFALAN[setoran.grade] || setoran.grade), setoran.note || '-'])
        }
      } : {}),
      empty: 'Belum ada setoran hafalan pada periode ini.'
    });
    stats.push({ label: 'Setoran hafalan', value: String(care.memorization.length), note: care.memorization.length ? 'setoran tercatat' : 'Belum ada setoran' });

    if (care.health !== null) {
      sections.push({
        title: 'Kesehatan',
        entries: [],
        ...(care.health.length ? {
          table: {
            columns: [{ title: 'Tanggal', width: 0.2 }, { title: 'Kondisi', width: 0.25 }, { title: 'Catatan untuk wali', width: 0.55 }],
            rows: care.health.map((catatan) => [tanggal(catatan.occurredOn, 'short'), LABEL_KONDISI[catatan.condition] || catatan.condition, catatan.parentNote || '-'])
          }
        } : {}),
        empty: 'Tidak ada catatan kesehatan pada periode ini.'
      });
    }
  }

  const maddah = { title: 'Progres maddah', note: 'Per tanggal rapor dibuat.', entries: [] };
  if (courses === null) maddah.empty = 'Data maddah tidak tersedia untuk akun ini.';
  else if (!courses.length) maddah.empty = 'Santri belum terdaftar pada maddah mana pun.';
  else {
    maddah.table = {
      columns: [{ title: 'Maddah', width: 0.55 }, { title: 'Materi selesai', width: 0.27, align: 'right' }, { title: 'Progres', width: 0.18, align: 'right' }],
      rows: courses.map((course) => [course.title, `${course.completedMaterials} dari ${course.totalMaterials}`, `${course.progress}%`])
    };
  }
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

// Tata letak A4 gaya CV sederhana: logo dan nama di kiri atas, judul dokumen di kanan atas,
// lalu baris-baris dengan label abu-abu di kiri dan isinya di kanan. Hampir tanpa warna;
// emasnya cukup dari logo.
const HALAMAN = Object.freeze({ lebar: 595, tinggi: 842 });
// Margin kiri dan kanan sama persis: 48 pt dari tepi kertas.
const LABEL_X = 48;
const ISI = Object.freeze({ x: 196, kanan: HALAMAN.lebar - LABEL_X, atas: 760, bawah: 70 });
const ABU = Object.freeze({ judul: '#333333', teks: '#555555', redup: '#8C8C8C' });

function createStudentReportPdf(dashboard, options = {}) {
  const model = buildStudentReport(dashboard, options);
  const pdf = new PdfCanvas({ ...HALAMAN, fonts: fontRapor() });
  const lebar = ISI.kanan - ISI.x;
  let y = 0;

  function halamanBaru() {
    pdf.addPage();
    pdf.text(LABEL_X, 790, model.name, { size: 10, font: 'bold', fill: ABU.judul });
    pdf.text(ISI.kanan, 790, 'Lanjutan rapor', { size: 8.5, font: 'italic', fill: ABU.redup, align: 'right' });
    y = ISI.atas + 8;
  }
  function pastikan(tinggi) { if (y - tinggi < ISI.bawah) halamanBaru(); }
  // Paragraf rata kiri-kanan; baris terakhir tetap rata kiri.
  function paragraf(teks, gaya, jarak = 1.5, x = ISI.x, lebarBaris = lebar) {
    const semua = pdf.wrap(teks, gaya.size, gaya.font || 'regular', lebarBaris);
    semua.forEach((baris, i) => {
      pastikan(gaya.size * jarak);
      y -= gaya.size * jarak;
      pdf.text(x, y, baris, { ...gaya, justify: i < semua.length - 1 ? lebarBaris : 0 });
    });
  }
  // Tabel sederhana selebar kolom isi: kepala krem, baris dipisah garis tipis, sel dipenggal
  // per kata. Kepala diulang bila tabel berlanjut ke halaman berikutnya.
  function tabel({ columns, rows }, adaPengantar) {
    const pad = 7;
    const lebarKolom = columns.map((kolom) => kolom.width * lebar);
    const xKolom = lebarKolom.map((_, i) => ISI.x + lebarKolom.slice(0, i).reduce((a, b) => a + b, 0));
    const isiSel = (teks, i, gaya) => {
      const x = columns[i].align === 'right' ? xKolom[i] + lebarKolom[i] - pad : xKolom[i] + pad;
      return { x, gaya: { ...gaya, align: columns[i].align === 'right' ? 'right' : 'left' }, baris: pdf.wrap(teks, gaya.size, gaya.font || 'regular', lebarKolom[i] - pad * 2) };
    };
    function kepala() {
      pastikan(42);
      pdf.rect(ISI.x, y - 20, lebar, 20, '#F7F2E2');
      columns.forEach((kolom, i) => {
        const sel = isiSel(kolom.title, i, { size: 8.5, font: 'bold', fill: ABU.judul });
        pdf.text(sel.x, y - 13.5, sel.baris[0], sel.gaya);
      });
      y -= 20;
    }
    if (adaPengantar) y -= 8;
    kepala();
    for (const baris of rows) {
      const sel = baris.map((teks, i) => isiSel(String(teks), i, { size: 9, fill: ABU.teks }));
      const tinggi = Math.max(...sel.map((s) => s.baris.length)) * 12 + 10;
      if (y - tinggi < ISI.bawah) { halamanBaru(); kepala(); }
      sel.forEach((s) => s.baris.forEach((teks, i) => pdf.text(s.x, y - 16 - i * 12, teks, s.gaya)));
      y -= tinggi;
      pdf.rect(ISI.x, y, lebar, 0.6, '#E4E0D6');
    }
  }

  // Satu baris CV: label abu-abu di kiri sejajar baris pertama isinya.
  function baris(label, isi) {
    pastikan(70);
    y -= 34;
    pdf.text(LABEL_X, y - 1, label, { size: 13, fill: ABU.redup });
    y += 13;
    isi();
  }

  // Kepala.
  const gambar = logo();
  if (gambar) pdf.image(gambar, LABEL_X, 758, 30, (30 * gambar.height) / gambar.width);
  const xNama = gambar ? LABEL_X + 42 : LABEL_X;
  let ukuranNama = 22;
  while (ukuranNama > 14 && pdf.measure(model.name, ukuranNama, 'bold') > 300 - xNama) ukuranNama -= 1;
  pdf.text(xNama, 776, model.name, { size: ukuranNama, font: 'bold', fill: ABU.judul });
  pdf.text(xNama, 762, model.institution.name, { size: 9, font: 'bold', fill: ABU.redup });
  pdf.text(ISI.kanan, 776, model.title, { size: 12, font: 'bold', fill: ABU.judul, align: 'right' });
  pdf.text(ISI.kanan, 762, model.period, { size: 8.5, fill: ABU.redup, align: 'right' });

  y = 730;
  baris('Santri', () => {
    paragraf(model.summary, { size: 10, font: 'italic', fill: ABU.redup }, 1.45);
    y -= 8;
    for (const [label, nilai] of model.profile) {
      const awalan = `${label} `;
      const lebarLabel = pdf.measure(awalan, 9.5, 'bold');
      const isi = pdf.wrap(nilai, 9.5, 'regular', lebar - lebarLabel);
      pastikan(14);
      y -= 14;
      pdf.text(ISI.x, y, awalan, { size: 9.5, font: 'bold', fill: ABU.judul });
      isi.forEach((teks, i) => {
        if (i) { y -= 13; }
        pdf.text(ISI.x + lebarLabel, y, teks, { size: 9.5, fill: ABU.teks });
      });
    }
  });

  // Ringkasan seperti kolom "Skills": angka besar, keterangan di bawahnya.
  baris('Ringkasan', () => {
    const kolom = lebar / model.stats.length;
    const awal = y;
    let terendah = y;
    model.stats.forEach((stat, i) => {
      let ky = awal - 16;
      const x = ISI.x + i * kolom;
      pdf.text(x, ky, stat.value, { size: 14, font: 'bold', fill: ABU.judul });
      for (const teks of [stat.label, stat.note]) {
        for (const isi of pdf.wrap(teks, 9, 'regular', kolom - 10)) {
          ky -= 13;
          pdf.text(x, ky, isi, { size: 9, fill: ABU.teks });
        }
      }
      terendah = Math.min(terendah, ky);
    });
    y = terendah;
  });

  for (const bagian of model.sections) {
    baris(bagian.title, () => {
      if (bagian.note) paragraf(bagian.note, { size: 8.5, font: 'italic', fill: ABU.redup });
      if (bagian.empty && !bagian.entries.length && !bagian.table && !bagian.intro) {
        paragraf(bagian.empty, { size: 9.5, font: 'italic', fill: ABU.redup });
        return;
      }
      if (bagian.intro) paragraf(bagian.intro, { size: 10, fill: ABU.teks });

      if (bagian.table) tabel(bagian.table, Boolean(bagian.intro || bagian.note));

      const entri = bagian.entries.map((e) => ({ label: e.label, sub: tanggal(e.date), text: e.text }));
      entri.forEach((e, index) => {
        const judul = pdf.wrap(e.label, 11.5, 'bold', lebar);
        const isi = e.text ? pdf.wrap(e.text, 9.5, 'regular', lebar) : [];
        pastikan(Math.min(32 + judul.length * 15 + isi.length * 14, 80));
        if (index || bagian.intro || bagian.note) y -= 12;
        judul.forEach((teks) => {
          pastikan(15);
          y -= 15;
          pdf.text(ISI.x, y, teks, { size: 11.5, font: 'bold', fill: ABU.judul });
        });
        y -= 13;
        pdf.text(ISI.x, y, e.sub, { size: 9, font: 'italic', fill: ABU.redup });
        isi.forEach((teks, i) => {
          pastikan(14);
          y -= 14;
          pdf.text(ISI.x, y, teks, { size: 9.5, fill: ABU.teks, justify: i < isi.length - 1 ? lebar : 0 });
        });
      });
      if (bagian.after) { y -= 4; paragraf(bagian.after, { size: 8.5, font: 'italic', fill: ABU.redup }); }
    });
  }

  pastikan(40);
  y -= 30;
  paragraf(model.closing, { size: 8, font: 'italic', fill: ABU.redup });

  // Kaki setiap halaman.
  const total = pdf.pages.length;
  pdf.pages.forEach((ops, index) => {
    pdf.ops = ops;
    pdf.text(LABEL_X, 40, `Rapor ${model.name}`, { size: 7.5, fill: ABU.redup });
    pdf.text(ISI.kanan, 40, `Halaman ${index + 1} dari ${total}`, { size: 7.5, fill: ABU.redup, align: 'right' });
  });
  return pdf.toBuffer();
}

module.exports = { buildStudentReport, createStudentReportPdf, fontRapor };
