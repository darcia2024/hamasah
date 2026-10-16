// Foto profil santri: unggahan terbaru, cadangan pas foto pendaftaran, dan hak akses.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createStudentPhotoService } = require('./student-photo-service.js');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 9, 9, 9]);

function memoryStorage() {
  const isi = new Map();
  return {
    put(bucket, key, buffer) { isi.set(`${bucket}/${key}`, buffer); },
    async read(bucket, key) { return isi.get(`${bucket}/${key}`) || null; }
  };
}

async function run() {
  const database = await createTestDatabase();
  try {
    const storage = memoryStorage();
    const boleh = new Set();
    const studentPortalService = {
      async accessFor(studentId, actor) {
        const ada = (await database.query('SELECT 1 FROM students WHERE id = $1', [studentId])).rows.length > 0;
        return { exists: ada, view: ada && boleh.has(`${actor.id}:${studentId}`), write: false, staff: false };
      }
    };
    const layanan = createStudentPhotoService({ database, storage, studentPortalService });

    async function santri(nama, registrationId = null) {
      const id = crypto.randomUUID();
      await database.query(
        `INSERT INTO students (id, name, program, city, join_date, status, registration_id)
         VALUES ($1, $2, 'Kuliah Al-Azhar', 'Kairo', '2026-08-01', 'active', $3)`,
        [id, nama, registrationId]
      );
      return id;
    }

    async function berkas({ purpose, entityType, entityId, contentType, isi, createdAt, status = 'ready' }) {
      const id = crypto.randomUUID();
      const key = `${purpose}/${entityId}/${id}`;
      await database.query(
        `INSERT INTO file_objects (id, bucket, storage_key, purpose, entity_type, entity_id, original_name, content_type, size_bytes, sha256, status, created_at)
         VALUES ($1, 'hamasah-private', $2, $3, $4, $5, 'foto', $6, $7, 'x', $8, $9)`,
        [id, key, purpose, entityType, entityId, contentType, isi.length, status, createdAt]
      );
      storage.put('hamasah-private', key, isi);
      return id;
    }

    // 1. Unggahan terbaru yang berlaku; yang masih pending diabaikan.
    const ahmad = await santri('Ahmad Zaki');
    await berkas({ purpose: 'student-photo', entityType: 'student', entityId: ahmad, contentType: 'image/jpeg', isi: JPG, createdAt: '2026-10-01T00:00:00Z' });
    const terbaru = await berkas({ purpose: 'student-photo', entityType: 'student', entityId: ahmad, contentType: 'image/png', isi: PNG, createdAt: '2026-10-05T00:00:00Z' });
    await berkas({ purpose: 'student-photo', entityType: 'student', entityId: ahmad, contentType: 'image/jpeg', isi: JPG, createdAt: '2026-10-09T00:00:00Z', status: 'pending' });

    const musyrif = { id: crypto.randomUUID(), role: 'supervisor' };
    const ditolak = await layanan.photoFor(ahmad, musyrif);
    assert.equal(ditolak.ok, false);
    assert.equal(ditolak.status, 403, 'Musyrif asrama lain tidak boleh melihat foto.');

    boleh.add(`${musyrif.id}:${ahmad}`);
    const foto = await layanan.photoFor(ahmad, musyrif);
    assert.equal(foto.ok, true);
    assert.equal(foto.value.fileId, terbaru);
    assert.equal(foto.value.contentType, 'image/png');
    assert.deepEqual(foto.value.content, PNG);

    // 2. Tanpa unggahan: pas foto pendaftaran. Berkas PDF tidak dipakai sebagai foto.
    const registrasi = crypto.randomUUID();
    await database.query(
      `INSERT INTO registrations (id, registration_id, applicant_name, phone_e164, program, consented_at, status, progress, access_token_hash)
       VALUES ($1, 'HI-REG-2026-00991', 'Hana Salsabila', '+6281200000000', 'kuliah-al-azhar', now(), 'completed', 100, 'x')`,
      [registrasi]
    );
    const hana = await santri('Hana Salsabila', registrasi);
    const pdf = await berkas({ purpose: 'registration-document', entityType: 'registration', entityId: registrasi, contentType: 'application/pdf', isi: Buffer.from('%PDF-1'), createdAt: '2026-07-01T00:00:00Z' });
    await database.query(
      `INSERT INTO registration_documents (id, registration_id, document_type, storage_key, uploaded_by_role, uploaded_at, file_object_id)
       VALUES ($1, $2, 'photo', 'x', 'applicant', '2026-07-02T00:00:00Z', $3)`,
      [crypto.randomUUID(), registrasi, pdf]
    );
    boleh.add(`${musyrif.id}:${hana}`);
    assert.equal((await layanan.photoFor(hana, musyrif)).status, 404, 'Pas foto berupa PDF tidak ditampilkan.');

    const pasFoto = await berkas({ purpose: 'registration-document', entityType: 'registration', entityId: registrasi, contentType: 'image/jpeg', isi: JPG, createdAt: '2026-07-03T00:00:00Z' });
    await database.query(
      `INSERT INTO registration_documents (id, registration_id, document_type, storage_key, uploaded_by_role, uploaded_at, file_object_id)
       VALUES ($1, $2, 'photo', 'y', 'applicant', '2026-07-04T00:00:00Z', $3)`,
      [crypto.randomUUID(), registrasi, pasFoto]
    );
    const cadangan = await layanan.photoFor(hana, musyrif);
    assert.equal(cadangan.ok, true);
    assert.equal(cadangan.value.fileId, pasFoto);

    // Unggahan musyrif menggantikan pas foto.
    const baru = await berkas({ purpose: 'student-photo', entityType: 'student', entityId: hana, contentType: 'image/webp', isi: Buffer.from('RIFFxxxxWEBP'), createdAt: '2026-10-10T00:00:00Z' });
    assert.equal((await layanan.photoFor(hana, musyrif)).value.fileId, baru);

    // 3. Daftar santri berfoto untuk kartu.
    const tanpaFoto = await santri('Daffa Rasyid');
    const punya = await layanan.withPhoto([ahmad, hana, tanpaFoto]);
    assert.deepEqual([...punya].sort(), [ahmad, hana].sort());
    assert.equal((await layanan.photoFor(tanpaFoto, { id: 'admin', role: 'admin' })).status, 403);
    assert.equal((await layanan.photoFor(crypto.randomUUID(), musyrif)).status, 404);

    console.log('student photo tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
