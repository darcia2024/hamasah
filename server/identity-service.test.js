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
  const resetDone = await service.resetPassword(reset.value.resetToken, 'kata-sandi-baru-aman');
  assert.equal(resetDone.ok, true);
  assert.equal((await service.authenticate(login.value.accessToken)).ok, false, 'Reset password harus mencabut sesi lama.');
  assert.equal((await service.login('admin@hamasah.test', 'kata-sandi-admin-aman')).ok, false);
  assert.equal((await service.login('admin@hamasah.test', 'kata-sandi-baru-aman')).ok, true);

  const concurrentAccount = await service.createAccount({
    email: 'concurrent@hamasah.test', name: 'Concurrent Account', role: identity.ROLES.ADMIN, password: 'kata-sandi-lama-aman'
  });
  assert.equal(concurrentAccount.ok, true);
  const concurrentReset = await service.issuePasswordReset('concurrent@hamasah.test');
  const concurrentResults = await Promise.all([
    service.resetPassword(concurrentReset.value.resetToken, 'kata-sandi-baru-satu'),
    service.resetPassword(concurrentReset.value.resetToken, 'kata-sandi-baru-dua')
  ]);
  assert.equal(concurrentResults.filter((result) => result.ok).length, 1, 'Token reset hanya boleh berhasil sekali saat dipakai bersamaan.');

  const invitation = await service.inviteAccount({
    email: 'wali@hamasah.test', name: 'Wali Hamasah', role: identity.ROLES.PARENT
  });
  assert.equal(invitation.ok, true);
  assert.equal((await service.login('wali@hamasah.test', 'kata-sandi-baru-aman')).ok, false, 'Akun belum aktif sebelum undangan diterima.');
  assert.equal((await service.acceptInvitation('token-salah', 'kata-sandi-wali-aman')).ok, false);
  assert.equal((await service.acceptInvitation(invitation.value.invitationToken, 'kata-sandi-wali-aman')).ok, true);
  assert.equal((await service.acceptInvitation(invitation.value.invitationToken, 'kata-sandi-wali-aman')).ok, false, 'Token undangan hanya dapat digunakan sekali.');
  assert.equal((await service.login('wali@hamasah.test', 'kata-sandi-wali-aman')).ok, true);
  assert.equal((await service.listAccounts()).length, 3);

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
