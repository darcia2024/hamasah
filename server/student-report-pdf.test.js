// Rapor digital PDF wali: struktur PDF sah, isi hanya dari catatan nyata.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDocumentPdf, pdfLiteral } = require('./pdf.js');
const { textWidth } = require('./pdf-canvas.js');
const { decodePng } = require('./pdf-image.js');
const { buildStudentReport, createStudentReportPdf, fontRapor } = require('./student-report-pdf.js');

// Offset xref harus menunjuk tepat ke awal setiap objek, kalau tidak pembaca PDF menolak.
function assertValidPdf(buffer) {
  const text = buffer.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4\n') && text.endsWith('%%EOF'));
  const xref = Number(text.match(/startxref\n(\d+)\n%%EOF$/)[1]);
  assert.ok(text.slice(xref).startsWith('xref\n'));
  const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
  offsets.forEach((offset, index) => assert.ok(text.slice(offset).startsWith(`${index + 1} 0 obj\n`), `objek ${index + 1}`));
  for (const match of text.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
    const start = match.index + match[0].length;
    assert.equal(text.slice(start + Number(match[1]), start + Number(match[1]) + 10), '\nendstream');
  }
  return text;
}

// Teks yang tercetak, dibaca balik dari operator "Tj" (dengan font, ukuran, dan posisinya).
function textRuns(text) {
  const runs = [];
  for (const match of text.matchAll(/\/F(\d) ([\d.]+) Tf ([\d.-]+) Tc ([\d.-]+) [\d.-]+ Td \(((?:\\.|[^\\)])*)\) Tj/g)) {
    const value = match[5].replace(/\\([0-7]{3}|.)/g, (_, code) => (code.length === 3 ? String.fromCharCode(parseInt(code, 8)) : code));
    runs.push({ font: { 1: 'regular', 2: 'bold', 3: 'italic' }[match[1]], size: Number(match[2]), spacing: Number(match[3]), x: Number(match[4]), value });
  }
  return runs;
}

const dashboard = {
  student: { id: 's1', name: 'Santri (Uji) \\ Contoh', program: 'Kuliah Al-Azhar', city: 'Bandung', joinDate: '2026-07-01', dormitory: { name: 'Asrama 1', area: 'Kairo' } },
  period: { from: '2026-09-01', to: '2026-09-30' },
  attendance: { total: 4, present: 3, rate: 75, byStatus: { present: 2, late: 1, absent: 1 }, entries: [] },
  achievements: [{ occurredAt: '2026-09-10T08:00:00Z', title: 'Setoran juz 3', description: 'Lancar' }],
  activities: [],
  evaluations: [{ occurredAt: '2026-09-12T08:00:00Z', area: 'Adab', note: 'Membantu teman — rajin' }],
  discipline: []
};
const courses = [{ title: 'Fathul Qorib', progress: 50, totalMaterials: 2, completedMaterials: 1 }];

const text = assertValidPdf(createStudentReportPdf(dashboard, { courses, generatedAt: new Date('2026-09-30T10:00:00Z') }));
const runs = textRuns(text).map((run) => run.value);
assert.ok(text.includes(pdfLiteral('Santri (Uji) \\ Contoh')), 'kurung dan backslash di-escape');
assert.ok(runs.includes('Rapor Santri (Uji) \\ Contoh'));
assert.ok(runs.includes('Contoh'), 'nama belakang dicetak tebal terpisah');
assert.ok(text.includes('/BaseFont /PlusJakartaSans-Regular') && text.includes('/BaseFont /PlusJakartaSans-Bold') && text.includes('/FontFile2'), 'font Plus Jakarta Sans tertanam');
assert.ok(text.includes(' Tm (hamasah international) Tj'), 'nama lembaga tegak di tepi halaman');
assert.ok(runs.includes('3 dari 4 sesi hadir atau terlambat (75%).'));
for (const keterangan of ['Hadir 2', 'Terlambat 1', 'Tidak hadir 1']) assert.ok(runs.includes(keterangan), keterangan);
assert.ok(!runs.includes('Izin / sakit 0'), 'status tanpa catatan tidak dicetak');
assert.ok(runs.includes('Fathul Qorib') && runs.includes('1 dari 2 materi selesai (50%)'));
assert.equal(buildStudentReport(dashboard, { courses }).period, '1 September 2026 sampai 30 September 2026');
assert.ok(runs.includes('Periode: ') && runs.some((run) => run.startsWith('1 September 2026')));
assert.ok(runs.includes('Belum ada kegiatan tercatat pada periode ini.'));
assert.ok(runs.includes('Tidak ada catatan disiplin pada periode ini.'));
assert.ok(runs.includes('Membantu teman \x97 rajin'), 'tanda pisah em sebagai byte WinAnsi 0x97');
assert.ok(text.includes('\\227'), 'tanda pisah em ditulis sebagai byte WinAnsi');
assert.ok(runs.includes('SC'), 'inisial dari nama santri');
assert.ok(text.includes('/Subtype /Image'), 'logo lembaga ikut tercetak');
// Tidak ada nilai atau predikat karangan.
for (const karangan of ['Mumtaz', 'Predikat', 'Indeks Prestasi', 'Sangat Sehat']) assert.ok(!text.includes(karangan), karangan);

