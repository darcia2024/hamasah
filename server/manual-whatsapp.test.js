const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createHamasahApp } = require('./app.js');
const { seedDevelopmentData, DEV_PASSWORD } = require('../scripts/seed-dev.js');
const { hashPassword } = require('./identity-service.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');
const { readProductionConfig } = require('./production-config.js');

test('WhatsApp manual keeps credentials private, scopes recipients and never claims delivery', async () => {
  const database = await createTestDatabase(); let app, server; let sent = 0;
  try {
    await seedDevelopmentData({ database, logger: { log() {} } });
    const rid = randomUUID();
    await database.query(`INSERT INTO registrations (id, registration_id, applicant_name, phone_e164, program,
      consented_at, status, progress, access_token_hash, access_code_hash, email, guardian_name, guardian_email, guardian_phone_e164)
      VALUES ($1,'HI-REG-2026-00001','Calon Dummy','+6281234567890','mahad-al-azhar',now(),'ready-for-departure',90,'legacy', $2,
      'calon@example.test','Wali Dummy','wali-baru@example.test','+6281298765432')`, [rid, await hashPassword('OLDCODE234')]);
    app = createHamasahApp({ database, rootDirectory: require('node:path').resolve(__dirname, '..'), appEnvironment: 'test',
      notificationChannel: 'whatsapp-manual', appBaseUrl: 'https://hamasah.example.test',
      email: { driver: 'test', appBaseUrl: 'https://hamasah.example.test' },
      emailSender: { configured: true, provider: 'test', async send() { sent++; return { id: 'must-not-send' }; } },
      rateLimiter: createRelaxedRateLimiter(), auditRetention: false, inProcessNotificationWorker: false });
    server = app.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    async function request(method, path, token, body) {
      const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: r.status, body: await r.json() };
    }
    async function login(email) { const r = await request('POST', '/api/auth/login', null, { email, password: DEV_PASSWORD }); assert.equal(r.status, 200); return r.body.accessToken; }
    const admin = await login('admin@hamasah.test'), student = await login('santri@hamasah.test');
    const officer = await login('petugas@hamasah.test');
    const oldSession = await request('POST', '/api/applicant/login', null, { registrationId: 'HI-REG-2026-00001', accessCode: 'OLDCODE234' });
    assert.equal(oldSession.status, 200);

    const recovery = await request('POST', '/api/auth/password-reset-request', null, { email: 'admin@hamasah.test' });
    const unknown = await request('POST', '/api/auth/password-reset-request', null, { email: 'absent@example.test' });
    assert.deepEqual(recovery, unknown, 'Public recovery does not reveal whether an account exists.');
    assert.equal(recovery.body.whatsapp.sent, false);
    assert.equal((await database.query("SELECT reset_token_hash FROM accounts WHERE email='admin@hamasah.test'")).rows[0].reset_token_hash, null);
    const support = await request('POST', '/api/applicant/recovery', null, { registrationId: 'HI-REG-2026-00001', email: 'calon@example.test' });
    assert.equal(support.body.whatsapp.channel, 'whatsapp-manual');
    assert.equal((await request('POST', '/api/applicant/login', null, { registrationId: 'HI-REG-2026-00001', accessCode: 'OLDCODE234' })).status, 200);

    const invited = await request('POST', '/api/accounts/invitations', admin, { name: 'Guru Dummy', email: 'invite@example.test', role: 'teacher' });
    assert.equal(invited.status, 201); assert.match(invited.body.whatsapp.message, /aktivasi#token=/); assert.equal(invited.body.whatsapp.sent, false);
    assert.equal((await request('POST', `/api/accounts/${invited.body.account.id}/invitation`, officer)).status, 403, 'Registration staff cannot obtain activation links for staff accounts.');
    assert.equal((await request('POST', '/api/accounts/invitations', student, { name: 'Tidak boleh', email: 'deny@example.test', role: 'admin' })).status, 403);

    const converted = await request('POST', '/api/registrations/HI-REG-2026-00001/convert', admin);
    assert.equal(converted.status, 200); assert.equal(converted.body.conversion.invitationsQueued, 0); assert.equal(converted.body.conversion.whatsapp.length, 2);
    assert.equal((await request('POST', `/api/accounts/${converted.body.conversion.studentAccountId}/invitation`, officer)).status, 200);
    const sid = converted.body.conversion.studentId;
    const invoice = await request('POST', '/api/operations/invoices', admin, { studentId: sid, description: 'SPP contoh', amount: 450000, kirimEmail: true });
    assert.equal(invoice.status, 201);
    // Activate the linked dummy guardian; the real portal activation is tested elsewhere.
    await database.query("UPDATE accounts SET active=TRUE,lifecycle='active' WHERE email='wali-baru@example.test'");
    const draft = await request('POST', `/api/operations/invoices/${invoice.body.invoice.id}/pengingat`, admin);
    assert.equal(draft.status, 200); assert.equal(draft.body.sent, false); assert.match(draft.body.whatsapp[0].url, /^https:\/\/wa.me\/6281298765432\?/);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM invoice_reminders')).rows[0].n, 0);
    await database.query("UPDATE registrations SET guardian_email='different@example.test' WHERE id=$1", [rid]);
    const mismatched = await request('POST', `/api/operations/invoices/${invoice.body.invoice.id}/pengingat`, admin);
    assert.match(mismatched.body.whatsapp[0].url, /^https:\/\/wa.me\/\?/, 'Never send financial data to a phone mapped to a different account.');
    assert.equal((await request('POST', `/api/operations/invoices/${invoice.body.invoice.id}/pengingat`, student)).status, 403);

    assert.equal((await request('POST', '/api/registrations/HI-REG-2026-00001/access-code', student, { confirmedOwner: true })).status, 403);
    assert.equal((await request('POST', '/api/registrations/HI-REG-2026-00001/access-code', admin, { confirmedOwner: false })).status, 422);
    const rotated = await request('POST', '/api/registrations/HI-REG-2026-00001/access-code', admin, { confirmedOwner: true });
    assert.equal(rotated.status, 200); const code = rotated.body.whatsapp.message.match(/: ([A-Z2-9]{10})\n/)[1];
    assert.equal((await request('POST', '/api/applicant/login', null, { registrationId: 'HI-REG-2026-00001', accessCode: 'OLDCODE234' })).status, 401);
    assert.equal((await request('POST', '/api/applicant/login', null, { registrationId: 'HI-REG-2026-00001', accessCode: code })).status, 200);
    assert.equal((await app.applicantService.authenticate(oldSession.body.accessToken, 'HI-REG-2026-00001')).ok, false);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM notification_outbox')).rows[0].n, 0);
    assert.equal(app.notificationService.canSend(), false); assert.equal(sent, 0);
  } finally { if (server) await new Promise(resolve => server.close(resolve)); if (app) await app.close(); await database.close(); }
});
