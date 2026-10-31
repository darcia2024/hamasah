// Pembaca cerita Asisten Hamasah: maksud, nama santri dan asrama, tanggal, jam, dan isi pengumuman dari kalimat sehari-hari.
const assert = require('node:assert/strict');
const nlu = require('./ops-assistant-nlu.js');

// Sabtu, 31 Oktober 2026.
const HARI = '2026-10-31';
const SANTRI = [
  { id: 's1', name: 'Rayhan Akbar Wibowo' },
  { id: 's2', name: 'Muhammad Hafizh Ramadhan' },
  { id: 's3', name: 'Muhammad Zaki Mubarak' },
  { id: 's4', name: 'Nayla Husna Wibowo' }
];
const ASRAMA = [{ id: 'a1', name: 'Asrama Putra Al-Fath' }, { id: 'a2', name: 'Asrama Putri Az-Zahra' }];
const konteks = { santri: SANTRI, asrama: ASRAMA, hariIni: HARI };

// Tanggal.
assert.equal(nlu.bacaTanggal('besok ada rapat', HARI), '2026-11-01');
assert.equal(nlu.bacaTanggal('lusa', HARI), '2026-11-02');
assert.equal(nlu.bacaTanggal('minggu depan ya', HARI), '2026-11-07');
assert.equal(nlu.bacaTanggal('bulan depan', HARI), '2026-11-30');
assert.equal(nlu.bacaTanggal('5 November', HARI), '2026-11-05');
assert.equal(nlu.bacaTanggal('5 Nov 2027', HARI), '2027-11-05');
assert.equal(nlu.bacaTanggal('tanggal 3 Maret', HARI), '2027-03-03', 'Bulan yang sudah lewat tahun ini jatuh ke tahun depan.');
assert.equal(nlu.bacaTanggal('tanggal 20', HARI), '2026-11-20', 'Hari yang sudah lewat bulan ini jatuh ke bulan depan.');
assert.equal(nlu.bacaTanggal('hari Kamis', HARI), '2026-11-05');
assert.equal(nlu.bacaTanggal('dua minggu lagi', HARI), '2026-11-14', 'Angka dalam huruf dikenali.');
assert.equal(nlu.bacaTanggal('hari Minggu', HARI), '2026-11-01');
assert.equal(nlu.bacaTanggal('Sabtu', HARI), '2026-11-07', 'Hari yang sama dihitung pekan depan.');
assert.equal(nlu.bacaTanggal('2 minggu lagi', HARI), '2026-11-14');
assert.equal(nlu.bacaTanggal('2026-12-01', HARI), '2026-12-01');
assert.equal(nlu.bacaTanggal('30 Februari', HARI), null, 'Tanggal yang tidak ada ditolak.');
assert.equal(nlu.bacaTanggal('tidak ada tanggal', HARI), null);

// Jam.
assert.equal(nlu.bacaWaktu('jam 8 malam'), 'pukul 20.00');
assert.equal(nlu.bacaWaktu('pukul 19.30'), 'pukul 19.30');
assert.equal(nlu.bacaWaktu('jam 9 pagi'), 'pukul 09.00');
assert.equal(nlu.bacaWaktu("ba'da Maghrib"), "ba'da Maghrib");
assert.equal(nlu.bacaWaktu('jam 30'), null);
assert.equal(nlu.bacaWaktu('tanpa jam'), null);

// Nama: nama depan yang unik cukup; nama yang dimiliki banyak orang tidak cukup.
assert.equal(nlu.cocokkanNama('kabar Rayhan gimana', SANTRI).cocok.id, 's1');
assert.equal(nlu.cocokkanNama('kabar Muhammad gimana', SANTRI).cocok, null, 'Muhammad dimiliki dua santri.');
assert.equal(nlu.cocokkanNama('Muhammad Zaki', SANTRI).cocok.id, 's3');
assert.equal(nlu.cocokkanNama('Wibowo', SANTRI).cocok, null, 'Wibowo dimiliki dua santri, jadi ambigu.');
assert.equal(nlu.cocokkanNama('Wibowo', SANTRI).kandidat.length, 0, 'Satu kata bersama tidak cukup untuk jadi kandidat.');
assert.equal(nlu.cocokkanNama('Rayhan Wibowo', SANTRI).cocok.id, 's1');
assert.equal(nlu.cocokkanNama('tidak ada nama', SANTRI).cocok, null);

