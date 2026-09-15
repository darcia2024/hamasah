const assert = require('node:assert/strict');
const {
  APP_ENVIRONMENTS,
  PRODUCTION_WRITE_CONFIRMATION,
  assertDatabaseWriteAllowed,
  readAppEnvironment
} = require('./environment.js');

assert.deepEqual(APP_ENVIRONMENTS, ['development', 'test', 'staging', 'production']);
assert.equal(PRODUCTION_WRITE_CONFIRMATION, 'I_UNDERSTAND');

// readAppEnvironment: kosong dianggap development, nilai lain harus dikenal.
assert.equal(readAppEnvironment({}), 'development');
assert.equal(readAppEnvironment({ APP_ENV: '   ' }), 'development');
assert.equal(readAppEnvironment({ APP_ENV: ' Staging ' }), 'staging');
assert.equal(readAppEnvironment({ APP_ENV: 'production' }), 'production');
assert.throws(() => readAppEnvironment({ APP_ENV: 'prod' }), /tidak dikenal/);

// Skrip tulis database: APP_ENV wajib dinyatakan secara eksplisit.
assert.throws(() => assertDatabaseWriteAllowed({}), /APP_ENV belum diisi/);
assert.throws(() => assertDatabaseWriteAllowed({ APP_ENV: '' }), /APP_ENV belum diisi/);
assert.throws(() => assertDatabaseWriteAllowed({ APP_ENV: 'prod' }), /tidak dikenal/);

// Production ditolak tanpa konfirmasi yang sama persis.
assert.throws(() => assertDatabaseWriteAllowed({ APP_ENV: 'production' }), /ALLOW_PRODUCTION_WRITE/);
assert.throws(() => assertDatabaseWriteAllowed({ APP_ENV: 'production', ALLOW_PRODUCTION_WRITE: 'yes' }), /ALLOW_PRODUCTION_WRITE/);
assert.throws(() => assertDatabaseWriteAllowed({ APP_ENV: 'production', ALLOW_PRODUCTION_WRITE: 'i_understand' }), /ALLOW_PRODUCTION_WRITE/);
assert.throws(() => assertDatabaseWriteAllowed({ APP_ENV: 'production', ALLOW_PRODUCTION_WRITE: ' I_UNDERSTAND ' }), /ALLOW_PRODUCTION_WRITE/);
assert.equal(assertDatabaseWriteAllowed({ APP_ENV: 'production', ALLOW_PRODUCTION_WRITE: 'I_UNDERSTAND' }), 'production');

// Lingkungan non-production diizinkan.
assert.equal(assertDatabaseWriteAllowed({ APP_ENV: 'staging' }), 'staging');
assert.equal(assertDatabaseWriteAllowed({ APP_ENV: 'development' }), 'development');
assert.equal(assertDatabaseWriteAllowed({ APP_ENV: 'test' }), 'test');

console.log('environment tests passed');
