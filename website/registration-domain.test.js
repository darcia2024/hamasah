const assert = require('node:assert/strict');
const registration = require('./registration-domain.js');

const validApplicant = {
  applicantName: 'Ahmad Fikri Ramadhan',
  phone: '081234567890',
  guardianName: 'Bapak Ramadhan',
  guardianPhone: '081398765432',
  program: registration.PROGRAMS.MAHAD,
  educationLevel: 'SMP',
  city: 'Bandung',
  consent: true
};

assert.equal(registration.normalizePhone('0812 3456 7890'), '+6281234567890');
assert.equal(registration.formatRegistrationId(7, '2026-09-15T00:00:00.000Z'), 'HI-REG-2026-00007');

const invalid = registration.validateApplicant({ ...validApplicant, guardianPhone: '', consent: false });
assert.equal(invalid.valid, false);
assert.ok(invalid.errors.guardianPhone);
assert.ok(invalid.errors.consent);

const created = registration.createApplication(validApplicant, {
  sequence: 18,
  createdAt: '2026-09-15T08:00:00.000Z'
});
assert.equal(created.ok, true);
assert.equal(created.value.registrationId, 'HI-REG-2026-00018');
assert.equal(created.value.status, registration.STATUSES.SUBMITTED);
assert.equal(created.value.progress, 15);

assert.equal(
  registration.canTransition(registration.STATUSES.SUBMITTED, registration.STATUSES.DOCUMENT_REVIEW, registration.ROLES.REGISTRATION_OFFICER),
  true
);
assert.equal(
  registration.canTransition(registration.STATUSES.SUBMITTED, registration.STATUSES.READY_FOR_DEPARTURE, registration.ROLES.REGISTRATION_OFFICER),
  false
);
assert.equal(
  registration.canTransition(registration.STATUSES.SUBMITTED, registration.STATUSES.DOCUMENT_REVIEW, registration.ROLES.APPLICANT),
  false
);

const reviewed = registration.transitionApplication(
  created.value,
  registration.STATUSES.DOCUMENT_REVIEW,
  registration.ROLES.REGISTRATION_OFFICER,
  { changedAt: '2026-09-15T09:00:00.000Z', note: 'Berkas mulai diperiksa.' }
);
assert.equal(reviewed.ok, true);
assert.equal(reviewed.value.status, registration.STATUSES.DOCUMENT_REVIEW);
assert.equal(reviewed.value.statusHistory.length, 2);
assert.equal(created.value.status, registration.STATUSES.SUBMITTED);

console.log('registration-domain tests passed');
