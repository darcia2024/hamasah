// Monitoring pusat: angka hari ini, absensi, daftar masalah beserta status dan filternya.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createCentralMonitoringService, negaraDariWilayah } = require('./central-monitoring-service.js');
const { DEMO_STUDENTS, LOCAL_DEMO_PASSWORD, isiDataDemo } = require('../scripts/demo-data.js');

const ADMIN = { id: null, role: 'admin' };

async function run() {
  const database = await createTestDatabase();
  try {
    const layanan = createCentralMonitoringService({ database, healthEnabled: true });

    // Database kosong tetap menghasilkan respons utuh.
    const kosong = await layanan.overview(ADMIN);
    assert.equal(kosong.ok, true);
    assert.equal(kosong.value.totals.activeStudents, 0);
    assert.deepEqual(kosong.value.cases.items, []);

    await isiDataDemo({ database, kataSandi: LOCAL_DEMO_PASSWORD, logger: { log() {} } });

    // Hanya admin.
    for (const role of ['supervisor', 'finance', 'registration-officer', 'teacher', 'parent', 'student']) {
      assert.equal((await layanan.overview({ id: null, role })).ok, false, role);
      assert.equal((await layanan.create({}, { id: null, role })).ok, false, role);
      assert.equal((await layanan.setStatus({}, { id: null, role })).ok, false, role);
    }

    const hasil = await layanan.overview(ADMIN);
    assert.equal(hasil.ok, true);
    const v = hasil.value;
    assert.equal(v.totals.activeStudents, DEMO_STUDENTS.length);
    assert.ok(v.totals.dormitories > 0 && v.totals.supervisors > 0);
    assert.ok(v.totals.onLeave >= 0 && v.totals.sick >= 0);
    // Absensi: setiap santri aktif terhitung tepat di satu tempat (dilaporkan, izin berjalan, atau belum dilaporkan).
    const a = v.attendanceToday;
    assert.equal(a.recordedStudents + a.notReported + a.onLeaveUnrecorded, v.totals.activeStudents);
    assert.equal(a.notReportedStudents.length, a.notReported);

    // Paspor dan iqamah ikut muncul dari data visa, awalnya berstatus baru.
    const rayhan = v.cases.items.filter((item) => item.studentName === 'Rayhan Akbar Wibowo');
    assert.deepEqual(rayhan.map((item) => item.kind).sort(), ['iqamah', 'paspor']);
    assert.ok(rayhan.every((item) => item.status === 'baru' && item.caseId === null));
    assert.ok(v.cases.counts.baru >= 2);
    assert.deepEqual(Object.keys(v.cases.byKind).sort(), ['iqamah', 'lapor-diri', 'lapor-pendidikan', 'paspor', 'status-pendidikan']);
    assert.ok(v.options.kinds.length === 5 && v.options.statuses.length === 5);

    // Ubah status: barisnya dibuat saat pertama kali diubah, dan status mengikuti.
    const iqamah = rayhan.find((item) => item.kind === 'iqamah');
    const diproses = await layanan.setStatus({ studentId: iqamah.studentId, kind: 'iqamah', ref: iqamah.ref, status: 'diproses', note: 'Berkas sudah ke kantor imigrasi.' }, ADMIN);
    assert.equal(diproses.ok, true);
    let setelah = (await layanan.overview(ADMIN)).value;
    const baru = setelah.cases.items.find((item) => item.key === iqamah.key);
    assert.equal(baru.status, 'diproses');
    assert.equal(baru.note, 'Berkas sudah ke kantor imigrasi.');
    assert.ok(baru.caseId);
    assert.equal(setelah.cases.counts.diproses, 1);

    // Selesai: hilang dari daftar bawaan (belum selesai), muncul di filter "selesai".
    assert.equal((await layanan.setStatus({ studentId: iqamah.studentId, kind: 'iqamah', ref: iqamah.ref, status: 'selesai' }, ADMIN)).ok, true);
    setelah = (await layanan.overview(ADMIN)).value;
    assert.ok(!setelah.cases.items.some((item) => item.key === iqamah.key));
    const selesai = (await layanan.overview(ADMIN, { status: 'selesai' })).value;
    assert.deepEqual(selesai.cases.items.map((item) => item.key), [iqamah.key]);
    assert.equal(selesai.cases.counts.selesai, 1);

    // Tanggal iqamah diperbarui: masalah baru dengan ref baru muncul lagi sebagai "baru".
    // (ref berubah, jadi baris lama tidak ikut.)
    assert.equal((await layanan.setStatus({ studentId: iqamah.studentId, kind: 'iqamah', ref: '2020-01-01', status: 'baru' }, ADMIN)).ok, true);
    assert.equal((await layanan.setStatus({ studentId: iqamah.studentId, kind: 'iqamah', ref: 'bukan-tanggal', status: 'baru' }, ADMIN)).ok, false);
    assert.equal((await layanan.setStatus({ studentId: iqamah.studentId, kind: 'iqamah', ref: iqamah.ref, status: 'ngawur' }, ADMIN)).ok, false);
    assert.equal((await layanan.setStatus({ studentId: crypto.randomUUID(), kind: 'iqamah', ref: iqamah.ref, status: 'baru' }, ADMIN)).status, 404);

    // Masalah manual: lapor diri, lapor pendidikan, status pendidikan.
    const santriId = iqamah.studentId;
    assert.equal((await layanan.create({ studentId: santriId, kind: 'paspor', note: 'tidak boleh manual' }, ADMIN)).ok, false);
    assert.equal((await layanan.create({ studentId: santriId, kind: 'lapor-diri', note: 'x' }, ADMIN)).ok, false);
    assert.equal((await layanan.create({ studentId: santriId, kind: 'lapor-diri', note: 'Lapor diri ke kantor imigrasi belum dilakukan.', dueOn: 'besok' }, ADMIN)).ok, false);
    const dibuat = await layanan.create({ studentId: santriId, kind: 'lapor-diri', note: 'Lapor diri ke kantor imigrasi belum dilakukan.', dueOn: '2026-11-15' }, ADMIN);
    assert.equal(dibuat.ok, true);
    await layanan.create({ studentId: santriId, kind: 'lapor-diri', note: 'Catatan kedua untuk santri yang sama.' }, ADMIN);
    setelah = (await layanan.overview(ADMIN, { kind: 'lapor-diri' })).value;
    assert.equal(setelah.cases.items.length, 2, 'Satu santri boleh punya beberapa masalah manual.');
    const manual = setelah.cases.items.find((item) => item.caseId === dibuat.value.caseId);
    assert.equal(manual.status, 'baru');
    assert.equal(manual.dueOn, '2026-11-15');
    assert.equal((await layanan.setStatus({ studentId: santriId, kind: 'lapor-diri', ref: manual.ref, status: 'diproses' }, ADMIN)).ok, true);
    assert.equal((await layanan.setStatus({ studentId: santriId, kind: 'lapor-diri', ref: 'tidak-ada-baris', status: 'diproses' }, ADMIN)).status, 404);

    // Filter jenjang, negara, dan asrama menyempitkan angka dan daftar bersama-sama.
    const penuh = (await layanan.overview(ADMIN, { status: 'semua' })).value;
    const jenjang = penuh.options.levels[0];
    const sempit = (await layanan.overview(ADMIN, { level: jenjang, status: 'semua' })).value;
    assert.ok(sempit.totals.activeStudents <= penuh.totals.activeStudents);
    assert.ok(sempit.cases.items.every((item) => item.level === jenjang));
    const kosongNegara = (await layanan.overview(ADMIN, { country: 'Negara Antah Berantah' })).value;
    assert.equal(kosongNegara.totals.activeStudents, 0);
    assert.deepEqual(kosongNegara.cases.items, []);
    const asrama = penuh.options.dormitories[0];
    const diAsrama = (await layanan.overview(ADMIN, { dormitoryId: asrama.id, status: 'semua' })).value;
    assert.ok(diAsrama.totals.activeStudents > 0 && diAsrama.totals.activeStudents <= penuh.totals.activeStudents);
    assert.equal(diAsrama.totals.dormitories, 1);
    assert.ok(diAsrama.cases.items.every((item) => item.dormitory === asrama.name));
    // Status yang tidak dikenal jatuh ke bawaan, bukan galat.
    assert.equal((await layanan.overview(ADMIN, { status: 'ngawur' })).value.filter.status, 'aktif');

    // Negara dibaca dari wilayah asrama.
    assert.equal(negaraDariWilayah('Bogor, Jawa Barat'), 'Indonesia');
    assert.equal(negaraDariWilayah('Hayy Sabi, Kairo'), 'Mesir');

    console.log('central monitoring tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
