const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createPostgresRegistrationStore } = require('./postgres-registration-store.js');

const CREATED_AT = '2026-09-15T00:00:00.000Z';
const REVIEWED_AT = '2026-09-15T02:00:00.000Z';

function sampleRecord() {
  return {
    registrationId: 'HI-REG-2026-00001',
    status: 'submitted',
    progress: 15,
    applicant: {
      applicantName: 'Calon Santri Uji',
      phone: '+628000000001',
      guardianName: 'Wali Uji',
      guardianPhone: '+628000000002',
      guardianEmail: 'wali@hamasah.test',
      email: 'calon@hamasah.test',
      birthDate: '2008-04-12',
      gender: 'putra',
      schoolOrigin: 'SMA Uji',
      programDetails: { targetLevel: 'tsanawi' },
      referralSource: 'teman',
      privacyPolicyVersion: 'v2',
      guardianConsent: true,
      program: 'mahad-al-azhar',
      educationLevel: 'MA',
      city: 'Bandung'
    },
    accessTokenHash: 'hash-akses-uji',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    documents: [{
      type: 'passport',
      storageKey: 'registrations/uji/paspor.pdf',
      status: 'received',
      uploadedAt: CREATED_AT,
      uploadedBy: 'applicant'
    }],
    statusHistory: [{
      from: 'draft',
      to: 'submitted',
      changedAt: CREATED_AT,
      changedBy: 'applicant',
      note: 'Data pendaftaran awal dikirim.'
    }]
  };
}

