// Catatan berkas yang diunggah. Isi berkasnya ada di object storage, bukan di sini.

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toFile(row) {
  return {
    id: row.id,
    bucket: row.bucket,
    storageKey: row.storage_key,
    purpose: row.purpose,
    entityType: row.entity_type,
    entityId: row.entity_id,
    originalName: row.original_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256 || null,
    status: row.status,
    uploadedByAccountId: row.uploaded_by_account_id || null,
    createdAt: toIso(row.created_at),
    deletedAt: toIso(row.deleted_at)
  };
}

const KOLOM = `id, bucket, storage_key, purpose, entity_type, entity_id, original_name,
               content_type, size_bytes, sha256, status, uploaded_by_account_id, created_at, deleted_at`;

function createPostgresFileStore({ database } = {}) {
  if (!database) {
    throw new Error('createPostgresFileStore membutuhkan database.');
  }

  return {
    async insert(record) {
      const { rows } = await database.query(
        `INSERT INTO file_objects
           (id, bucket, storage_key, purpose, entity_type, entity_id, original_name,
            content_type, size_bytes, sha256, status, uploaded_by_account_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING ${KOLOM}`,
        [
          record.id, record.bucket, record.storageKey, record.purpose, record.entityType,
          record.entityId, record.originalName, record.contentType, record.sizeBytes,
          record.sha256, record.status, record.uploadedByAccountId, record.createdAt
        ]
      );
      return toFile(rows[0]);
    },

    async get(id) {
      const { rows } = await database.query(`SELECT ${KOLOM} FROM file_objects WHERE id = $1`, [id]);
      return rows[0] ? toFile(rows[0]) : null;
    },

    async listForEntity(entityType, entityId) {
      const { rows } = await database.query(
        `SELECT ${KOLOM} FROM file_objects
          WHERE entity_type = $1 AND entity_id = $2 AND status = 'ready'
          ORDER BY created_at DESC`,
        [entityType, entityId]
      );
      return rows.map(toFile);
    },

    // Hanya baris yang masih pending yang boleh menjadi ready, supaya isi berkas
    // tidak bisa ditimpa lewat pengiriman kedua.
    async markReady(id, { sha256, sizeBytes }) {
      const { rows } = await database.query(
        `UPDATE file_objects SET status = 'ready', sha256 = $2, size_bytes = $3
          WHERE id = $1 AND status = 'pending'
          RETURNING ${KOLOM}`,
        [id, sha256, sizeBytes]
      );
      return rows[0] ? toFile(rows[0]) : null;
    },

    async markDeleted(id, deletedAt) {
      const { rows } = await database.query(
        `UPDATE file_objects SET status = 'deleted', deleted_at = $2 WHERE id = $1 RETURNING ${KOLOM}`,
        [id, deletedAt]
      );
      return rows[0] ? toFile(rows[0]) : null;
    },

    async deletePendingBefore(isoTime) {
      const { rowCount } = await database.query(
        "DELETE FROM file_objects WHERE status = 'pending' AND created_at < $1",
        [isoTime]
      );
      return rowCount;
    }
  };
}

module.exports = { createPostgresFileStore, toFile };
