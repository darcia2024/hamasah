const assert = require('node:assert/strict');
const { createApplicantService } = require('./applicant-service.js');

async function run() {
  const records = new Map([['HI-REG-2026-00001', { id: 'registration-1', registrationId: 'HI-REG-2026-00001', accessCodeHash: null, applicant: { applicantName: 'Fikri', email: 'fikri@example.test' } }]]);
  const sessions = new Map();
  const store = { async get(id) { return records.get(id) || null; }, async update(record) { records.set(record.registrationId, record); return record; } };
  const sessionStore = { async save(item) { sessions.set(item.tokenHash, item); }, async get(hash) { return sessions.get(hash) || null; }, async remove(hash) { sessions.delete(hash); }, async removeExpired() { return 0; } };
  const service = createApplicantService({ registrationStore: store, sessionStore });
  const code = service.createAccessCode();
  assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
  records.get('HI-REG-2026-00001').accessCodeHash = await service.hashAccessCode(code);
  assert.equal((await service.login('HI-REG-2026-00001', 'SALAH')).ok, false);
  const login = await service.login('HI-REG-2026-00001', code);
  assert.equal(login.ok, true);
  assert.equal((await service.authenticate(login.value.accessToken, 'HI-REG-2026-00001')).ok, true);
  assert.equal((await service.authenticate(login.value.accessToken, 'HI-REG-2026-00002')).ok, false);
  await service.logout(login.value.accessToken);
  assert.equal((await service.authenticate(login.value.accessToken, 'HI-REG-2026-00001')).ok, false);
  const recovered = await service.recoverAccessCode('HI-REG-2026-00001', 'FIKRI@example.test');
  assert.equal(recovered.ok, true);
  assert.equal((await service.login('HI-REG-2026-00001', code)).ok, false);
  assert.equal((await service.login('HI-REG-2026-00001', recovered.value.accessCode)).ok, true);
  assert.equal((await service.recoverAccessCode('HI-REG-2026-00001', 'other@example.test')).ok, false);
  console.log('applicant service tests passed');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
