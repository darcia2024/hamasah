const assert = require('node:assert/strict');
const portal = require('./student-portal-service.js');

let counter = 0;
const service = portal.createStudentPortalService({
  now: function now() {
    counter += 1;
    return `2026-09-${String(counter).padStart(2, '0')}T08:00:00.000Z`;
  }
});
const admin = { id: 'admin-1', role: 'admin' };
const parent = { id: 'parent-1', role: 'parent' };
const studentActor = { id: 'student-account-1', role: 'student' };

async function run() {
  const created = await service.createStudent({
    name: 'Abdullah Fikri', program: 'Kuliah Al-Azhar', city: 'Kairo', joinDate: '2026-08-20',
    studentAccountId: studentActor.id, parentAccountIds: [parent.id]
  }, admin);
  assert.equal(created.ok, true);
  const studentId = created.value.id;
  const sibling = await service.createStudent({ name: 'Saudara Fikri', program: 'Program Mahad', city: 'Kairo', joinDate: '2026-08-21', parentAccountIds: [parent.id] }, admin);
  assert.equal(sibling.ok, true);

  assert.equal((await service.addActivity(studentId, { title: 'Talaqqi pagi', description: 'Membaca kitab bersama pembina.' }, admin)).ok, true);
  assert.equal((await service.addAchievement(studentId, { title: 'Menyelesaikan hafalan Juz 1' }, admin)).ok, true);
  const attendance = await service.addAttendance(studentId, { status: 'present', category: 'Subuh berjamaah', occurredAt: '2026-09-03T08:00:00.000Z' }, admin);
  assert.equal(attendance.ok, true);
  const corrected = await service.correctRecord(studentId, 'attendance', attendance.value.id, { reason: 'Koreksi rekap harian', value: { status: 'late' } }, admin);
  assert.equal(corrected.ok, true);
  assert.equal(corrected.value.status, 'late');
  assert.equal((await service.addAttendance(studentId, { status: 'present', category: 'Subuh berjamaah', occurredAt: '2026-09-03T08:00:00.000Z' }, admin)).ok, false, 'Presensi sesi yang sama tidak boleh ganda.');
  assert.equal((await service.addAttendance(studentId, { status: 'late', category: 'Mudzakarah malam' }, admin)).ok, true);
  assert.equal((await service.addEvaluation(studentId, { note: 'Perkembangan bahasa Arab terlihat konsisten.', area: 'Akademik' }, admin)).ok, true);
  assert.equal((await service.addViolation(studentId, { note: 'Terlambat kembali ke asrama setelah kegiatan.', level: 'ringan' }, admin)).ok, true);
  assert.equal((await service.addActivity(studentId, { title: 'Tidak berhak' }, parent)).ok, false);

  // Task R2.4. Pencatat diambil dari sesi yang sedang login. Route meneruskan
  // body request apa adanya ke service, jadi di sinilah titipan dari body harus
  // kalah dari actor.
  const titipan = await service.addViolation(studentId, {
    note: 'Catatan dengan pencatat titipan di dalam body.', level: 'ringan',
    recordedByAccountId: 'akun-orang-lain', recorded_by_account_id: 'akun-orang-lain'
  }, admin);
  assert.equal(titipan.ok, true);
  assert.equal(titipan.value.recordedByAccountId, admin.id, 'Pencatat harus berasal dari sesi, bukan dari isi request.');

  const kegiatanTitipan = await service.addActivity(studentId, {
    title: 'Kegiatan dengan pencatat titipan', description: 'Isi apa saja.',
    recordedByAccountId: 'akun-orang-lain'
  }, admin);
  assert.equal(kegiatanTitipan.value.recordedByAccountId, admin.id);

  const parentDashboard = await service.dashboard(studentId, parent);
  assert.equal(parentDashboard.ok, true);
  assert.equal(parentDashboard.value.attendance.rate, 100);
  assert.equal(parentDashboard.value.achievements.length, 1);
  const periodDashboard = await service.dashboard(studentId, parent, { from: '2026-09-01', to: '2026-09-02' });
  assert.equal(periodDashboard.ok, true);
  assert.equal(periodDashboard.value.attendance.total, 0);
  assert.equal((await service.dashboard(studentId, parent, { from: 'tanggal-salah', to: '2026-09-02' })).ok, false);
  assert.equal((await service.dashboard(studentId, studentActor)).ok, true);
  assert.equal((await service.dashboard(sibling.value.id, parent)).ok, true);

  // Wali lain tidak boleh melihat rekam jejak santri ini.
  assert.equal((await service.dashboard(studentId, { id: 'parent-lain', role: 'parent' })).ok, false);
  assert.equal((await service.listForActor({ id: 'parent-lain', role: 'parent' })).length, 0);
  assert.equal((await service.listForActor(parent)).length, 2);
  assert.equal((await service.listForActor(studentActor)).length, 1);

  // Santri yang tidak ada tetap ditolak, bukan menghasilkan objek kosong.
  assert.equal((await service.dashboard('santri-tidak-ada', admin)).ok, false);

  console.log('student-portal-service tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
