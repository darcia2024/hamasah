const assert = require('node:assert/strict');
const identity = require('./identity-service.js');

let timestamp = new Date('2026-09-15T08:00:00.000Z').getTime();
const service = identity.createIdentityService({
  now: function now() { return new Date(timestamp); }
});

async function run() {
  const invalid = await service.createAccount({
    email: 'bad-email', name: 'A', role: identity.ROLES.ADMIN, password: 'short'
  });
  assert.equal(invalid.ok, false);

  const account = await service.createAccount({
    email: ' Admin@hamasah.test ', name: 'Admin Hamasah', role: identity.ROLES.ADMIN, password: 'kata-sandi-admin-aman'
  });
  assert.equal(account.ok, true);
  assert.equal(account.value.email, 'admin@hamasah.test');
  assert.equal('passwordHash' in account.value, false);

  const duplicate = await service.createAccount({
    email: 'admin@hamasah.test', name: 'Admin Lain', role: identity.ROLES.ADMIN, password: 'kata-sandi-admin-aman'
  });
  assert.equal(duplicate.ok, false);

  const login = await service.login('admin@hamasah.test', 'kata-sandi-admin-aman');
  assert.equal(login.ok, true);
  assert.equal(login.value.account.role, identity.ROLES.ADMIN);
  assert.equal((await service.authenticate(login.value.accessToken)).ok, true);
  assert.equal((await service.authenticate('token-salah')).ok, false);

  const reset = await service.issuePasswordReset('admin@hamasah.test');
  assert.equal(Boolean(reset.value.resetToken), true);
  const resetDone = await service.resetPassword('admin@hamasah.test', reset.value.resetToken, 'kata-sandi-baru-aman');
  assert.equal(resetDone.ok, true);
  assert.equal((await service.login('admin@hamasah.test', 'kata-sandi-admin-aman')).ok, false);
  assert.equal((await service.login('admin@hamasah.test', 'kata-sandi-baru-aman')).ok, true);
  assert.equal((await service.listAccounts()).length, 1);

  await service.logout(login.value.accessToken);
  assert.equal((await service.authenticate(login.value.accessToken)).ok, false);

  timestamp += 1000;
}

run().then(function done() {
  console.log('identity-service tests passed');
}).catch(function fail(error) {
  console.error(error);
  process.exitCode = 1;
});
