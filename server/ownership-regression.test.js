const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryLmsStore, createLmsService } = require('./lms-service');
const { createMemoryStudentStore, createStudentPortalService } = require('./student-portal-service');
const { createPostgresStudentStore } = require('./postgres-student-store');
const { createPostgresLmsStore } = require('./postgres-lms-store');
const { POLICIES } = require('./storage/upload-policies');
const admin = { id: 'admin', role: 'admin' };
const student = { id: 'account', role: 'student' };
const owner = { id: 'owner', role: 'teacher' };
async function fixture() {
  const store = createMemoryLmsStore();
  await store.createCourse({ id: 'course', title: 'Course', ownerAccountId: owner.id });
  for (const [id, type, content] of [['text','text','lesson'],['quiz','quiz',JSON.stringify({ questions: [{prompt:'Q',answer:'A'}] })],['assignment','assignment','task']]) await store.addMaterial('course', { id, type, content, title: id });
  await store.addEnrollment('s', 'course');
  const service = createLmsService({ store, canAccessStudent: async (id, actor) => id === 's' && actor.id === student.id });
  return { store, service };
}
test('only the linked student can write completions, quizzes and assignments; staff can still view', async () => {
  const { store, service } = await fixture();
  for (const actor of [admin, owner, {id:'super',role:'supervisor'}, {id:'other',role:'student'}, {id:'parent',role:'parent'}, null]) {
    assert.equal((await service.completeMaterial('s','course','text',actor)).ok,false);
    assert.equal((await service.submitQuiz('s','course','quiz',{0:'A'},actor)).ok,false);
    assert.equal((await service.submitAssignment('s','course','assignment',{body:'answer'},actor)).ok,false);
  }
  assert.deepEqual(await store.listCompletions('s'), []);
  assert.deepEqual(await store.listAttempts('s'), []);
  assert.deepEqual(await store.listSubmissionsByCourse('course'), []);
  assert.equal((await service.listStudentCourses('s',owner)).ok,true);
  assert.equal((await service.completeMaterial('s','course','text',student)).ok,true);
  assert.equal((await service.submitQuiz('s','course','quiz',{0:'A'},student)).ok,true);
  assert.equal((await service.submitAssignment('s','course','assignment',{body:'answer'},student)).ok,true);
});
test('review requires course ownership and rejection does not complete a submission', async () => {
  const { store, service } = await fixture();
  const { value } = await service.submitAssignment('s','course','assignment',{body:'answer'},student);
  for (const actor of [{id:'other',role:'teacher'}, {id:'super',role:'supervisor'}]) assert.equal((await service.reviewSubmission(value.id,{score:90,note:'Good'},actor)).ok,false);
  assert.equal((await store.getSubmissionById(value.id)).status,'submitted');
  assert.deepEqual(await store.listCompletions('s'),[]);
  assert.equal((await service.reviewSubmission(value.id,{score:90,note:'Good'},owner)).ok,true);
  assert.equal((await service.reviewSubmission(value.id,{score:95,note:'Good'},admin)).ok,true);
});
test('correction binds authorized student at memory store and service', async () => {
  const store = createMemoryStudentStore();
  for (const id of ['s','other']) await store.saveStudent({id,parentAccountIds:[]});
  await store.append('activities',{id:'record',studentId:'other',title:'Original'});
  const correction = {value:{title:'Changed'},reason:'Correction'};
  assert.equal(await store.correctRecord('activities','record','s',correction),null);
  const service = createStudentPortalService({store});
  assert.equal((await service.correctRecord('s','activities','record',correction,admin)).ok,false);
  assert.equal((await store.byStudent('activities','other'))[0].title,'Original');
  assert.equal((await service.correctRecord('other','activities','record',correction,admin)).ok,true);
});
test('Postgres correction query binds and locks student ownership before any writes', async () => {
  const calls=[];
  const tx={query:async(sql,params)=>{calls.push({sql,params});return {rows:[]};}};
  const store=createPostgresStudentStore({database:{withTransaction:async(fn)=>fn(tx)}});
  assert.equal(await store.correctRecord('activities','record','s',{value:{title:'Changed'}}),null);
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/student_id = \$2 FOR UPDATE/);
  assert.deepEqual(calls[0].params,['record','s']);
});
test('Postgres submission lookup contract returns null for missing IDs', async () => {
  const store=createPostgresLmsStore({database:{query:async(sql,params)=>{assert.match(sql,/WHERE id = \$1/);assert.deepEqual(params,['missing']);return {rows:[]};}}});
  assert.equal(await store.getSubmissionById('missing'),null);
});
test('course-file upload delegates the same course ownership policy as video', async () => {
  for (const allowed of [true,false]) {
    const ctx={actor:owner,entityId:'course',services:{lmsService:{canManageFiles:async(id,actor)=>{assert.equal(id,'course');assert.equal(actor,owner);return allowed;}}}};
    assert.equal(await POLICIES['course-file'].canUpload(ctx),allowed);
    assert.equal(await POLICIES['course-video'].canUpload(ctx),allowed);
  }
});
test('dashboard includes precisely the Jakarta calendar day and validates dates', async () => {
  const store=createMemoryStudentStore(); await store.saveStudent({id:'s',parentAccountIds:[]});
  for (const [id,occurredAt] of [['before','2026-10-21T16:59:59.999Z'],['start','2026-10-21T17:00:00.000Z'],['end','2026-10-22T16:59:59.999Z'],['after','2026-10-22T17:00:00.000Z']]) await store.append('activities',{id,studentId:'s',occurredAt});
  const service=createStudentPortalService({store});
  const result=await service.dashboard('s',admin,{from:'2026-10-22',to:'2026-10-22'});
  assert.deepEqual(result.value.activities.map(x=>x.id),['end','start']);
  for (const range of [{from:'2026-02-30'},{to:'2026-10-22T00:00:00Z'},{from:'2026-10-23',to:'2026-10-22'}]) assert.equal((await service.dashboard('s',admin,range)).ok,false);
});
test('Postgres corrections preserve foreign records and persist matching corrections with history', async () => {
  const { createTestDatabase } = require('./test-support/database');
  const { randomUUID } = require('node:crypto');
  const database = await createTestDatabase();
  try {
    const store = createPostgresStudentStore({ database });
    const ids = [randomUUID(), randomUUID()];
    for (const id of ids) await database.query("INSERT INTO students (id,name,program,city,join_date,status) VALUES ($1,'Dummy','Test','Test','2026-10-22','active')",[id]);
    const recordId=randomUUID();
    await store.append('activities',{id:recordId,studentId:ids[1],title:'Original',description:'Dummy',occurredAt:'2026-10-22T00:00:00Z',createdAt:'2026-10-22T00:00:00Z'});
    const correction={value:{title:'Corrected'},reason:'Test correction',createdAt:'2026-10-22T01:00:00Z'};
    assert.equal(await store.correctRecord('activities',recordId,ids[0],correction),null);
    assert.equal((await store.byStudent('activities',ids[1]))[0].title,'Original');
    assert.equal((await database.query('SELECT * FROM student_record_corrections')).rows.length,0);
    assert.equal((await store.correctRecord('activities',recordId,ids[1],correction)).record.title,'Corrected');
    assert.equal((await database.query('SELECT * FROM student_record_corrections')).rows.length,1);
  } finally { await database.close(); }
});
