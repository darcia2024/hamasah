// Ringkasan dashboard super admin, diuji dengan data demo yang realistis.
const assert = require('node:assert/strict');
const { createTestDatabase } = require('./test-support/database.js');
const { createAdminOverviewService } = require('./admin-overview-service.js');
const { DEMO_DORMITORIES, DEMO_STUDENTS, LOCAL_DEMO_PASSWORD, isiDataDemo } = require('../scripts/demo-data.js');

const ADMIN = { id: null, role: 'admin' };

async function run() {
  const database = await createTestDatabase();
  try {
    // Database kosong tetap menghasilkan ringkasan yang utuh, bukan galat.
    const kosong = await createAdminOverviewService({ database }).overview(ADMIN);
    assert.equal(kosong.ok, true);
    assert.equal(kosong.value.summary.activeStudents, 0);
    assert.deepEqual(kosong.value.students, []);

    await isiDataDemo({ database, kataSandi: LOCAL_DEMO_PASSWORD, logger: { log() {} } });

    // Hanya admin.
    for (const role of ['supervisor', 'finance', 'registration-officer', 'teacher', 'parent', 'student']) {
      assert.equal((await createAdminOverviewService({ database }).overview({ id: null, role })).ok, false, role);
    }
    assert.equal((await createAdminOverviewService({ database }).overview(null)).ok, false);

    const hasil = await createAdminOverviewService({ database, healthEnabled: true }).overview(ADMIN);
    assert.equal(hasil.ok, true);
    const { summary, students, dormitories, supervisors, alerts } = hasil.value;

    assert.equal(summary.activeStudents, DEMO_STUDENTS.length);
    assert.equal(students.length, DEMO_STUDENTS.length);
    assert.equal(summary.putra, DEMO_STUDENTS.filter((s) => s.gender === 'putra').length);
    assert.equal(summary.putri, DEMO_STUDENTS.filter((s) => s.gender === 'putri').length);
    assert.equal(summary.unplaced, 0);
    assert.equal(summary.dormitories, DEMO_DORMITORIES.length);
    assert.equal(summary.occupied, DEMO_STUDENTS.length);
    assert.equal(summary.capacity, DEMO_DORMITORIES.reduce((jumlah, d) => jumlah + d.capacity, 0));
    assert.equal(summary.supervisors, 2);
    assert.ok(summary.attendanceRate7 > 50 && summary.attendanceRate7 <= 100, 'Persentase kehadiran masuk akal.');
    assert.ok(summary.prayerRate7 > 50 && summary.prayerRate7 <= 100, 'Persentase sholat berjamaah masuk akal.');
    assert.ok(summary.unpaidInvoices > 0 && summary.unpaidAmount > 0);
    assert.deepEqual(summary.programs.map((p) => p.label).sort(), ['Kuliah S1 Al-Azhar', "Ma'had Al-Azhar"]);

    // Asrama: penghuni sesuai jenis kelamin, dan musyrifnya tercantum.
    for (const asrama of dormitories) {
      assert.equal(asrama.supervisors.length, 1, asrama.name);
      // Kegiatan bersama dikelompokkan: satu baris per judul dan tanggal, dengan jumlah peserta.
      assert.ok(asrama.activities.length > 0, `${asrama.name} punya kegiatan.`);
      assert.ok(asrama.activities.every((k) => k.participants >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(k.date)));
      assert.ok(asrama.activities.some((k) => k.participants === asrama.occupied), 'Kegiatan bersama diikuti semua penghuni.');
      assert.ok(asrama.attendanceRate7 > 0 && asrama.prayerRate7 > 0);
      assert.ok(asrama.students.every((s) => students.find((x) => x.id === s.id).gender === asrama.gender), asrama.name);
    }
    // Musyrif: memegang satu asrama dan terlihat aktif mencatat pekan ini.
    for (const musyrif of supervisors) {
      assert.equal(musyrif.dormitories.length, 1, musyrif.name);
      assert.ok(musyrif.studentCount > 0);
      assert.ok(musyrif.records7 > 0, `${musyrif.name} punya catatan sepekan ini.`);
      assert.ok(musyrif.lastRecordedAt);
    }

    // Santri: catatan harian, hafalan, tagihan, dan visa ikut terangkum.
    const rayhan = students.find((s) => s.name === 'Rayhan Akbar Wibowo');
    assert.ok(rayhan.attendance7.recorded >= 7);
    // Jendela 7 hari termasuk hari ini; data demo mencatat 1 sampai 7 hari lalu, jadi
    // yang masuk enam hari kali lima waktu.
    assert.equal(rayhan.prayers7.recorded, 30);
    assert.ok(rayhan.memorization.last);
    assert.equal(rayhan.hasStudentAccount, true);
    assert.equal(rayhan.parentAccounts, 1);
    assert.equal(rayhan.visa.status, 'approved');

    // Perhatian: data demo sengaja memuat santri sakit, paspor hampir habis, dan visa
    // yang segera habis.
    const jenis = new Set(alerts.map((a) => a.kind));
    for (const harus of ['kesehatan', 'paspor', 'visa']) assert.ok(jenis.has(harus), `Ada peringatan ${harus}.`);
    assert.ok(alerts.some((a) => a.kind === 'kesehatan' && a.title.startsWith('Daffa')), 'Maag Daffa masuk daftar.');
    assert.deepEqual(alerts.map((a) => a.level), [...alerts.map((a) => a.level)].sort((a, b) => ['tinggi', 'sedang', 'info'].indexOf(a) - ['tinggi', 'sedang', 'info'].indexOf(b)), 'Urut dari yang paling mendesak.');

    // Tanpa fitur kesehatan, tidak ada data kesehatan sama sekali.
    const tanpaKesehatan = await createAdminOverviewService({ database, healthEnabled: false }).overview(ADMIN);
    assert.ok(tanpaKesehatan.value.students.every((s) => s.health === null));
    assert.ok(!tanpaKesehatan.value.alerts.some((a) => a.kind === 'kesehatan'));

    // Beranda musyrif: hanya santri di asrama yang dipegang, tanpa tagihan dan visa.
    const layanan = createAdminOverviewService({ database, healthEnabled: true });
    for (const role of ['finance', 'teacher', 'parent', 'student', 'registration-officer']) {
      assert.equal((await layanan.dormitoryOverview({ id: null, role })).ok, false, role);
    }
    const semuaAsrama = await layanan.dormitoryOverview(ADMIN);
    assert.equal(semuaAsrama.value.dormitories.length, dormitories.length, 'Admin melihat semua asrama.');
    for (const musyrif of supervisors) {
      const asramanya = dormitories.find((d) => d.id === musyrif.dormitories[0].id);
      const binaan = await layanan.dormitoryOverview({ id: musyrif.id, role: 'supervisor' });
      assert.equal(binaan.ok, true, musyrif.name);
      assert.deepEqual(binaan.value.students.map((s) => s.id).sort(), asramanya.students.map((s) => s.id).sort(), musyrif.name);
      assert.deepEqual(binaan.value.dormitories.map((d) => d.id), [asramanya.id]);
      assert.equal(binaan.value.summary.students, asramanya.students.length);
      assert.ok(binaan.value.students.every((s) => !('billing' in s) && !('visa' in s) && !('parentAccounts' in s)));
      assert.ok(binaan.value.students.every((s) => s.prayers7 && s.attendance7 && s.memorization));
    }
    // Musyrif tanpa asrama tidak melihat santri siapa pun.
    const tanpaAsrama = await layanan.dormitoryOverview({ id: '00000000-0000-0000-0000-000000000000', role: 'supervisor' });
    assert.equal(tanpaAsrama.ok, true);
    assert.deepEqual(tanpaAsrama.value.students, []);

    console.log('admin overview tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
