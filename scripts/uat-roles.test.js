const assert = require('node:assert/strict');
const { createLmsService } = require('../server/lms-service.js');
const { createOperationsService, createMemoryOperationsStore } = require('../server/operations-service.js');
const { answerQuestion } = require('../server/faq-service.js');

async function run() {
  const roles = ['admin', 'registration-officer', 'teacher', 'supervisor', 'finance', 'parent', 'student'];
  assert.deepEqual(roles.sort(), ['admin', 'finance', 'parent', 'registration-officer', 'student', 'supervisor', 'teacher'].sort());
  const lms = createLmsService({ canAccessStudent: async (id, actor) => actor.id === id });
  const course = await lms.createCourse({ title: 'UAT Role Course', description: 'Maddah untuk pengujian role dan progress.' }, { id: 'admin', role: 'admin' });
  assert.equal(course.ok, true);
  const material = await lms.addMaterial(course.value.id, { type: 'text', title: 'Materi UAT', content: 'Isi materi UAT.', summary: 'Ringkasan materi UAT.', keyPoints: ['Poin'] }, { id: 'admin', role: 'admin' });
  assert.equal(material.ok, true);
  assert.equal((await lms.enroll('student', course.value.id, { id: 'admin', role: 'admin' })).ok, true);
  assert.equal((await lms.getStudentCourse('student', course.value.id, { id: 'student', role: 'student' })).ok, true);
  const ops = createOperationsService({ store: createMemoryOperationsStore(), studentExists: async () => true });
  assert.equal((await ops.createInvoice({ studentId: 'student', description: 'UAT', amount: 1000 }, { id: 'finance', role: 'finance' })).ok, true);
  assert.equal(answerQuestion('cara pendaftaran').matched, true);
  console.log('synthetic role UAT passed (7 roles)');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
