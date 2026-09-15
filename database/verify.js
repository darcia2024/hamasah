const path = require('node:path');
const { loadEnvironmentFile } = require('./migrate');
const { readProductionConfig } = require('../server/production-config');

const REQUIRED_TABLES = Object.freeze([
  'accounts', 'registrations', 'registration_status_events', 'registration_documents', 'articles',
  'students', 'student_parent_accounts', 'student_activities', 'student_attendance',
  'student_achievements', 'student_evaluations', 'student_violations', 'courses',
  'course_materials', 'course_enrollments', 'course_completions', 'invoices',
  'visa_tracking', 'inventory_items'
]);

function assertRequiredTables(tableNames) {
  const available = new Set(tableNames);
  const missing = REQUIRED_TABLES.filter((table) => !available.has(table));
  if (missing.length) {
    throw new Error(`Tabel production belum lengkap: ${missing.join(', ')}`);
  }
  return REQUIRED_TABLES.length;
}

async function verifyDatabase({ environment = { ...process.env }, Client } = {}) {
  loadEnvironmentFile(path.join(__dirname, '..', '.env'), environment);
  const config = readProductionConfig(environment);
  const PgClient = Client || require('pg').Client;
  const client = new PgClient({ connectionString: config.databaseUrl });

  await client.connect();
  try {
    const { rows } = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name",
      [REQUIRED_TABLES]
    );
    return assertRequiredTables(rows.map((row) => row.table_name));
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  verifyDatabase()
    .then((count) => console.log(`Verifikasi PostgreSQL selesai: ${count} tabel aplikasi tersedia.`))
    .catch((error) => {
      console.error(`Verifikasi database gagal: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { REQUIRED_TABLES, assertRequiredTables, verifyDatabase };
