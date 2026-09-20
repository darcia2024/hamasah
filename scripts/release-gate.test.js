const assert = require('node:assert/strict');
const path = require('node:path');
const { checkReleaseGate } = require('./release-gate.js');

const rootDirectory = path.resolve(__dirname, '..');

function run() {
  const staging = checkReleaseGate({ rootDirectory, environment: { APP_ENV: 'staging', DATABASE_URL: 'postgresql://staging', STORAGE_BUCKET: 'hamasah-private-documents', APP_BASE_URL: 'https://staging.example.test' } });
  assert.equal(staging.ok, true);
  const missing = checkReleaseGate({ rootDirectory, environment: { APP_ENV: 'staging' } });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join(' '), /DATABASE_URL/);
  const productionHttp = checkReleaseGate({ rootDirectory, environment: { APP_ENV: 'production', DATABASE_URL: 'postgresql://prod', STORAGE_BUCKET: 'private', APP_BASE_URL: 'http://example.test' } });
  assert.equal(productionHttp.ok, false);
  assert.match(productionHttp.errors.join(' '), /HTTPS/);
  console.log('release-gate tests passed');
}

run();