// Tanpa catatan sama sekali: setiap bagian mengatakan kosong, tidak ada angka palsu.
const kosong = buildStudentReport({ ...dashboard, attendance: { total: 0, present: 0, rate: null, byStatus: {} }, achievements: [], evaluations: [] }, { courses: [] });
const pesanKosong = kosong.sections.map((section) => section.empty);
assert.ok(pesanKosong.includes('Belum ada presensi tercatat pada periode ini.'));
assert.ok(pesanKosong.includes('Santri belum terdaftar pada maddah mana pun.'));
assert.equal(kosong.stats.find((stat) => stat.label === 'Kehadiran').value, '-');
assert.ok(!JSON.stringify(kosong).match(/\bnull\b|NaN|undefined/));
assert.ok(kosong.summary.includes('presensi kelas belum tercatat'), 'paragraf pembuka tidak mengarang angka');
assert.ok(buildStudentReport(dashboard, { courses: null }).sections.some((section) => section.empty === 'Data maddah tidak tersedia untuk akun ini.'));

// Banyak catatan: berlanjut ke halaman berikutnya, penomoran halaman benar.
const banyak = { ...dashboard, activities: Array.from({ length: 20 }, (_, i) => ({ occurredAt: '2026-09-15T08:00:00Z', title: `Kegiatan ${i + 1}`, description: 'Kajian rutin ba\'da Maghrib bersama pembina asrama dengan pembahasan kitab yang panjang sekali '.repeat(3) })) };
const multi = assertValidPdf(createStudentReportPdf(banyak, { courses }));
const halaman = Number(multi.match(/\/Count (\d+)/)[1]);
assert.ok(halaman >= 2, `harus lebih dari satu halaman, dapat ${halaman}`);
assert.ok(multi.includes(pdfLiteral(`Halaman ${halaman} dari ${halaman}`)));
assert.ok(multi.includes(pdfLiteral('Ditampilkan 20 kegiatan terbaru.')));
assert.ok(multi.includes(pdfLiteral('Lanjutan rapor')), 'halaman lanjutan menyebut pemilik rapor');
// Tidak ada teks yang melewati tepi kanan kolom (lebar dihitung dari metrik font tertanam).
const fonts = fontRapor();
assert.ok(fonts && fonts.regular.widths[65 - 32] > 0, 'lebar huruf terbaca dari berkas TTF');
for (const run of textRuns(multi)) {
  const right = run.x + textWidth(run.value, run.size, run.font, run.spacing, fonts);
  assert.ok(right <= 556, `${run.value} berakhir di ${right.toFixed(1)}`);
}

// Logo PNG berpalet terbaca dengan ukuran aslinya.
const logo = decodePng(fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo-emblem-gold.png')));
assert.deepEqual([logo.width, logo.height], [160, 174]);

// Karakter di luar Latin-1 diganti "?", bukan menghasilkan byte rusak.
assert.equal(pdfLiteral('فقه'), '???');
assert.equal(pdfLiteral('Café (1)'), 'Caf\\351 \\(1\\)');
assertValidPdf(createDocumentPdf({ blocks: [] }));

console.log(`student report pdf tests passed (${halaman} halaman untuk 20 kegiatan panjang)`);
