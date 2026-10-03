const assert = require('node:assert/strict');
const { createLmsService } = require('./lms-service.js');

const student = { id: 'student-account-1', role: 'student' };
const admin = { id: 'admin-1', role: 'admin' };
const teacher = { id: 'teacher-1', role: 'teacher' };
const otherTeacher = { id: 'teacher-2', role: 'teacher' };
const service = createLmsService({
  now: function now() { return '2026-09-15T08:00:00.000Z'; },
  // Sengaja async, meniru pemeriksaan akses sungguhan yang membaca database.
  async canAccessStudent(studentId, actor) { return studentId === 'student-1' && actor.id === student.id; },
  async listStudents() {
    return [
      { id: 'student-1', name: 'Ahmad', program: 'Kuliah', status: 'active', city: 'Bandung' },
      { id: 'student-9', name: 'Lulusan', program: 'Kuliah', status: 'graduated', city: 'Bogor' }
    ];
  },
  async studentNameOf(studentId) { return studentId === 'student-1' ? 'Ahmad' : null; }
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
  const teacherCourse = await service.createCourse({ title: 'Fiqh Dasar', description: 'Pengantar fiqh ibadah harian.' }, teacher);
  assert.equal((await service.listCourses(teacher)).value.length, 1);
  assert.equal((await service.updateMaterial(teacherCourse.value.id, 'materi-tidak-ada', { title: 'X', content: 'Y', summary: 'Ringkasan cukup.' }, otherTeacher)).ok, false);
  assert.equal((await service.addMaterial(teacherCourse.value.id, { type: 'text', title: 'Materi', content: 'Isi materi.', summary: 'Ringkasan materi cukup.', keyPoints: ['Poin'] }, otherTeacher)).ok, false);
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
  // Kuis dan tugas tidak bisa ditandai selesai secara manual (progres palsu).
  const kuisManual = await service.completeMaterial('student-1', courseId, quiz.value.id, student);
  assert.equal(kuisManual.ok, false);
  assert.match(kuisManual.error, /otomatis/);

  const assignment = await service.addMaterial(courseId, { type: 'assignment', title: 'Tugas Ringkas', content: 'Jelaskan mubtada dan khabar.', summary: 'Tugas penjelasan singkat.', keyPoints: ['Struktur kalimat'] }, admin);
  assert.equal(assignment.value.version, 1);
  const updatedMaterial = await service.updateMaterial(courseId, assignment.value.id, { title: 'Tugas Ringkas Revisi', content: 'Jelaskan mubtada dan khabar dengan contoh.', summary: 'Tugas penjelasan dengan contoh.', keyPoints: ['Struktur kalimat', 'Contoh'] }, admin);
  assert.equal(updatedMaterial.value.version, 2);
  assert.equal((await service.completeMaterial('student-1', courseId, assignment.value.id, student)).ok, false, 'Tugas belum dikirim tidak boleh ditandai selesai.');
  assert.equal((await service.getStudentCourse('student-1', courseId, student)).value.materials.find((item) => item.id === assignment.value.id).completed, false);
  const submission = await service.submitAssignment('student-1', courseId, assignment.value.id, { body: 'Mubtada adalah pokok kalimat.' }, student);
  assert.equal(submission.ok, true);
  assert.equal((await service.submitAssignment('student-1', courseId, assignment.value.id, { body: 'Duplikat' }, student)).ok, false);
  const reviewed = await service.reviewSubmission(submission.value.id, { score: 90, note: 'Penjelasan tepat.' }, admin);
  assert.equal(reviewed.value.status, 'reviewed');
  assert.equal((await service.getStudentCourse('student-1', courseId, student)).value.progress, 100);
  assert.equal((await service.getStudentCourse('student-1', courseId, student)).value.completionStatus, 'completed');

  // Ringkasan guru, pilihan santri, dan rekap progres per maddah.
  const ringkasan = await service.teacherSummary(admin);
  assert.equal(ringkasan.ok, true);
  const nahwu = ringkasan.value.courses.find((item) => item.id === courseId);
  assert.deepEqual([nahwu.students, nahwu.pending], [1, 0]);
  assert.equal((await service.teacherSummary(teacher)).value.courses.length, 1, 'Guru hanya melihat maddah yang diampunya.');
  assert.equal((await service.teacherSummary(student)).ok, false);
  const pilihan = await service.studentOptions(teacher);
  assert.deepEqual(pilihan.value, [{ id: 'student-1', name: 'Ahmad', program: 'Kuliah' }], 'Hanya santri aktif, tanpa data pribadi lain.');
  assert.equal((await service.studentOptions(student)).ok, false);
  const progres = await service.courseProgress(courseId, admin);
  assert.equal(progres.ok, true);
  assert.equal(progres.value.items.length, 1);
  assert.equal(progres.value.items[0].studentName, 'Ahmad');
  assert.equal(progres.value.items[0].progress, 100);
  assert.equal(progres.value.items[0].bestQuizScore, 100);
  assert.deepEqual(progres.value.items[0].assignments, { total: 1, pending: 0, reviewed: 1 });
  assert.equal((await service.courseProgress(courseId, teacher)).ok, false, 'Guru lain tidak boleh melihat rekap maddah yang bukan miliknya.');

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
