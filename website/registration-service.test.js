const assert = require('node:assert/strict');
const domain = require('./registration-domain.js');
const serviceModule = require('./registration-service.js');
async function run() {
  let clock = 0;
  const service = serviceModule.createRegistrationService({ now() { clock += 1; return `2026-09-15T00:00:0${clock}.000Z`; }, startSequence: 27 });
  const submitted = await service.create({ applicantName: 'Naufal Rizki', phone: '0812 3456 7890', guardianName: 'Ahmad Rizki', guardianPhone: '0813 2222 3333', program: domain.PROGRAMS.MAHAD, educationLevel: 'MA', city: 'Bandung', consent: true });
  assert.equal(submitted.ok, true); assert.equal(submitted.value.registrationId, 'HI-REG-2026-00028');
  const id = submitted.value.registrationId;
  assert.equal((await service.addDocument(id, { type: 'passport', storageKey: `registrations/${id}/passport.pdf` }, { role: domain.ROLES.APPLICANT })).ok, true);
  assert.equal((await service.changeStatus(id, domain.STATUSES.DOCUMENT_REVIEW, { role: domain.ROLES.APPLICANT })).ok, false);
  assert.equal((await service.changeStatus(id, domain.STATUSES.DOCUMENT_REVIEW, { role: domain.ROLES.REGISTRATION_OFFICER, note: 'Berkas diperiksa.' })).value.status, domain.STATUSES.DOCUMENT_REVIEW);
  assert.equal((await service.getPublic(id)).value.history.length, 2); assert.equal((await service.listForStaff()).length, 1);
  console.log('registration-service tests passed');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
