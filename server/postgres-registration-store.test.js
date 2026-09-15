const assert = require('node:assert/strict');
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

    // Round-trip lengkap: data, dokumen, dan riwayat.
    const saved = await store.save(sampleRecord());
    assert.ok(saved.id);
    const loaded = await store.get('HI-REG-2026-00001');
    assert.equal(loaded.id, saved.id);
    assert.equal(loaded.status, 'submitted');
    assert.equal(loaded.progress, 15);
    assert.equal(loaded.applicant.applicantName, 'Calon Santri Uji');
    assert.equal(loaded.applicant.guardianPhone, '+628000000002');
    assert.equal(loaded.accessTokenHash, 'hash-akses-uji');
    assert.equal(loaded.createdAt, CREATED_AT);
    assert.deepEqual(loaded.documents, sampleRecord().documents);
    assert.deepEqual(loaded.statusHistory, sampleRecord().statusHistory);
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
    await assert.rejects(store.save(brokenUpdate), /check constraint/i);
    const afterFailure = await store.get('HI-REG-2026-00001');
    assert.equal(afterFailure.status, 'submitted');
    assert.equal(afterFailure.progress, 15);
    assert.equal(afterFailure.updatedAt, CREATED_AT);
    assert.equal(afterFailure.documents.length, 1);
    assert.equal(afterFailure.statusHistory.length, 1);

    // Perubahan yang valid tetap tersimpan setelah kegagalan sebelumnya.
    const validUpdate = {
      ...brokenUpdate,
      documents: loaded.documents
    };
    await store.save(validUpdate);
    const afterUpdate = await store.get('HI-REG-2026-00001');
    assert.equal(afterUpdate.status, 'document-review');
    assert.equal(afterUpdate.statusHistory.length, 2);
    assert.equal(afterUpdate.documents.length, 1);
    assert.equal(await store.count(), 1);

    console.log('postgres registration store tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
