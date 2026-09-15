const assert = require('node:assert/strict');
const { createPostgresRegistrationStore } = require('./postgres-registration-store.js');
async function run() {
  const queries = [];
  const pool = { async query(sql, parameters) { queries.push({ sql, parameters }); if (sql.startsWith('SELECT count')) return { rows: [{ count: 0 }] }; if (sql.startsWith('SELECT *')) return { rows: [] }; return { rows: [] }; } };
  const store = createPostgresRegistrationStore({ pool });
  assert.equal(await store.count(), 0);
  const record = { registrationId: 'HI-REG-2026-00001', status: 'submitted', progress: 15, applicant: { applicantName: 'Naufal Rizki', phone: '+6281234567890', guardianName: 'Ahmad Rizki', guardianPhone: '+6281322223333', program: 'mahad-al-azhar', educationLevel: 'MA', city: 'Bandung' }, accessTokenHash: 'hash', createdAt: '2026-09-15T00:00:00.000Z', updatedAt: '2026-09-15T00:00:00.000Z', documents: [], statusHistory: [{ from: 'draft', to: 'submitted', changedAt: '2026-09-15T00:00:00.000Z', changedBy: 'applicant', note: '' }] };
  assert.equal((await store.save(record)).registrationId, record.registrationId);
  assert.ok(queries.some((entry) => /INSERT INTO registrations/.test(entry.sql)));
  console.log('postgres registration store tests passed');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
