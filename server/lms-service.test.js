const assert = require('node:assert/strict');
const { createLmsService } = require('./lms-service.js');

const student = { id: 'student-account-1', role: 'student' };
const admin = { id: 'admin-1', role: 'admin' };
const service = createLmsService({
  now: function now() { return '2026-09-15T08:00:00.000Z'; },
  // Sengaja async, meniru pemeriksaan akses sungguhan yang membaca database.
  async canAccessStudent(studentId, actor) { return studentId === 'student-1' && actor.id === student.id; }
});

async function run() {
  const course = await service.createCourse({ title: 'Nahwu Dasar', description: 'Pengantar susunan kalimat bahasa Arab.' }, admin);
  assert.equal(course.ok, true);
  const courseId = course.value.id;
  const material = await service.addMaterial(courseId, {
    type: 'video', title: 'Jumlah Ismiyyah', content: 'Video pembahasan mubtada dan khabar.',
    summary: 'Jumlah ismiyyah tersusun dari mubtada dan khabar.', keyPoints: ['Mubtada adalah pokok kalimat.', 'Khabar menyempurnakan makna.'],
    studyGuide: [{ question: 'Apa fungsi khabar?', answer: 'Khabar menyempurnakan makna mubtada.' }]
  }, admin);
  assert.equal(material.ok, true);
  assert.equal((await service.enroll('student-1', courseId, admin)).ok, true);

  const accessible = await service.getStudentCourse('student-1', courseId, student);
  assert.equal(accessible.ok, true);
  assert.equal(accessible.value.progress, 0);
  assert.equal((await service.listStudentCourses('student-1', student)).value.length, 1);
  assert.equal((await service.listCourses(admin)).value.length, 1);
  assert.equal((await service.completeMaterial('student-1', courseId, material.value.id, student)).value.progress, 100);

  const help = await service.studyHelp('student-1', courseId, material.value.id, 'Apa fungsi khabar?', student);
  assert.equal(help.ok, true);
  assert.equal(help.value.answer, 'Khabar menyempurnakan makna mubtada.');

  // Santri tidak boleh membuka maddah milik santri lain.
  assert.equal((await service.getStudentCourse('student-2', courseId, student)).ok, false);
  assert.equal((await service.listStudentCourses('student-2', student)).ok, false);
  assert.equal((await service.completeMaterial('student-2', courseId, material.value.id, student)).ok, false);
  assert.equal((await service.studyHelp('student-2', courseId, material.value.id, 'Apa fungsi khabar?', student)).ok, false);

  console.log('lms-service tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
