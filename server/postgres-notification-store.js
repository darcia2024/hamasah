function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNotification(row) {
  return {
    id: row.id,
    notificationType: row.notification_type,
    recipientEmail: row.recipient_email,
    provider: row.provider,
    status: row.status,
    attempts: Number(row.attempts),
    providerMessageId: row.provider_message_id || null,
    lastError: row.last_error || null,
    createdAt: toIso(row.created_at),
    sentAt: toIso(row.sent_at),
    updatedAt: toIso(row.updated_at)
  };
}

const FIELDS = `id, notification_type, recipient_email, provider, status, attempts,
  provider_message_id, last_error, created_at, sent_at, updated_at`;

function createPostgresNotificationStore({ database } = {}) {
  if (!database) {
    throw new Error('createPostgresNotificationStore membutuhkan database.');
  }

  return {
    async create(record) {
      const { rows } = await database.query(
        `INSERT INTO notification_outbox
          (id, notification_type, recipient_email, provider, status, attempts, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'pending', 0, $5, $5)
         RETURNING ${FIELDS}`,
        [record.id, record.notificationType, record.recipientEmail, record.provider, record.createdAt]
      );
      return toNotification(rows[0]);
    },

    async markSent(id, { providerMessageId, sentAt }) {
      const { rows } = await database.query(
        `UPDATE notification_outbox
          SET status = 'sent', attempts = attempts + 1, provider_message_id = $2,
              last_error = NULL, sent_at = $3, updated_at = $3
          WHERE id = $1
          RETURNING ${FIELDS}`,
        [id, providerMessageId || null, sentAt]
      );
      return rows[0] ? toNotification(rows[0]) : null;
    },

    async markFailed(id, { message, failedAt }) {
      const { rows } = await database.query(
        `UPDATE notification_outbox
          SET status = 'failed', attempts = attempts + 1, last_error = $2, updated_at = $3
          WHERE id = $1
          RETURNING ${FIELDS}`,
        [id, String(message || 'Pengiriman gagal.').slice(0, 500), failedAt]
      );
      return rows[0] ? toNotification(rows[0]) : null;
    },

    async list({ limit = 50, offset = 0, recipientEmail, status } = {}) {
      const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
      const safeOffset = Math.max(Number(offset) || 0, 0);
      const filters = [];
      const values = [];
      if (recipientEmail) {
        values.push(String(recipientEmail).toLocaleLowerCase('en-US'));
        filters.push(`recipient_email = $${values.length}`);
      }
      if (['pending', 'sent', 'failed'].includes(status)) {
        values.push(status);
        filters.push(`status = $${values.length}`);
      }
      const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
      const countResult = await database.query(`SELECT count(*)::int AS total FROM notification_outbox ${where}`, values);
      values.push(safeLimit, safeOffset);
      const { rows } = await database.query(
        `SELECT ${FIELDS} FROM notification_outbox ${where}
         ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );
      return { items: rows.map(toNotification), total: Number(countResult.rows[0].total), limit: safeLimit, offset: safeOffset };
    }
  };
}

module.exports = { createPostgresNotificationStore, toNotification };
