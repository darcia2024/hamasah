const { DEFAULT_ENV_FILE, loadEnvironmentFile } = require('./migrate');
const { assertDatabaseWriteAllowed } = require('../server/environment');
loadEnvironmentFile(DEFAULT_ENV_FILE, process.env);
const email = `auth-check-${Date.now()}@hamasah.test`;
const baseUrl = process.env.AUTH_CHECK_BASE_URL || 'http://127.0.0.1:4323';
const { Client } = require('pg');

async function run() {
  // Skrip ini menghapus akun di database, jadi wajib lolos pengaman sebelum koneksi dibuka.
  assertDatabaseWriteAllowed(process.env);
  const cleanup = new Client({ connectionString: process.env.DATABASE_URL });
  await cleanup.connect();
  await cleanup.query("DELETE FROM accounts WHERE email LIKE 'auth-check-%@hamasah.test'");
  await cleanup.end();
  const bootstrap = await fetch(`${baseUrl}/api/auth/bootstrap`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.HAMASAH_BOOTSTRAP_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Temporary Auth Check', email, password: 'temporary-password-2026' }) });
  const bootBody = await bootstrap.json();
  if (bootstrap.status !== 201) throw new Error(`Bootstrap menghasilkan ${bootstrap.status}.`);
  const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'temporary-password-2026' }) });
  const loginBody = await login.json();
  if (login.status !== 200) throw new Error(`Login menghasilkan ${login.status}.`);
  const me = await fetch(`${baseUrl}/api/me`, { headers: { Authorization: `Bearer ${loginBody.accessToken}` } });
  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${loginBody.accessToken}` } });
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('DELETE FROM accounts WHERE id = $1', [bootBody.account.id]);
  await client.end();
  if (me.status !== 200 || logout.status !== 204) throw new Error('Sesi atau logout gagal.');
  console.log('bootstrap=201 login=200 session=200 logout=204 cleanup=ok');
}
run().catch((error) => { console.error(error.message); process.exitCode = 1; });
