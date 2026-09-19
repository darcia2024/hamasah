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
    accountId: row.account_id || null,
    status: row.status,
    attempts: Number(row.attempts),
    providerMessageId: row.provider_message_id || null,
    lastError: row.last_error || null,
    createdAt: toIso(row.created_at),
    sentAt: toIso(row.sent_at),
    updatedAt: toIso(row.updated_at)
  };
}

const FIELDS = `id, notification_type, recipient_email, provider, account_id, status, attempts,
  provider_message_id, last_error, created_at, sent_at, updated_at`;
// UPDATE ... FROM memiliki dua sumber kolom `id`; prefix outbox mencegah
// PostgreSQL menganggap RETURNING id ambigu saat worker melakukan claim.
const CLAIM_FIELDS = `outbox.id, outbox.notification_type, outbox.recipient_email, outbox.provider, outbox.account_id, outbox.status, outbox.attempts,
  outbox.provider_message_id, outbox.last_error, outbox.created_at, outbox.sent_at, outbox.updated_at,
  outbox.payload_ciphertext, outbox.payload_nonce, outbox.payload_tag, outbox.claim_token, outbox.next_attempt_at`;

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

    async claim({ limit = 10, now = new Date(), leaseMs = 300000 } = {}) {
      const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
      const claimedAt = now instanceof Date ? now : new Date(now);
      const leaseCutoff = new Date(claimedAt.getTime() - leaseMs).toISOString();
      const { rows } = await database.query(
        `WITH available AS (
           SELECT id FROM notification_outbox
           WHERE (status IN ('pending', 'failed') AND next_attempt_at <= $1)
              OR (status = 'processing' AND claimed_at < $2)
           ORDER BY next_attempt_at ASC, created_at ASC
           FOR UPDATE SKIP LOCKED LIMIT $3
         )
         UPDATE notification_outbox AS outbox
         SET status = 'processing', claimed_at = $1, claim_token = gen_random_uuid(), updated_at = $1
         FROM available
         WHERE outbox.id = available.id
         RETURNING ${CLAIM_FIELDS}`,
        [claimedAt.toISOString(), leaseCutoff, safeLimit]
      );
      return rows;
    },

    async markDelivered(id, claimToken, { providerMessageId, sentAt }) {
      const { rows } = await database.query(
        `UPDATE notification_outbox
          SET status = 'sent', attempts = attempts + 1, provider_message_id = $3,
              last_error = NULL, sent_at = $4, claimed_at = NULL, claim_token = NULL, updated_at = $4
          WHERE id = $1 AND claim_token = $2
          RETURNING ${FIELDS}`,
        [id, claimToken, providerMessageId || null, sentAt]
      );
      return rows[0] ? toNotification(rows[0]) : null;
    },

    async markDeliveryFailed(id, claimToken, { message, failedAt, retryAt, maxAttempts = 5 }) {
      const { rows } = await database.query(
        `UPDATE notification_outbox
          SET status = CASE WHEN attempts + 1 >= $5 THEN 'failed' ELSE 'pending' END,
              attempts = attempts + 1, last_error = $3, next_attempt_at = $4,
              claimed_at = NULL, claim_token = NULL, updated_at = $4
          WHERE id = $1 AND claim_token = $2
          RETURNING ${FIELDS}`,
        [id, claimToken, String(message || 'Pengiriman gagal.').slice(0, 500), retryAt, maxAttempts]
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
