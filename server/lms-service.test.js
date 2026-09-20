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

  const quiz = await service.addMaterial(courseId, {
    type: 'quiz', title: 'Kuis Nahwu', content: JSON.stringify({ questions: [{ prompt: 'Pokok kalimat?', answer: 'mubtada' }, { prompt: 'Penyempurna makna?', answer: 'khabar' }] }),
    summary: 'Uji pemahaman dasar nahwu.', keyPoints: ['Mubtada', 'Khabar']
  }, admin);
  assert.equal(quiz.ok, true);
  const gagal = await service.submitQuiz('student-1', courseId, quiz.value.id, { 0: 'salah', 1: 'khabar' }, student);
  assert.equal(gagal.ok, true);
  assert.equal(gagal.value.attempt.score, 50);
  const lulus = await service.submitQuiz('student-1', courseId, quiz.value.id, { 0: 'mubtada', 1: 'khabar' }, student);
  assert.equal(lulus.value.attempt.passed, true);
  assert.equal((await service.submitQuiz('student-1', courseId, quiz.value.id, { 0: 'mubtada', 1: 'khabar' }, student)).ok, true);
  assert.equal((await service.submitQuiz('student-1', courseId, quiz.value.id, { 0: 'mubtada', 1: 'khabar' }, student)).ok, false, 'Percobaan keempat harus ditolak.');

  const assignment = await service.addMaterial(courseId, { type: 'assignment', title: 'Tugas Ringkas', content: 'Jelaskan mubtada dan khabar.', summary: 'Tugas penjelasan singkat.', keyPoints: ['Struktur kalimat'] }, admin);
  const submission = await service.submitAssignment('student-1', courseId, assignment.value.id, { body: 'Mubtada adalah pokok kalimat.' }, student);
  assert.equal(submission.ok, true);
  assert.equal((await service.submitAssignment('student-1', courseId, assignment.value.id, { body: 'Duplikat' }, student)).ok, false);
  const reviewed = await service.reviewSubmission(submission.value.id, { score: 90, note: 'Penjelasan tepat.' }, admin);
  assert.equal(reviewed.value.status, 'reviewed');

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
