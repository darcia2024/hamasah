const assert = require('node:assert/strict');
const { test } = require('node:test');
const H = require('../scripts/browser-harness.js');
const { createApplicantService } = require('./applicant-service.js');
const { createPostgresRegistrationStore } = require('./postgres-registration-store.js');
const { createPostgresApplicantSessionStore } = require('./postgres-applicant-session-store.js');
const { createNotificationService } = require('./notification-service.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createHamasahApp } = require('./app.js');
const { hashPassword } = require('./identity-service.js');
const { hashToken } = require('./http/auth.js');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

async function fixture() {
  const database = await createTestDatabase();
  await database.query(`INSERT INTO registrations
    (id, registration_id, applicant_name, phone_e164, program, consented_at, status, progress, access_token_hash, access_code_hash, email)
    VALUES ($1, 'HI-REG-2026-00001', 'Calon Dummy', '+6281234567890', 'mahad-al-azhar', now(), 'submitted', 15, 'legacy-dummy-hash', $2, 'dummy@example.test')`,
    [randomUUID(), await hashPassword('OLDCODE234')]);
  const app = createHamasahApp({ database, rootDirectory: path.resolve(__dirname, '..'), appEnvironment: 'test',
    auditRetention: false, inProcessNotificationWorker: false,
    email: { driver: 'test', appBaseUrl: 'http://127.0.0.1' },
    emailSender: { configured: true, provider: 'test', async send() { return { id: 'dummy' }; } }
  });
  const server = app.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { database, app, baseUrl: 'http://127.0.0.1:' + server.address().port,
    async close() { await new Promise(resolve => server.close(resolve)); await app.close(); await database.close(); }
  };
}

test('applicant recovery commits credential, session revocation and encrypted delivery atomically', async () => {
  const app = await fixture();
  try {
    const db = app.database;
    const records = createPostgresRegistrationStore({ database: db });
    const row = (await db.query('SELECT registration_id FROM registrations LIMIT 1')).rows[0];
    assert.ok(row, 'seeded dummy registration');
    const old = await records.get(row.registration_id);
    const sessions = createPostgresApplicantSessionStore({ database: db });
    const notificationService = createNotificationService({ store: {}, sender: { configured: true, provider: 'test' }, notificationPayloadKey: 'dummy-key' });
    let invalid = true;
    const svc = createApplicantService({ registrationStore: records, sessionStore: sessions, canRecover: () => true,
      prepareRecovery: value => ({ ...notificationService.prepareApplicantRecovery(value), ...(invalid ? { notificationType: 'not-an-allowed-notification' } : {}) })
    });
    const started = await svc.startSession(old.registrationId);
    await assert.rejects(svc.recoverAccessCode(old.registrationId, old.applicant.email));
    assert.equal((await records.get(old.registrationId)).accessCodeHash, old.accessCodeHash);
    assert.equal((await svc.authenticate(started.value.accessToken, old.registrationId)).ok, true);
    invalid = false;
    let entered;
    const paused = new Promise(resolve => { entered = resolve; });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const racing = createApplicantService({ registrationStore: records, sessionStore: {
      ...sessions,
      async saveForCredential(session, verified) { entered(); await gate; return sessions.saveForCredential(session, verified); }
    } });
    const pendingLogin = racing.login(old.registrationId, 'OLDCODE234');
    await paused;
    const changed = await svc.recoverAccessCode(old.registrationId, old.applicant.email);
    release();
    assert.equal((await pendingLogin).ok, false, 'old verified code cannot create a post-recovery session');
    assert.equal(changed.ok, true);
    assert.equal((await svc.authenticate(started.value.accessToken, old.registrationId)).ok, false);
    assert.equal((await svc.login(old.registrationId, changed.value.accessCode)).ok, true);
    assert.notEqual((await records.get(old.registrationId)).accessTokenHash, old.accessTokenHash);
    const queued = (await db.query("SELECT payload_ciphertext, payload_nonce FROM notification_outbox WHERE recipient_email=$1", [old.applicant.email])).rows;
    assert.equal(queued.length, 1);
    assert.ok(queued[0].payload_ciphertext && queued[0].payload_nonce);
    assert.ok(!queued[0].payload_ciphertext.includes(changed.value.accessCode));
  } finally { await app.close(); }
});

test('applicant logout revokes the session and cannot fall back to legacy bearer credentials', async () => {
  const app = await fixture();
  try {
    const db = app.database;
    const record = (await db.query('SELECT registration_id FROM registrations LIMIT 1')).rows[0];
    await db.query('UPDATE registrations SET access_token_hash=$1 WHERE registration_id=$2', [hashToken('legacy-token-dummy'), record.registration_id]);
    assert.equal((await H.call(app.baseUrl, 'GET', '/api/registrations/' + record.registration_id, 'legacy-token-dummy')).status, 401);
    const started = await app.app.applicantService.startSession(record.registration_id);
    assert.equal((await H.call(app.baseUrl, 'GET', '/api/registrations/' + record.registration_id, started.value.accessToken)).status, 200);
    await H.call(app.baseUrl, 'POST', '/api/applicant/logout', started.value.accessToken);
    assert.equal((await H.call(app.baseUrl, 'GET', '/api/registrations/' + record.registration_id, started.value.accessToken)).status, 401);
  } finally { await app.close(); }
});
