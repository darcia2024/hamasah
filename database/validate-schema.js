const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schema = fs.readFileSync(path.join(__dirname, '001_initial_schema.sql'), 'utf8');
const requiredTables = [
  'accounts', 'registrations', 'registration_status_events', 'registration_documents', 'articles',
  'students', 'student_parent_accounts', 'student_activities', 'student_attendance',
  'student_achievements', 'student_evaluations', 'student_violations', 'courses',
  'course_materials', 'course_enrollments', 'course_completions', 'invoices',
  'visa_tracking', 'inventory_items'
];

requiredTables.forEach((table) => {
  assert.match(schema, new RegExp(`CREATE TABLE ${table} \\(`));
});
assert.match(schema, /access_token_hash TEXT NOT NULL/);
assert.match(schema, /password_hash TEXT NOT NULL/);
assert.match(schema, /student_parent_accounts[\s\S]*parent_account_id UUID NOT NULL REFERENCES accounts/);
assert.match(schema, /course_completions[\s\S]*UNIQUE \(student_id, material_id\)/);
assert.doesNotMatch(schema, /(?:^|\n)BEGIN;|(?:^|\n)COMMIT;/);
console.log('database schema contract passed');
