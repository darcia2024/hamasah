// Penyimpanan keuangan, visa, dan inventaris di PostgreSQL.
// Menggantikan operations-file-store.js.

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

const SELECT_INVOICE = `SELECT id, invoice_number, receipt_number, student_id, description, amount_rupiah, status, issued_at, paid_at
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
        `INSERT INTO invoices (id, invoice_number, receipt_number, student_id, description, amount_rupiah, status, issued_at, paid_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, invoice_number, receipt_number, student_id, description, amount_rupiah, status, issued_at, paid_at`,
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
           RETURNING id, invoice_number, receipt_number, student_id, description, amount_rupiah, status, issued_at, paid_at`,
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
      const { rows } = await database.query(
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
      return toVisa(rows[0]);
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
         RETURNING id, name, location, quantity, updated_at`,
        [item.id, item.name, item.location, item.quantity, item.updatedAt]
      );
      return toInventory(rows[0]);
    }
  };
}

module.exports = { createPostgresOperationsStore, toInventory, toInvoice, toVisa };
