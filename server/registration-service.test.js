const assert = require('node:assert/strict');
const domain = require('../website/registration-domain.js');
const serviceModule = require('./registration-service.js');

function applicant(name) {
  return {
    applicantName: name,
    phone: '0812 3456 7890',
    guardianName: `Wali ${name}`,
    guardianPhone: '0813 2222 3333',
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.test`,
    guardianEmail: `wali.${name.toLowerCase().replace(/\s+/g, '.')}@example.test`,
    birthDate: '2004-01-01',
    gender: 'putra',
    schoolOrigin: 'MA Uji',
    guardianConsent: true,
    program: domain.PROGRAMS.MAHAD,
    educationLevel: 'MA',
    city: 'Bandung',
    consent: true, dataProcessingConsent: true
  };
}

// Store yang meniru database dengan jeda jaringan: nilai dibaca saat perintah tiba,
// hasilnya dikembalikan beberapa milidetik kemudian.
function createLatentStore({ database = { records: new Map(), counters: new Map() }, failInserts = 0 } = {}) {
  let remainingFailures = failInserts;
  const wait = () => new Promise((resolve) => setTimeout(resolve, 15));

  return {
    database,
    async nextSequence(scope, year) {
      const key = `${scope}:${year}`;
      const next = (database.counters.get(key) || 0) + 1;
      database.counters.set(key, next);
      await wait();
      return next;
    },
    async insert(record) {
      await wait();
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        throw new Error('Koneksi database terputus (simulasi).');
      }
      if (database.records.has(record.registrationId)) {
        throw new Error(`Nomor registrasi ${record.registrationId} sudah dipakai.`);
      }
      database.records.set(record.registrationId, JSON.parse(JSON.stringify(record)));
      return record;
    },
    async update(record) {
      await wait();
      database.records.set(record.registrationId, JSON.parse(JSON.stringify(record)));
      return record;
    },
    async get(registrationId) {
      await wait();
      const record = database.records.get(registrationId);
      return record ? JSON.parse(JSON.stringify(record)) : null;
    },
    async count() {
      return database.records.size;
    },
    async list() {
      return [...database.records.values()].map((record) => JSON.parse(JSON.stringify(record)));
    }
  };
}

function namesById(database) {
  return [...database.records.values()]
    .map((record) => `${record.registrationId}=${record.applicant.applicantName}`)
    .sort();
}

// Task R2.3. Versi kebijakan privasi distempel server, dan tidak berubah karena
// penyuntingan profil. toPublicRegistration sengaja tidak memuat applicant, jadi yang
// diperiksa adalah baris yang benar-benar tersimpan di store.
async function testVersiKebijakanPrivasi() {
  const store = createLatentStore();
  const service = serviceModule.createRegistrationService({ store, now: () => '2026-09-15T00:00:00.000Z' });

  // Nilai yang dititipkan browser diabaikan. Yang mengikat adalah dokumen yang
  // berlaku di server saat persetujuan diberikan.
  const dibuat = await service.create({ ...applicant('Versi Titipan'), privacyPolicyVersion: 'v99-palsu' });
  assert.equal(dibuat.ok, true);
  const registrationId = dibuat.value.registrationId;
  assert.equal(store.database.records.get(registrationId).applicant.privacyPolicyVersion, domain.PRIVACY_POLICY_VERSION);

  // Menyunting profil tidak boleh diam-diam mencatat persetujuan terhadap kebijakan
  // yang belum pernah dibaca pendaftar, termasuk ketika versi server sudah berganti.
  store.database.records.get(registrationId).applicant.privacyPolicyVersion = 'versi-lama-saat-mendaftar';
  const disunting = await service.updateApplicant(registrationId, { city: 'Surabaya' }, { role: domain.ROLES.APPLICANT });
  assert.equal(disunting.ok, true, JSON.stringify(disunting.errors || disunting.error));
  const setelahSunting = store.database.records.get(registrationId).applicant;
  assert.equal(setelahSunting.city, 'Surabaya');
  assert.equal(setelahSunting.privacyPolicyVersion, 'versi-lama-saat-mendaftar');
}

async function testNormalFlow() {
  let clock = 0;
  const deletedFiles = [];
  const service = serviceModule.createRegistrationService({
    markFileDeleted: async (fileId) => { deletedFiles.push(fileId); },
    getFile: async (fileId) => ['123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174002'].includes(fileId) ? {
      id: fileId, status: 'ready', purpose: 'registration-document', entityType: 'registration', entityId: 'HI-REG-2026-00001', storageKey: 'registration-document/HI-REG-2026-00001/file.pdf'
    } : null,
    now() {
      clock += 1;
      return `2026-09-15T00:00:0${clock}.000Z`;
    }
  });
  const submitted = await service.create(applicant('Naufal Rizki'));

  assert.equal(submitted.ok, true);
  assert.equal(submitted.value.registrationId, 'HI-REG-2026-00001');
  // Regresi: program disimpan bersarang di applicant.program, dan toPublicRegistration
  // sempat membacanya dari record.program (tidak ada), sehingga selalu tampil "undefined"
  // di daftar pendaftaran staf. Ketahuan lewat pengecekan manual di browser, bukan test.
  assert.equal(submitted.value.program, domain.PROGRAMS.MAHAD);

  const id = submitted.value.registrationId;
  const documentAdded = await service.addDocument(id, { type: 'passport', fileObjectId: '123e4567-e89b-12d3-a456-426614174000' }, { role: domain.ROLES.APPLICANT });
  assert.equal(documentAdded.ok, true);
  assert.equal((await service.addDocument(id, { type: 'passport', storageKey: 'registrations/forged.pdf' }, { role: domain.ROLES.APPLICANT })).ok, false, 'Storage key dari browser harus ditolak.');
  assert.equal((await service.addDocument(id, { type: 'passport', fileObjectId: '123e4567-e89b-12d3-a456-426614174001' }, { role: domain.ROLES.APPLICANT })).ok, false, 'File yang tidak dikenal harus ditolak.');
  const documentId = documentAdded.value.documentSummary[0].id;
  assert.equal((await service.reviewDocument(id, documentId, { reviewStatus: 'rejected', note: '' }, { role: domain.ROLES.REGISTRATION_OFFICER, accountId: 'staff-1' })).ok, false);
  assert.equal((await service.reviewDocument(id, documentId, { reviewStatus: 'accepted' }, { role: domain.ROLES.REGISTRATION_OFFICER, accountId: 'staff-1' })).ok, true);
  const revision = await service.addDocument(id, { type: 'transcript', fileObjectId: '123e4567-e89b-12d3-a456-426614174002' }, { role: domain.ROLES.APPLICANT });
  assert.equal(revision.ok, true);
  const revisionId = revision.value.documentSummary.find((entry) => entry.type === 'transcript').id;
  assert.equal((await service.deleteDocument(id, revisionId, { role: domain.ROLES.APPLICANT })).ok, true);
  assert.deepEqual(deletedFiles, ['123e4567-e89b-12d3-a456-426614174002']);
  assert.equal((await service.deleteDocument(id, documentId, { role: domain.ROLES.APPLICANT })).ok, false, 'Dokumen diterima harus terkunci.');
  assert.equal((await service.addNote(id, { visibility: 'applicant', body: 'Mohon menunggu pemeriksaan berikutnya.' }, { role: domain.ROLES.REGISTRATION_OFFICER, accountId: 'staff-1' })).ok, true);
  assert.equal((await service.changeStatus(id, domain.STATUSES.DOCUMENT_REVIEW, { role: domain.ROLES.APPLICANT })).ok, false);
  assert.equal((await service.changeStatus(id, domain.STATUSES.DOCUMENT_REVIEW, { role: domain.ROLES.REGISTRATION_OFFICER, note: 'Berkas diperiksa.' })).value.status, domain.STATUSES.DOCUMENT_REVIEW);
  const publicView = await service.getPublic(id);
  assert.equal(publicView.value.history.length, 2);
  assert.equal(publicView.value.program, domain.PROGRAMS.MAHAD);
  assert.equal(publicView.value.documentSummary[0].reviewStatus, 'accepted');
  assert.equal(publicView.value.notes.length, 1);
  const staffList = await service.listForStaff();
  assert.equal(staffList.length, 1);
  assert.equal(staffList[0].program, domain.PROGRAMS.MAHAD, 'Tampilan staf juga harus membawa program, bukan undefined.');
  const snapshot = await service.store.get(id);
  const current = await service.store.get(id);
  await service.store.update({ ...current, updatedAt: '2026-09-15T00:00:30.000Z' });
  await assert.rejects(
    service.store.update(snapshot),
    /Konflik versi/,
    'Snapshot registrasi lama harus ditolak.'
  );
}

// Skenario A: dua pendaftar mengirim formulir hampir bersamaan.
async function testConcurrentSubmissions() {
  const store = createLatentStore();
  const service = serviceModule.createRegistrationService({ store, now: () => '2026-09-15T00:00:00.000Z' });

  const results = await Promise.all([
    service.create(applicant('Aisyah')),
    service.create(applicant('Budi')),
    service.create(applicant('Citra'))
  ]);

  const ids = results.map((result) => result.value.registrationId);
  assert.equal(new Set(ids).size, 3, `Nomor registrasi harus unik, ternyata: ${ids.join(', ')}`);
  assert.equal(store.database.records.size, 3, `Semua pendaftar harus tersimpan: ${namesById(store.database).join(', ')}`);
}

// Skenario B: satu penyimpanan gagal sehingga nomor bolong, lalu server dijalankan ulang.
async function testRestartAfterFailedInsert() {
  const database = { records: new Map(), counters: new Map() };
  const failingStore = createLatentStore({ database, failInserts: 1 });
  const firstService = serviceModule.createRegistrationService({ store: failingStore, now: () => '2026-09-15T00:00:00.000Z' });

  await assert.rejects(firstService.create(applicant('Dimas')), /simulasi/);
  await firstService.create(applicant('Eka'));
  await firstService.create(applicant('Fajar'));
  const sebelumRestart = namesById(database);

  // Server dijalankan ulang: service baru dengan store yang sama.
  const restartedService = serviceModule.createRegistrationService({ store: createLatentStore({ database }), now: () => '2026-09-15T00:00:00.000Z' });
  await restartedService.create(applicant('Gina'));

  assert.equal(database.records.size, sebelumRestart.length + 1, `Pendaftar lama tidak boleh tertimpa. Sebelum: ${sebelumRestart.join(', ')} | sesudah: ${namesById(database).join(', ')}`);
  assert.ok(namesById(database).some((entry) => entry.endsWith('=Fajar')), 'Data Fajar harus tetap ada.');
}

// Nomor yang sudah dipakai tidak boleh menimpa data lama.
async function testDuplicateNumberIsRejected() {
  const store = createLatentStore();
  const service = serviceModule.createRegistrationService({ store, now: () => '2026-09-15T00:00:00.000Z' });
  await service.create(applicant('Hana'));

  // Penghitung dimundurkan secara paksa, meniru database yang kehilangan catatan penghitung.
  store.database.counters.set('registration:2026', 0);
  await assert.rejects(service.create(applicant('Ivan')), /sudah dipakai/);
  assert.ok(namesById(store.database).some((entry) => entry.endsWith('=Hana')), 'Data Hana harus tetap ada.');
}

// Nomor registrasi memakai tahun menurut zona Asia/Jakarta.
async function testYearUsesJakartaTimeZone() {
  const store = createLatentStore();
  const service = serviceModule.createRegistrationService({ store, now: () => '2026-12-31T17:30:00.000Z' });
  const created = await service.create(applicant('Joko'));
  assert.equal(created.value.registrationId, 'HI-REG-2027-00001');
}

// Data yang tidak valid tidak boleh menghabiskan nomor registrasi.
async function testInvalidSubmissionDoesNotConsumeNumber() {
  const store = createLatentStore();
  const service = serviceModule.createRegistrationService({ store, now: () => '2026-09-15T00:00:00.000Z' });
  const invalid = await service.create({ applicantName: 'X', consent: false });
  assert.equal(invalid.ok, false);
  const valid = await service.create(applicant('Kirana'));
  assert.equal(valid.value.registrationId, 'HI-REG-2026-00001');
}

async function run() {
  await testNormalFlow();
  await testVersiKebijakanPrivasi();
  await testConcurrentSubmissions();
  await testRestartAfterFailedInsert();
  await testDuplicateNumberIsRejected();
  await testYearUsesJakartaTimeZone();
  await testInvalidSubmissionDoesNotConsumeNumber();
  console.log('registration-service tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
