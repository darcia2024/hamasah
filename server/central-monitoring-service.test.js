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
    const staffDormitories = async (accountId) => (await database.query('SELECT dormitory_id FROM staff_dormitory_assignments WHERE account_id = $1', [accountId])).rows.map((row) => row.dormitory_id);
    const layanan = createCentralMonitoringService({ database, healthEnabled: true, staffDormitories });

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
    assert.equal((await layanan.create({ studentId: santriId, kind: 'lapor-diri', note: 'x', dueOn: '2026-11-15' }, ADMIN)).ok, false);
    assert.equal((await layanan.create({ studentId: santriId, kind: 'lapor-diri', note: 'Tanpa batas waktu tidak boleh.' }, ADMIN)).ok, false, 'Batas waktu wajib supaya hitung mundur jalan.');
    assert.equal((await layanan.create({ studentId: santriId, kind: 'lapor-diri', note: 'Lapor diri ke kantor imigrasi belum dilakukan.', dueOn: 'besok' }, ADMIN)).ok, false);
    const dibuat = await layanan.create({ studentId: santriId, kind: 'lapor-diri', note: 'Lapor diri ke kantor imigrasi belum dilakukan.', dueOn: '2026-11-15' }, ADMIN);
    assert.equal(dibuat.ok, true);
    await layanan.create({ studentId: santriId, kind: 'lapor-diri', note: 'Catatan kedua untuk santri yang sama.', dueOn: '2020-01-01' }, ADMIN);
    setelah = (await layanan.overview(ADMIN, { kind: 'lapor-diri' })).value;
    assert.equal(setelah.cases.items.length, 2, 'Satu santri boleh punya beberapa masalah manual.');
    const manual = setelah.cases.items.find((item) => item.caseId === dibuat.value.caseId);
    assert.equal(manual.status, 'baru');
    assert.equal(manual.dueOn, '2026-11-15');
    assert.ok(Number.isInteger(manual.daysLeft), 'Hitung mundur terisi dari batas waktu.');
    const terlambat = setelah.cases.items.find((item) => item.dueOn === '2020-01-01');
    assert.ok(terlambat.daysLeft < 0 && /terlambat/.test(terlambat.title) && terlambat.severity === 'tinggi');
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
    assert.equal(negaraDariWilayah('Indonesia, Bogor'), 'Indonesia');
    assert.equal(negaraDariWilayah('Bogor, Jawa Barat'), 'Mesir', 'Hanya yang jelas menyebut Indonesia.');
    assert.equal(negaraDariWilayah('Hayy Sabi, Kairo'), 'Mesir');

    // Santri cuti panjang tidak dihitung aktif, tapi angkanya dipisah.
    const sebelumCuti = (await layanan.overview(ADMIN)).value.totals;
    await database.query(`UPDATE students SET status = 'leave' WHERE id = (SELECT id FROM students WHERE status = 'active' LIMIT 1)`);
    const sesudahCuti = (await layanan.overview(ADMIN)).value.totals;
    assert.equal(sesudahCuti.activeStudents, sebelumCuti.activeStudents - 1);
    assert.equal(sesudahCuti.onLongLeave, (sebelumCuti.onLongLeave || 0) + 1);
    await database.query(`UPDATE students SET status = 'active' WHERE status = 'leave'`);
    // Absensi hari ini dirinci per kegiatan, per waktu sholat, dan per asrama.
    const absen = v.attendanceToday;
    assert.deepEqual(absen.prayers.map((p) => p.prayer), ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya']);
    assert.ok(Array.isArray(absen.activities) && absen.dormitories.length > 0);
    assert.ok(absen.dormitories.every((d) => d.students === d.reported + d.notReported));
    assert.equal(absen.dormitories.reduce((jumlah, d) => jumlah + d.notReported, 0), absen.notReported);

    // Musyrif mencatat urusan hanya untuk santri di asramanya, dan hanya urusan manual.
    const musyrif = (await database.query(`SELECT a.account_id, a.dormitory_id FROM staff_dormitory_assignments a WHERE EXISTS (SELECT 1 FROM students s WHERE s.dormitory_id = a.dormitory_id AND s.status = 'active') ORDER BY a.dormitory_id LIMIT 2`)).rows;
    const pembina = { id: musyrif[0].account_id, role: 'supervisor' };
    const asramaMilik = (await database.query('SELECT id FROM students WHERE dormitory_id = $1 AND status = $2 LIMIT 1', [musyrif[0].dormitory_id, 'active'])).rows[0];
    // Santri di asrama lain (tanpa penugasan musyrif ini) dibuat khusus untuk menguji batas akses.
    const asramaLainId = crypto.randomUUID();
    const santriLainId = crypto.randomUUID();
    await database.query(`INSERT INTO dormitories (id, name, area, gender) VALUES ($1, 'Asrama Uji Batas', 'Indonesia, Bogor', 'putra')`, [asramaLainId]);
    await database.query(`INSERT INTO students (id, name, program, city, join_date, status, gender, dormitory_id) VALUES ($1, 'Santri Uji Batas', 'Kuliah S1', 'Bogor', '2026-01-01', 'active', 'putra', $2)`, [santriLainId, asramaLainId]);
    const asramaLain = { id: santriLainId };
    const bukaDaftar = await layanan.urusan(pembina);
    assert.equal(bukaDaftar.ok, true);
    assert.ok(bukaDaftar.value.students.length > 0 && bukaDaftar.value.students.every((s) => s.dormitory));
    assert.equal((await layanan.create({ studentId: asramaMilik.id, kind: 'lapor-pendidikan', note: 'Berkas lapor pendidikan belum diserahkan.', dueOn: '2026-12-01' }, pembina)).ok, true);
    assert.equal((await layanan.create({ studentId: asramaLain.id, kind: 'lapor-pendidikan', note: 'Santri asrama lain tidak boleh.', dueOn: '2026-12-01' }, pembina)).status, 404);
    assert.equal((await layanan.create({ studentId: asramaMilik.id, kind: 'paspor', note: 'Paspor bukan urusan musyrif.', dueOn: '2026-12-01' }, pembina)).ok, false);
    const milikMusyrif = (await layanan.urusan(pembina)).value.items.find((item) => item.studentId === asramaMilik.id && item.kind === 'lapor-pendidikan');
    assert.ok(milikMusyrif && milikMusyrif.recordedBy, 'Pencatat tampil di daftar.');
    assert.equal((await layanan.setStatus({ studentId: asramaMilik.id, kind: 'lapor-pendidikan', ref: milikMusyrif.ref, status: 'selesai' }, pembina)).ok, true);
    assert.equal((await layanan.setStatus({ studentId: asramaMilik.id, kind: 'paspor', ref: '2030-01-01', status: 'diproses' }, pembina)).status, 403);
    assert.equal((await layanan.urusan({ id: null, role: 'student' })).ok, false);

    // Negara asrama diatur admin; saringan negara memakainya.
    const asramaPertama = v.options.dormitories[0];
    assert.equal(v.options.countrySettable, true);
    assert.equal((await layanan.setCountry(asramaPertama.id, { country: 'Indonesia' }, pembina)).ok, false);
    assert.equal((await layanan.setCountry(asramaPertama.id, { country: 'Narnia' }, ADMIN)).ok, false);
    assert.equal((await layanan.setCountry(asramaPertama.id, { country: 'Indonesia' }, ADMIN)).ok, true);
    const indonesia = (await layanan.overview(ADMIN, { country: 'Indonesia', status: 'semua' })).value;
    assert.equal(indonesia.totals.activeStudents, 1);
    assert.ok((await layanan.overview(ADMIN)).value.totals.activeStudents > indonesia.totals.activeStudents);
    assert.deepEqual(indonesia.options.countries.sort(), ['Indonesia', 'Mesir']);

    console.log('central monitoring tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
