const assert = require('node:assert/strict');
const { checkStagingEnvironment } = require('./staging-preflight.js');

const base = {
  APP_ENV: 'staging', DATABASE_URL: 'postgresql://user:password@example.test:5432/hamasah',
  STORAGE_DRIVER: 'supabase', STORAGE_BUCKET: 'hamasah-private-documents', SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test', EMAIL_DRIVER: 'resend', RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'Hamasah <noreply@example.test>', APP_BASE_URL: 'https://staging.example.test',
  IP_HASH_SECRET: 'a'.repeat(48)
};

const options = { loadFile: false };
const valid = checkStagingEnvironment(base, options);
assert.deepEqual(valid.errors, []);
assert.equal(valid.config.appEnvironment, 'staging');

const missingEmail = checkStagingEnvironment({ ...base, EMAIL_DRIVER: 'disabled' }, options);
assert.ok(missingEmail.errors.some((message) => /EMAIL_DRIVER/.test(message)));

const missingBucket = checkStagingEnvironment({ ...base, STORAGE_BUCKET: ' ' }, options);
assert.ok(missingBucket.errors.some((message) => /STORAGE_BUCKET/.test(message)));

const weakUrl = checkStagingEnvironment({ ...base, APP_BASE_URL: 'http://staging.example.test' }, options);
assert.deepEqual(weakUrl.errors, []);
assert.equal(weakUrl.warnings.length, 1);

console.log('staging preflight tests passed');
