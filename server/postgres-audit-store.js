// Penyimpanan catatan audit.

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toEvent(row) {
  return {
    id: row.id,
    occurredAt: toIso(row.occurred_at),
    actorAccountId: row.actor_account_id || null,
    actorRole: row.actor_role || null,
    actorName: row.actor_name || null,
    action: row.action,
    entityType: row.entity_type || null,
    entityId: row.entity_id || null,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {})
  };
}

function createPostgresAuditStore({ database } = {}) {
  if (!database) {
    throw new Error('createPostgresAuditStore membutuhkan database.');
  }

  return {
    async insert(event) {
      await database.query(
        `INSERT INTO audit_events
           (id, occurred_at, actor_account_id, actor_role, action, entity_type, entity_id, ip_hash, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          event.id,
          event.occurredAt,
          event.actorAccountId,
          event.actorRole,
          event.action,
          event.entityType,
          event.entityId,
          event.ipHash,
          JSON.stringify(event.metadata || {})
        ]
      );
    },

    // Penyaringan dan paginasi. ip_hash sengaja tidak pernah ikut keluar: nilainya
    // tidak berguna untuk dibaca manusia dan hanya menambah risiko kalau bocor.
    async list({ from, to, action, actorAccountId, limit, offset } = {}) {
      const kondisi = [];
      const nilai = [];
      function tambah(sql, isi) {
        nilai.push(isi);
        kondisi.push(sql.replace('$n', `$${nilai.length}`));
      }
      if (from) tambah('e.occurred_at >= $n', from);
      if (to) tambah('e.occurred_at <= $n', to);
      if (action) tambah('e.action = $n', action);
      if (actorAccountId) tambah('e.actor_account_id = $n', actorAccountId);

      const where = kondisi.length ? `WHERE ${kondisi.join(' AND ')}` : '';
      const ukuran = Math.min(Number(limit) > 0 ? Number(limit) : DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
      const mulai = Number(offset) > 0 ? Number(offset) : 0;

      const total = await database.query(`SELECT count(*)::int AS jumlah FROM audit_events e ${where}`, nilai);
      const { rows } = await database.query(
        `SELECT e.id, e.occurred_at, e.actor_account_id, e.actor_role, e.action, e.entity_type, e.entity_id, e.metadata,
                k.name AS actor_name
           FROM audit_events e
           LEFT JOIN accounts k ON k.id = e.actor_account_id
           ${where}
          ORDER BY e.occurred_at DESC, e.id DESC
          LIMIT $${nilai.length + 1} OFFSET $${nilai.length + 2}`,
        [...nilai, ukuran, mulai]
      );

      return { items: rows.map(toEvent), total: total.rows[0].jumlah, limit: ukuran, offset: mulai };
    },

    async deleteBefore(isoTime) {
      const { rowCount } = await database.query('DELETE FROM audit_events WHERE occurred_at < $1', [isoTime]);
      return rowCount;
    }
  };
}

module.exports = { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, createPostgresAuditStore, toEvent };
