// Rapor digital PDF wali: struktur PDF sah, isi hanya dari catatan nyata.
const assert = require('node:assert/strict');
const { createDocumentPdf, pdfLiteral } = require('./pdf.js');
const { buildStudentReportBlocks, createStudentReportPdf } = require('./student-report-pdf.js');

// Offset xref harus menunjuk tepat ke awal setiap objek, kalau tidak pembaca PDF menolak.
function assertValidPdf(buffer) {
  const text = buffer.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4\n') && text.endsWith('%%EOF'));
  const xref = Number(text.match(/startxref\n(\d+)\n%%EOF$/)[1]);
  assert.ok(text.slice(xref).startsWith('xref\n'));
  const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
  offsets.forEach((offset, index) => assert.ok(text.slice(offset).startsWith(`${index + 1} 0 obj\n`), `objek ${index + 1}`));
  for (const match of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = match.index + match[0].length;
    assert.equal(text.slice(start + Number(match[1]), start + Number(match[1]) + 10), '\nendstream');
  }
  return text;
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
const courses = [{ title: 'Fathul Qorib', progress: 50, materials: [{ completed: true }, { completed: false }] }];

const text = assertValidPdf(createStudentReportPdf(dashboard, { courses, generatedAt: new Date('2026-09-30T10:00:00Z') }));
assert.ok(text.includes(pdfLiteral('Nama: Santri (Uji) \\ Contoh')), 'kurung dan backslash di-escape');
assert.ok(text.includes(pdfLiteral('3 dari 4 sesi hadir atau terlambat (75%).')));
assert.ok(text.includes(pdfLiteral('Rincian: Hadir 2, Terlambat 1, Tidak hadir 1.')));
assert.ok(text.includes(pdfLiteral('- Fathul Qorib: 1 dari 2 materi selesai (50%)')));
assert.ok(text.includes(pdfLiteral('Periode rapor: 1 September 2026 sampai 30 September 2026')));
assert.ok(text.includes(pdfLiteral('Belum ada kegiatan tercatat pada periode ini.')));
assert.ok(text.includes(pdfLiteral('Tidak ada catatan disiplin pada periode ini.')));
assert.ok(text.includes('\\227'), 'tanda pisah em ditulis sebagai byte WinAnsi');
// Tidak ada nilai atau predikat karangan.
for (const karangan of ['Mumtaz', 'Predikat', 'Indeks Prestasi', 'Sangat Sehat']) assert.ok(!text.includes(karangan), karangan);

// Tanpa catatan sama sekali: setiap bagian mengatakan kosong, tidak ada angka palsu.
const kosong = buildStudentReportBlocks({ ...dashboard, attendance: { total: 0, present: 0, rate: null, byStatus: {} }, achievements: [], evaluations: [] }, { courses: [] }).map((block) => block.text);
assert.ok(kosong.includes('Belum ada presensi tercatat pada periode ini.'));
assert.ok(kosong.includes('Santri belum terdaftar pada maddah mana pun.'));
assert.ok(!kosong.some((line) => /\bnull\b|NaN|undefined/.test(line || '')));
assert.ok(buildStudentReportBlocks(dashboard, { courses: null }).some((block) => block.text === 'Data maddah tidak tersedia untuk akun ini.'));

// Banyak catatan: berlanjut ke halaman berikutnya, penomoran halaman benar.
const banyak = { ...dashboard, activities: Array.from({ length: 20 }, (_, i) => ({ occurredAt: '2026-09-15T08:00:00Z', title: `Kegiatan ${i + 1}`, description: 'Kajian rutin ba\'da Maghrib bersama pembina asrama dengan pembahasan kitab yang panjang sekali '.repeat(3) })) };
const multi = assertValidPdf(createStudentReportPdf(banyak, { courses }));
const halaman = Number(multi.match(/\/Count (\d+)/)[1]);
assert.ok(halaman >= 2, `harus lebih dari satu halaman, dapat ${halaman}`);
assert.ok(multi.includes(pdfLiteral(`Halaman ${halaman} dari ${halaman}`)));
assert.ok(multi.includes(pdfLiteral('Ditampilkan 20 kegiatan terbaru.')));
// Tidak ada baris yang melewati lebar halaman (perkiraan dari jumlah karakter per baris).
for (const match of multi.matchAll(/\/F1 10 Tf (\d+(?:\.\d+)?) [\d.]+ Td \((.*?)\) Tj/g)) assert.ok(match[2].length <= 95, match[2]);

// Karakter di luar Latin-1 diganti "?", bukan menghasilkan byte rusak.
assert.equal(pdfLiteral('فقه'), '???');
assert.equal(pdfLiteral('Café (1)'), 'Caf\\351 \\(1\\)');
assertValidPdf(createDocumentPdf({ blocks: [] }));

console.log(`student report pdf tests passed (${halaman} halaman untuk 20 kegiatan panjang)`);
