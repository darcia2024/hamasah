const assert = require('node:assert/strict');
const { listMigrations } = require('./migrations.js');

const migrations = listMigrations();
const schema = migrations.map((migration) => migration.sql).join('\n');

const requiredTables = [
  'accounts', 'registrations', 'registration_status_events', 'registration_documents', 'articles',
  'students', 'student_parent_accounts', 'student_activities', 'student_attendance',
  'student_achievements', 'student_evaluations', 'student_violations', 'courses',
  'course_materials', 'course_enrollments', 'course_completions', 'invoices',
  'visa_tracking', 'inventory_items'
];

assert.ok(migrations.length >= 2, 'Minimal ada migrasi 001 dan 002.');

requiredTables.forEach((table) => {
  assert.match(schema, new RegExp(`CREATE TABLE ${table} \\(`));
});
assert.match(schema, /access_token_hash TEXT NOT NULL/);
assert.match(schema, /password_hash TEXT NOT NULL/);
assert.match(schema, /student_parent_accounts[\s\S]*parent_account_id UUID NOT NULL REFERENCES accounts/);
assert.match(schema, /course_completions[\s\S]*UNIQUE \(student_id, material_id\)/);

// Runner yang membungkus tiap migrasi dalam transaksi, jadi file tidak boleh mengatur transaksi sendiri.
migrations.forEach((migration) => {
  assert.doesNotMatch(migration.sql, /(?:^|\n)\s*(BEGIN|COMMIT|ROLLBACK)\s*;/i, `${migration.file} tidak boleh memuat BEGIN, COMMIT, atau ROLLBACK.`);
  assert.doesNotMatch(migration.sql, /CREATE\s+INDEX\s+CONCURRENTLY/i, `${migration.file} tidak boleh memakai CREATE INDEX CONCURRENTLY karena tidak bisa jalan di dalam transaksi.`);
});

console.log('database schema contract passed');
