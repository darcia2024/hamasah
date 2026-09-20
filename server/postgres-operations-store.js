// Penyimpanan keuangan, visa, dan inventaris di PostgreSQL.
// Menggantikan penyimpanan berkas JSON yang lama.

const { nextSequence } = require('./document-counters.js');

function toIso(value) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toInvoice(row) {
  return {
    id: row.id,
    number: row.invoice_number,
    studentId: row.student_id,
    description: row.description,
    // BIGINT dibaca sebagai string oleh pg, jadi selalu dibungkus Number().
    amount: Number(row.amount_rupiah),
    status: row.status,
    issuedAt: toIso(row.issued_at),
    paidAt: toIso(row.paid_at),
    receiptNumber: row.receipt_number || null
    ,version: Number(row.version || 1), voidedAt: toIso(row.voided_at), voidReason: row.void_reason || null
  };
}

function toVisa(row) {
  return {
    studentId: row.student_id,
    status: row.status,
    // Tanggal dibaca ::text supaya tidak bergeser sehari karena zona waktu.
    passportExpiresAt: row.passport_expires_at || null,
    visaExpiresAt: row.visa_expires_at || null,
    note: row.note || '',
    updatedAt: toIso(row.updated_at)
  };
}

function toInventory(row) {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    quantity: Number(row.quantity),
    updatedAt: toIso(row.updated_at)
  };
}

const SELECT_INVOICE = `SELECT id, invoice_number, receipt_number, student_id, description, amount_rupiah, status, issued_at, paid_at, version, voided_at, void_reason
                          FROM invoices`;
const SELECT_VISA = `SELECT student_id, status, passport_expires_at::text AS passport_expires_at,
                            visa_expires_at::text AS visa_expires_at, note, updated_at
                       FROM visa_tracking`;
const SELECT_INVENTORY = 'SELECT id, name, location, quantity, updated_at FROM inventory_items';

