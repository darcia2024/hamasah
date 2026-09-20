const assert = require('node:assert/strict'); const { run } = require('./security-local-check.js');
const result = run(); assert.equal(result.ok, true, result.findings.join('; ')); console.log('security local check tests passed');