async function run() {
  const database = await createTestDatabase();
  try {
    const store = createPostgresRegistrationStore({ database });
    assert.equal(await store.count(), 0);
    assert.equal(await store.get('HI-REG-2026-00001'), null);

    // Nomor urut diambil dari database dan selalu naik.
    assert.equal(await store.nextSequence('registration', 2026), 1);
    assert.equal(await store.nextSequence('registration', 2026), 2);
    assert.equal(await store.nextSequence('registration', 2027), 1, 'Penghitung dipisah per tahun.');
    assert.equal(await store.nextSequence('invoice', 2026), 1, 'Penghitung dipisah per jenis dokumen.');

    // 20 permintaan bersamaan harus menghasilkan 20 nomor berbeda.
    const paralel = await Promise.all(Array.from({ length: 20 }, () => store.nextSequence('registration', 2030)));
    assert.equal(new Set(paralel).size, 20);
    assert.equal(Math.max(...paralel), 20);

    // Round-trip lengkap: data, dokumen, dan riwayat.
    const saved = await store.insert(sampleRecord());
    assert.ok(saved.id);
    const loaded = await store.get('HI-REG-2026-00001');
    assert.equal(loaded.id, saved.id);
    assert.equal(loaded.status, 'submitted');
    assert.equal(loaded.progress, 15);
    assert.equal(loaded.applicant.applicantName, 'Calon Santri Uji');
    assert.equal(loaded.applicant.guardianPhone, '+628000000002');
    assert.equal(loaded.applicant.email, 'calon@hamasah.test');
    assert.equal(loaded.applicant.birthDate, '2008-04-12');
    assert.equal(loaded.applicant.gender, 'putra');
    assert.deepEqual(loaded.applicant.programDetails, { targetLevel: 'tsanawi' });
    assert.equal(loaded.applicant.guardianConsent, true);
    assert.equal(loaded.accessTokenHash, 'hash-akses-uji');
    assert.equal(loaded.createdAt, CREATED_AT);
    assert.equal(loaded.documents.length, 1);
    assert.equal(loaded.documents[0].type, 'passport');
    assert.equal(loaded.documents[0].reviewStatus, 'pending');
    assert.equal(loaded.documents[0].reviewNote, '');
    assert.match(loaded.documents[0].id, /^[\w-]+$/);
    assert.deepEqual(loaded.statusHistory, sampleRecord().statusHistory.map((entry) => ({
      ...entry,
      changedByAccountId: null,
      changedByName: null
    })));
    assert.equal(await store.count(), 1);
    assert.equal((await store.list()).length, 1);

    // Rollback: dokumen dengan document_type tidak valid membuat CHECK gagal.
    // Seluruh perubahan dalam penyimpanan itu harus batal, data lama tetap utuh.
    const brokenUpdate = {
      ...loaded,
      status: 'document-review',
      progress: 35,
      updatedAt: REVIEWED_AT,
      statusHistory: loaded.statusHistory.concat({
        from: 'submitted',
        to: 'document-review',
        changedAt: REVIEWED_AT,
        changedBy: 'registration-officer',
        note: ''
      }),
      documents: loaded.documents.concat({
        type: 'jenis-tidak-valid',
        storageKey: 'registrations/uji/lain.pdf',
        status: 'received',
        uploadedAt: REVIEWED_AT,
        uploadedBy: 'registration-officer'
      })
    };
    // Nomor yang sudah dipakai ditolak, bukan menimpa data lama.
    await assert.rejects(store.insert(sampleRecord()), /duplicate key|unique/i);
    assert.equal((await store.get('HI-REG-2026-00001')).applicant.applicantName, 'Calon Santri Uji');

    await assert.rejects(store.update(brokenUpdate), /check constraint/i);
    const afterFailure = await store.get('HI-REG-2026-00001');
    assert.equal(afterFailure.status, 'submitted');
    assert.equal(afterFailure.progress, 15);
    assert.equal(afterFailure.updatedAt, CREATED_AT);
    assert.equal(afterFailure.documents.length, 1);
    assert.equal(afterFailure.statusHistory.length, 1);

    // Perubahan yang valid tetap tersimpan setelah kegagalan sebelumnya,
    // lengkap dengan akun petugas yang melakukannya.
    const petugasId = crypto.randomUUID();
    await database.query(
      `INSERT INTO accounts (id, email, name, role, password_hash)
       VALUES ($1, 'petugas@hamasah.test', 'Petugas Uji', 'registration-officer', 'scrypt$uji$hash')`,
      [petugasId]
    );
    const validUpdate = {
      ...brokenUpdate,
      documents: loaded.documents,
      statusHistory: loaded.statusHistory.concat({
        from: 'submitted',
        to: 'document-review',
        changedAt: REVIEWED_AT,
        changedBy: 'registration-officer',
        changedByAccountId: petugasId,
        note: 'Berkas mulai diperiksa.'
      })
    };
    await store.update(validUpdate);
    const afterUpdate = await store.get('HI-REG-2026-00001');
    assert.equal(afterUpdate.status, 'document-review');
    assert.equal(afterUpdate.statusHistory.length, 2);
    assert.equal(afterUpdate.statusHistory[1].changedByAccountId, petugasId);
    assert.equal(afterUpdate.statusHistory[1].changedByName, 'Petugas Uji');
    assert.equal(afterUpdate.statusHistory[0].changedByAccountId, null, 'Pendaftar tidak punya akun.');

    // Riwayat tetap ada walaupun akun petugas dihapus.
    await database.query('DELETE FROM accounts WHERE id = $1', [petugasId]);
    const afterAccountRemoved = await store.get('HI-REG-2026-00001');
    assert.equal(afterAccountRemoved.statusHistory.length, 2);
    assert.equal(afterAccountRemoved.statusHistory[1].changedByAccountId, null);
    assert.equal(afterAccountRemoved.statusHistory[1].changedBy, 'registration-officer');
    assert.equal(afterUpdate.documents.length, 1);
    assert.equal(await store.count(), 1);

    // Dua request yang membaca snapshot parent yang sama: tepat satu boleh menang.
    // Request kedua harus mendapat konflik optimistic version setelah lock dilepas.
    const concurrentBase = await store.get('HI-REG-2026-00001');
    const concurrentA = {
      ...concurrentBase,
      applicant: { ...concurrentBase.applicant, city: 'Kairo' },
      updatedAt: '2026-09-15T03:00:00.000Z'
    };
    const concurrentB = {
      ...concurrentBase,
      applicant: { ...concurrentBase.applicant, city: 'Giza' },
      updatedAt: '2026-09-15T03:01:00.000Z'
    };
    const concurrentResults = await Promise.allSettled([store.update(concurrentA), store.update(concurrentB)]);
    assert.equal(concurrentResults.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(concurrentResults.filter((result) => result.status === 'rejected').length, 1);
    assert.match(concurrentResults.find((result) => result.status === 'rejected').reason.message, /sudah berubah/);

    // Update untuk pendaftaran yang tidak ada ditolak.
    await assert.rejects(
      store.update({ ...validUpdate, id: undefined, registrationId: 'HI-REG-2026-09999' }),
      /tidak ditemukan/
    );

    console.log('postgres registration store tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