function createPostgresOperationsStore({ database } = {}) {
  if (!database) {
    throw new Error('createPostgresOperationsStore membutuhkan database.');
  }

  return {
    nextSequence(scope, year) {
      return nextSequence(database, scope, year);
    },

    async getInvoice(id) {
      const { rows } = await database.query(`${SELECT_INVOICE} WHERE id = $1`, [id]);
      return rows[0] ? toInvoice(rows[0]) : null;
    },

    async listInvoices() {
      const { rows } = await database.query(`${SELECT_INVOICE} ORDER BY issued_at DESC`);
      return rows.map(toInvoice);
    },

    async saveInvoice(invoice) {
      const { rows } = await database.query(
        `INSERT INTO invoices (id, invoice_number, receipt_number, student_id, description, amount_rupiah, status, issued_at, paid_at, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
         RETURNING id, invoice_number, receipt_number, student_id, description, amount_rupiah, status, issued_at, paid_at, version, voided_at, void_reason`,
        [
          invoice.id,
          invoice.number,
          invoice.receiptNumber || null,
          invoice.studentId,
          invoice.description,
          invoice.amount,
          invoice.status,
          invoice.issuedAt,
          invoice.paidAt || null
        ]
      );
      return toInvoice(rows[0]);
    },

    async correctInvoice(invoiceId, correction) {
      return database.withTransaction(async (tx) => {
        const { rows } = await tx.query('SELECT description, amount_rupiah, status, version FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
        const invoice = rows[0];
        if (!invoice || invoice.status !== 'unpaid') return null;
        await tx.query(
          `INSERT INTO invoice_corrections (id, invoice_id, actor_account_id, reason, previous_description, previous_amount_rupiah, corrected_description, corrected_amount_rupiah, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [correction.id, invoiceId, correction.actorAccountId || null, correction.reason, invoice.description, invoice.amount_rupiah, correction.description, correction.amount, correction.createdAt]
        );
        const updated = await tx.query(`${SELECT_INVOICE} WHERE id = $1`, [invoiceId]);
        await tx.query('UPDATE invoices SET description = $2, amount_rupiah = $3, version = version + 1 WHERE id = $1', [invoiceId, correction.description, correction.amount]);
        const { rows: after } = await tx.query(`${SELECT_INVOICE} WHERE id = $1`, [invoiceId]);
        return toInvoice(after[0]);
      });
    },

    async voidInvoice(invoiceId, value) {
      const { rows } = await database.query(
        `UPDATE invoices SET status = 'voided', voided_at = $2, void_reason = $3, version = version + 1
           WHERE id = $1 AND status = 'unpaid'
         RETURNING id, invoice_number, receipt_number, student_id, description, amount_rupiah, status, issued_at, paid_at, version, voided_at, void_reason`,
        [invoiceId, value.voidedAt, value.reason]
      );
      return rows[0] ? toInvoice(rows[0]) : null;
    },

    // Nomor kuitansi diambil di dalam transaksi yang sama dengan perubahan status.
    // Kalau invoice ternyata sudah lunas, tidak ada baris yang berubah, transaksi tidak
    // mengambil nomor apa pun, dan penomoran kuitansi tidak berlubang.
    async markInvoicePaid(invoiceId, payment) {
      return database.withTransaction(async (tx) => {
        const klaim = await tx.query(
          `UPDATE invoices SET status = 'paid', paid_at = $2
            WHERE id = $1 AND status = 'unpaid'
            RETURNING id`,
          [invoiceId, payment.paidAt]
        );
        if (klaim.rows.length === 0) {
          return null;
        }
        const sequence = await nextSequence(tx, 'receipt', payment.year);
        const { rows } = await tx.query(
        `UPDATE invoices SET receipt_number = $2 WHERE id = $1
           RETURNING id, invoice_number, receipt_number, student_id, description, amount_rupiah, status, issued_at, paid_at, version, voided_at, void_reason`,
          [invoiceId, payment.receiptNumberFor(sequence)]
        );
        return toInvoice(rows[0]);
      });
    },

    async getVisa(studentId) {
      const { rows } = await database.query(`${SELECT_VISA} WHERE student_id = $1`, [studentId]);
      return rows[0] ? toVisa(rows[0]) : null;
    },

    async listVisas() {
      const { rows } = await database.query(`${SELECT_VISA} ORDER BY updated_at DESC`);
      return rows.map(toVisa);
    },

    async saveVisa(visa) {
      return database.withTransaction(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO visa_tracking (student_id, status, passport_expires_at, visa_expires_at, note, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (student_id) DO UPDATE
           SET status = EXCLUDED.status,
               passport_expires_at = EXCLUDED.passport_expires_at,
               visa_expires_at = EXCLUDED.visa_expires_at,
               note = EXCLUDED.note,
               updated_at = EXCLUDED.updated_at
         RETURNING student_id, status, passport_expires_at::text AS passport_expires_at,
                   visa_expires_at::text AS visa_expires_at, note, updated_at`,
        [visa.studentId, visa.status, visa.passportExpiresAt || null, visa.visaExpiresAt || null, visa.note || null, visa.updatedAt]
      );
      await tx.query(
        `INSERT INTO visa_status_history (id, student_id, status, note, actor_account_id, changed_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [require('node:crypto').randomUUID(), visa.studentId, visa.status, visa.note || null, visa.actorAccountId || null, visa.updatedAt]
      );
      return toVisa(rows[0]);
      });
    },

    async saveVisaDocument(document) {
      const { rows } = await database.query(
        `INSERT INTO visa_documents (id, student_id, file_object_id, document_type, expires_at, note, uploaded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, student_id, file_object_id, document_type, expires_at::text AS expires_at, note, uploaded_at`,
        [document.id, document.studentId, document.fileObjectId, document.documentType, document.expiresAt || null, document.note || null, document.uploadedAt]
      );
      const row = rows[0];
      return { id: row.id, studentId: row.student_id, fileObjectId: row.file_object_id, documentType: row.document_type, expiresAt: row.expires_at || null, note: row.note || '', uploadedAt: toIso(row.uploaded_at) };
    },

    async listInventory() {
      const { rows } = await database.query(`${SELECT_INVENTORY} ORDER BY name ASC`);
      return rows.map(toInventory);
    },

    async saveInventory(item) {
      const { rows } = await database.query(
        `INSERT INTO inventory_items (id, name, location, quantity, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name,
               location = EXCLUDED.location,
               quantity = EXCLUDED.quantity,
               updated_at = EXCLUDED.updated_at
         RETURNING id, name, location, quantity, updated_at, version`,
        [item.id, item.name, item.location, item.quantity, item.updatedAt]
      );
      return toInventory(rows[0]);
    },

    async applyInventoryMovement(itemId, movement) {
      return database.withTransaction(async (tx) => {
        const { rows } = await tx.query('SELECT id, name, location, quantity, updated_at, version FROM inventory_items WHERE id = $1 FOR UPDATE', [itemId]);
        const item = rows[0]; if (!item) return null;
        const delta = movement.direction === 'in' ? movement.quantity : movement.direction === 'out' ? -movement.quantity : movement.delta;
        const next = Number(item.quantity) + delta; if (next < 0) return { error: 'Stok tidak boleh negatif.' };
        await tx.query('UPDATE inventory_items SET quantity = $2, version = version + 1, updated_at = $3 WHERE id = $1', [itemId, next, movement.createdAt]);
        await tx.query('INSERT INTO inventory_movements (id, inventory_item_id, direction, quantity, reason, actor_account_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [movement.id, itemId, movement.direction, movement.quantity, movement.reason, movement.actorAccountId || null, movement.createdAt]);
        return { item: toInventory({ ...item, quantity: next, updated_at: movement.createdAt, version: Number(item.version || 1) + 1 }), movement: { ...movement, inventoryItemId: itemId, delta } };
      });
    },

    async saveImportBatch(batch) {
      const { rows } = await database.query(
        `INSERT INTO operation_import_batches (id, entity, status, row_count, valid_count, errors, rows, actor_account_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)
         RETURNING id, entity, status, row_count, valid_count, errors, rows, actor_account_id, created_at, committed_at, rolled_back_at`,
        [batch.id, batch.entity, batch.status, batch.rowCount, batch.validCount, JSON.stringify(batch.errors), JSON.stringify(batch.rows), batch.actorAccountId || null, batch.createdAt]
      );
      return toImportBatch(rows[0]);
    },

    async getImportBatch(id) {
      const { rows } = await database.query('SELECT id, entity, status, row_count, valid_count, errors, rows, actor_account_id, created_at, committed_at, rolled_back_at FROM operation_import_batches WHERE id = $1', [id]);
      return rows[0] ? toImportBatch(rows[0]) : null;
    },

    async updateImportBatch(id, patch) {
      const fields = [];
      const values = [id];
      if (patch.status) { values.push(patch.status); fields.push(`status = $${values.length}`); }
      if (patch.committedAt) { values.push(patch.committedAt); fields.push(`committed_at = $${values.length}`); }
      if (patch.rolledBackAt) { values.push(patch.rolledBackAt); fields.push(`rolled_back_at = $${values.length}`); }
      if (!fields.length) return this.getImportBatch(id);
      const { rows } = await database.query(`UPDATE operation_import_batches SET ${fields.join(', ')} WHERE id = $1 RETURNING id, entity, status, row_count, valid_count, errors, rows, actor_account_id, created_at, committed_at, rolled_back_at`, values);
      return rows[0] ? toImportBatch(rows[0]) : null;
    }
  };
}

function toImportBatch(row) {
  return {
    id: row.id, entity: row.entity, status: row.status, rowCount: Number(row.row_count), validCount: Number(row.valid_count),
    errors: row.errors || [], rows: row.rows || [], actorAccountId: row.actor_account_id || null,
    createdAt: toIso(row.created_at), committedAt: toIso(row.committed_at), rolledBackAt: toIso(row.rolled_back_at)
  };
}

module.exports = { createPostgresOperationsStore, toImportBatch, toInventory, toInvoice, toVisa };
