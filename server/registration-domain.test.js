const assert = require('node:assert/strict');
const registration = require('../website/registration-domain.js');

const validApplicant = {
  applicantName: 'Ahmad Fikri Ramadhan',
  phone: '081234567890',
  guardianName: 'Bapak Ramadhan',
  guardianPhone: '081398765432',
  email: 'ahmad@example.test',
  guardianEmail: 'wali.ahmad@example.test',
  birthDate: '2004-01-01',
  gender: 'putra',
  schoolOrigin: 'MA Uji',
  guardianConsent: true,
  program: registration.PROGRAMS.MAHAD,
  educationLevel: 'SMP',
  city: 'Bandung',
  consent: true, dataProcessingConsent: true
};

assert.equal(registration.normalizePhone('0812 3456 7890'), '+6281234567890');
assert.equal(registration.formatRegistrationId(7, '2026-09-15T00:00:00.000Z'), 'HI-REG-2026-00007');
// Tahun mengikuti tanggal di Indonesia. Pukul 17.30 UTC tanggal 31 Desember sudah tahun baru di Jakarta.
assert.equal(registration.formatRegistrationId(1, '2026-12-31T17:30:00.000Z'), 'HI-REG-2027-00001');
assert.equal(registration.formatRegistrationId(1, '2026-12-31T10:00:00.000Z'), 'HI-REG-2026-00001');
assert.equal(registration.formatRegistrationId(9, '2026-09-15T00:00:00.000Z', { year: 2030 }), 'HI-REG-2030-00009');
assert.equal(registration.yearInTimeZone('2026-12-31T17:30:00.000Z'), 2027);
assert.equal(registration.yearInTimeZone('2026-12-31T17:30:00.000Z', 'UTC'), 2026);

// Perilaku normalisasi nomor telepon, termasuk batasannya.
assert.equal(registration.normalizePhone('0812 3456 7890'), '+6281234567890');
assert.equal(registration.normalizePhone('62 812-3456-7890'), '+6281234567890');
assert.equal(registration.normalizePhone('+20 100 123 4567'), '+201001234567', 'Nomor internasional dipertahankan apa adanya.');
// Catatan: nomor lokal Mesir yang diawali 0 akan dianggap nomor Indonesia.
// Pendaftaran saat ini memang dari Indonesia. Jika nanti ada pendaftar dari Mesir,
// formulir perlu pilihan kode negara (dibahas di Task 9.4).
assert.equal(registration.normalizePhone('01001234567'), '+621001234567');

const invalid = registration.validateApplicant({ ...validApplicant, guardianPhone: '', consent: false });
assert.equal(invalid.valid, false);
assert.ok(invalid.errors.guardianPhone);
assert.ok(invalid.errors.consent);

// Task R2.3. Persetujuan pemrosesan data pribadi terpisah dari persetujuan dihubungi,
// dan wajib. Mencentang salah satu saja tidak cukup.
const tanpaPersetujuanData = registration.validateApplicant({ ...validApplicant, dataProcessingConsent: false });
assert.equal(tanpaPersetujuanData.valid, false);
assert.ok(tanpaPersetujuanData.errors.dataProcessingConsent);
assert.equal(tanpaPersetujuanData.errors.consent, undefined, 'Persetujuan dihubungi tidak ikut digugurkan.');

const tanpaPersetujuanDihubungi = registration.validateApplicant({ ...validApplicant, consent: false });
assert.equal(tanpaPersetujuanDihubungi.valid, false);
assert.ok(tanpaPersetujuanDihubungi.errors.consent);
assert.equal(tanpaPersetujuanDihubungi.errors.dataProcessingConsent, undefined);

// Migrasi 013 memberi kolomnya DEFAULT 'v1', dokumen yang tidak pernah ada.
// Nilai bawaan sekarang menunjuk dokumen yang benar-benar dapat ditampilkan.
assert.notEqual(registration.PRIVACY_POLICY_VERSION, 'v1');
assert.equal(
  registration.validateApplicant(validApplicant).value.privacyPolicyVersion,
  registration.PRIVACY_POLICY_VERSION
);

const created = registration.createApplication(validApplicant, {
  sequence: 18,
  createdAt: '2026-09-15T08:00:00.000Z'
});
assert.equal(created.ok, true);
assert.equal(created.value.registrationId, 'HI-REG-2026-00018');
assert.equal(created.value.status, registration.STATUSES.SUBMITTED);
assert.equal(created.value.progress, 15);

const missingProfile = registration.createApplication({ ...validApplicant, email: '', birthDate: '', gender: '', schoolOrigin: '' }, { sequence: 19, createdAt: '2026-09-15T08:00:00.000Z' });
assert.equal(missingProfile.ok, false);
assert.ok(missingProfile.errors.email);
assert.ok(missingProfile.errors.birthDate);
assert.ok(missingProfile.errors.gender);
assert.ok(missingProfile.errors.schoolOrigin);

const futureBirthDate = registration.createApplication({ ...validApplicant, birthDate: '2099-01-01' }, { sequence: 20, createdAt: '2026-09-15T08:00:00.000Z' });
assert.equal(futureBirthDate.ok, false);
assert.match(futureBirthDate.errors.birthDate, /masa depan/);

const adultV2 = registration.validateApplicant({
  ...validApplicant, email: 'ahmad@hamasah.test', birthDate: '2000-01-01', gender: 'putra', schoolOrigin: 'SMA Uji'
});
assert.equal(adultV2.valid, true);
const impossibleDateV2 = registration.validateApplicant({
  ...validApplicant, email: 'tanggal@hamasah.test', birthDate: '2020-02-31', gender: 'putra', schoolOrigin: 'SMA Uji'
});
assert.equal(impossibleDateV2.valid, false);
assert.ok(impossibleDateV2.errors.birthDate);
const underAgeV2 = registration.validateApplicant({
  ...validApplicant, email: 'ahmad@hamasah.test', birthDate: '2010-01-01', gender: 'putra', schoolOrigin: 'SMP Uji', guardianEmail: '', guardianConsent: false
});
assert.equal(underAgeV2.valid, false);
assert.ok(underAgeV2.errors.guardianEmail);
assert.ok(underAgeV2.errors.guardianConsent);

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
