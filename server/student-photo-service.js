'use strict';

// Foto profil santri untuk kartu di beranda musyrif dan beranda keluarga.
//
// Urutan sumber:
//   1. Unggahan siap terbaru bertujuan 'student-photo' untuk santri itu (admin/musyrif).
//   2. Pas foto dari berkas pendaftaran (registration_documents tipe 'photo'), bila santri
//      berasal dari pendaftaran dan berkasnya gambar.
// Tidak ada kolom baru di tabel students: foto yang berlaku dibaca dari file_objects,
// sehingga kode ini aman berjalan tanpa migrasi.
//
// Isi gambar dikirim lewat server (bukan tautan bertanda tangan ke storage), karena CSP
// portal hanya mengizinkan connect-src 'self'.

const GAMBAR = new Set(['image/jpeg', 'image/png', 'image/webp']);

function createStudentPhotoService({ database, storage, studentPortalService }) {
  if (!database || !storage || !studentPortalService) {
    throw new Error('createStudentPhotoService membutuhkan database, storage, dan studentPortalService.');
  }

  async function ambil(sql, params) {
    return (await database.query(sql, params)).rows;
  }

  // Baris file_objects yang berlaku untuk tiap santri dalam daftar.
  async function sumberFoto(studentIds) {
    const ids = [...new Set((studentIds || []).map(String))];
    const hasil = new Map();
    if (!ids.length) return hasil;
    const unggahan = await ambil(
      `SELECT DISTINCT ON (entity_id) entity_id AS student_id, id, bucket, storage_key, content_type
         FROM file_objects
        WHERE purpose = 'student-photo' AND status = 'ready' AND entity_id = ANY($1::text[])
        ORDER BY entity_id, created_at DESC`,
      [ids]
    );
    unggahan.forEach((row) => hasil.set(row.student_id, row));
    const sisa = ids.filter((id) => !hasil.has(id));
    if (sisa.length) {
      const pasFoto = await ambil(
        `SELECT DISTINCT ON (s.id) s.id::text AS student_id, f.id, f.bucket, f.storage_key, f.content_type
           FROM students s
           JOIN registration_documents d ON d.registration_id = s.registration_id AND d.document_type = 'photo'
           JOIN file_objects f ON f.id = d.file_object_id AND f.status = 'ready'
          WHERE s.id::text = ANY($1::text[]) AND f.content_type = ANY($2::text[])
          ORDER BY s.id, d.uploaded_at DESC`,
        [sisa, [...GAMBAR]]
      );
      pasFoto.forEach((row) => hasil.set(row.student_id, row));
    }
    return hasil;
  }

  // Santri mana saja yang punya foto, untuk daftar kartu. Tidak memeriksa akses: pemanggil
  // hanya mengirim id santri yang memang sudah boleh dilihatnya.
  async function withPhoto(studentIds) {
    return new Set((await sumberFoto(studentIds)).keys());
  }

  async function photoFor(studentId, actor) {
    const akses = await studentPortalService.accessFor(studentId, actor);
    if (!akses.exists) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    if (!akses.view) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
    const baris = (await sumberFoto([studentId])).get(String(studentId));
    if (!baris || !GAMBAR.has(baris.content_type)) return { ok: false, status: 404, error: 'Santri ini belum punya foto.' };
    const content = await storage.read(baris.bucket, baris.storage_key);
    if (!content) return { ok: false, status: 404, error: 'Foto tidak ditemukan.' };
    return { ok: true, value: { contentType: baris.content_type, content, fileId: baris.id } };
  }

  return Object.freeze({ photoFor, withPhoto });
}

module.exports = { createStudentPhotoService };
