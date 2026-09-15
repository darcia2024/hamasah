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

const created = service.createStudent({
  name: 'Abdullah Fikri', program: 'Kuliah Al-Azhar', city: 'Kairo', joinDate: '2026-08-20',
  studentAccountId: studentActor.id, parentAccountIds: [parent.id]
}, admin);
assert.equal(created.ok, true);
const studentId = created.value.id;

assert.equal(service.addActivity(studentId, { title: 'Talaqqi pagi', description: 'Membaca kitab bersama pembina.' }, admin).ok, true);
assert.equal(service.addAchievement(studentId, { title: 'Menyelesaikan hafalan Juz 1' }, admin).ok, true);
assert.equal(service.addAttendance(studentId, { status: 'present', category: 'Subuh berjamaah' }, admin).ok, true);
assert.equal(service.addAttendance(studentId, { status: 'late', category: 'Mudzakarah malam' }, admin).ok, true);
assert.equal(service.addEvaluation(studentId, { note: 'Perkembangan bahasa Arab terlihat konsisten.', area: 'Akademik' }, admin).ok, true);
assert.equal(service.addViolation(studentId, { note: 'Terlambat kembali ke asrama setelah kegiatan.', level: 'ringan' }, admin).ok, true);
assert.equal(service.addActivity(studentId, { title: 'Tidak berhak' }, parent).ok, false);

const parentDashboard = service.dashboard(studentId, parent);
assert.equal(parentDashboard.ok, true);
assert.equal(parentDashboard.value.attendance.rate, 100);
assert.equal(parentDashboard.value.achievements.length, 1);
assert.equal(service.dashboard(studentId, studentActor).ok, true);
assert.equal(service.dashboard(studentId, { id: 'parent-lain', role: 'parent' }).ok, false);
assert.equal(service.listForActor(parent).length, 1);
assert.equal(service.listForActor(studentActor).length, 1);

console.log('student-portal-service tests passed');