// Maksud dan isian dari cerita.
let r = nlu.baca('Besok ada rapat musyrif jam 8 malam di kantor, tolong umumkan ke semua musyrif', konteks);
assert.equal(r.maksud, 'pengumuman');
assert.equal(r.isian.tanggal, '2026-11-01');
assert.equal(r.isian.waktu, 'pukul 20.00');
assert.equal(r.isian.sasaran, 'musyrif');

r = nlu.baca('Rayhan perlu lapor diri minggu depan', konteks);
assert.equal(r.maksud, 'urusan');
assert.equal(r.isian.kind, 'lapor-diri');
assert.equal(r.isian.studentId, 's1');
assert.equal(r.isian.tanggal, '2026-11-07');

r = nlu.baca('Gimana kabar Rayhan bulan ini?', konteks);
assert.equal(r.maksud, 'perkembangan');
assert.equal(r.isian.studentId, 's1');

r = nlu.baca('ringkas kondisi Asrama Putra Al-Fath', konteks);
assert.equal(r.maksud, 'ringkasan');
assert.equal(r.isian.dormitoryId, 'a1');

r = nlu.baca('putri aja', konteks);
assert.equal(r.maksud, null);
assert.equal(r.isian.dormitoryId, 'a2', 'Jawaban singkat tetap dikenali sebagai asrama.');

assert.equal(nlu.baca('dokumen apa yang perlu ditindaklanjuti?', konteks).maksud, 'dokumen');
assert.equal(nlu.baca('paspor Rayhan kapan habis', konteks).maksud, 'dokumen');
assert.equal(nlu.baca('tolong buat laporan kegiatan pekan ini', konteks).maksud, 'laporan');
assert.equal(nlu.baca('halo', konteks).maksud, 'bantuan');
assert.equal(nlu.baca('bisa apa saja kamu?', konteks).maksud, 'bantuan');
assert.equal(nlu.baca('xyz', konteks).maksud, null);
assert.equal(nlu.baca('kabari semua wali kalau libur', konteks).maksud, 'pengumuman');
assert.equal(nlu.baca('kabari saya perkembangan Rayhan', konteks).maksud, 'perkembangan', 'Kabari tanpa "semua" bukan pengumuman.');
assert.equal(nlu.baca('Lapor pendidikan', konteks).isian.kind, 'lapor-pendidikan');
assert.equal(nlu.baca('status pendidikan Nayla', konteks).isian.kind, 'status-pendidikan');
assert.equal(nlu.baca('xyz', konteks).isian.sasaran, undefined);

// Isi cerita tanpa kalimat perintah.
assert.equal(nlu.isiCerita('Besok ada rapat musyrif jam 8 malam di kantor, tolong umumkan ke semua musyrif'), 'Besok ada rapat musyrif jam 8 malam di kantor');
assert.equal(nlu.isiCerita('Tolong umumkan bahwa besok libur kuliah'), 'besok libur kuliah');
assert.equal(nlu.isiCerita('Besok libur kuliah, umumkan ya'), 'Besok libur kuliah');
assert.equal(nlu.isiCerita('Listrik asrama putra padam sejak tadi pagi'), 'Listrik asrama putra padam sejak tadi pagi');

// Judul.
assert.equal(nlu.judulDari('besok libur kuliah. Kegiatan pagi tetap jalan'), 'Besok libur kuliah');
assert.ok(nlu.judulDari('a'.repeat(30) + ' ' + 'b'.repeat(80)).length <= 83);
assert.equal(nlu.tanggalPanjang('2026-11-05'), 'Kamis, 5 November 2026');

console.log('ops assistant nlu tests passed');
