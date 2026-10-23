const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createIdentityService, createMemoryAccountStore } = require('./identity-service');
const { createPostgresAccountStore } = require('./postgres-account-store');
const { createTestDatabase } = require('./test-support/database');
const now = '2026-10-23T00:00:00.000Z';
const actor = { id: 'admin', role: 'admin' };

for (const backend of ['memory', 'postgres']) {
  test(`${backend}: lifecycle and stale atomic patches`, async () => {
    const database = backend === 'postgres' ? await createTestDatabase() : null;
    try {
      const store = database ? createPostgresAccountStore({ database }) : createMemoryAccountStore();
      const service = createIdentityService({ accountStore: store, now: () => new Date(now) });
      const invited = await service.inviteAccount({ email: 'pending@example.test', name: 'Pending Person', role: 'parent' });
      const id = invited.value.account.id;
      assert.equal(invited.value.account.lifecycle, 'pending');
      let renewalReached;
      let renewalRelease;
      const renewalPaused = new Promise(resolve => { renewalReached = resolve; });
      const renewalResume = new Promise(resolve => { renewalRelease = resolve; });
      const invitationPatch = store.patch.bind(store);
      store.patch = async (id, version, changes) => {
        if (changes.invitationTokenHash) { renewalReached(); await renewalResume; }
        return invitationPatch(id, version, changes);
      };
      const renewal = service.renewInvitation(id);
      await renewalPaused;
      await service.setAccountActive(id, false, actor);
      renewalRelease();
      assert.equal((await renewal).code, 'ACCOUNT_CHANGED');
      store.patch = invitationPatch;
      const pending = await service.inviteAccount({ email: 'other@example.test', name: 'Other Pending', role: 'parent' });
      assert.equal((await service.setAccountActive(pending.value.account.id, true, actor)).ok, false);
      await service.updateAccount(pending.value.account.id, { role: 'student' }, actor);
      assert.equal((await service.acceptInvitation(pending.value.invitationToken, 'a-long-password-123')).ok, false);


      assert.equal((await service.setAccountActive(id, false, actor)).ok, true);
      assert.equal((await service.renewInvitation(id)).ok, false);
      assert.equal((await service.acceptInvitation(invited.value.invitationToken, 'a-long-password-123')).ok, false);
      assert.equal((await store.getById(id)).invitationTokenHash, null);
      await service.setAccountActive(id, true, actor);
      await service.setAccountActive(id, false, actor);
      assert.equal((await service.renewInvitation(id)).ok, false);

      const created = await service.createAccount({ email: 'active@example.test', name: 'Active Person', role: 'teacher', password: 'a-long-password-123' });
      const target = created.value.id;
      const login = await service.login('active@example.test', 'a-long-password-123');
      const reset = await service.issuePasswordReset('active@example.test');
      const stale = await store.getById(target);
      await service.updateAccount(target, { email: 'new@example.test', role: 'finance' }, actor);
      assert.equal((await service.authenticate(login.value.accessToken)).ok, false);
      assert.equal(await store.patch(target, stale.version, { passwordHash: 'stale-password' }), null);
      assert.equal(await store.save(stale), null);
      assert.equal((await service.resetPassword(reset.value.resetToken, 'another-password-123')).ok, false);
      const latest = await store.getById(target);
      assert.equal(latest.email, 'new@example.test');
      assert.equal(latest.role, 'finance');
      assert.equal(latest.passwordHash, stale.passwordHash);

      // Pause a credential write while an administrator changes role and revokes access.
      const credentialPatch = store.patch.bind(store);
      let credentialReached;
      let credentialRelease;
      const credentialPaused = new Promise(resolve => { credentialReached = resolve; });
      const credentialResume = new Promise(resolve => { credentialRelease = resolve; });
      store.patch = async (id, version, changes) => {
        if (changes.passwordHash) { credentialReached(); await credentialResume; }
        return credentialPatch(id, version, changes);
      };
      const changing = service.changePassword(target, 'a-long-password-123', 'changed-password-456');
      await credentialPaused;
      await service.updateAccount(target, { role: 'supervisor' }, actor);
      await service.setAccountActive(target, false, actor);
      credentialRelease();
      assert.equal((await changing).code, 'ACCOUNT_CHANGED');
      const revoked = await store.getById(target);
      assert.equal(revoked.role, 'supervisor');
      assert.equal(revoked.active, false);
      assert.equal(revoked.passwordHash, stale.passwordHash);
      store.patch = credentialPatch;
      await service.setAccountActive(target, true, actor);

      // Deterministic interleaving: pause issuance exactly before its CAS write.
      const originalPatch = store.patch.bind(store);
      for (const action of ['email', 'revoke']) {
        let reached;
        let release;
        const paused = new Promise(resolve => { reached = resolve; });
        const resume = new Promise(resolve => { release = resolve; });
        store.patch = async (id, version, changes) => {
          if (changes.resetTokenHash) { reached(); await resume; }
          return originalPatch(id, version, changes);
        };
        const email = (await store.getById(target)).email;
        const issuing = service.issuePasswordReset(email);
        await paused;
        if (action === 'email') await service.updateAccount(target, { email: 'final@example.test' }, actor);
        else await service.setAccountActive(target, false, actor);
        release();
        assert.equal((await issuing).value, null);
        assert.equal((await store.getById(target)).resetTokenHash, null);
        store.patch = originalPatch;
      }
    } finally { if (database) await database.close(); }
  });
}
