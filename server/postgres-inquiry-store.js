'use strict';
// Penyimpanan pesan konsultasi dari formulir publik (Task R1.6).
//
// Daftar dibuat berpaginasi sejak awal. Temuan E-02 pada audit 20 September 2026
// mencatat bahwa sebagian besar store lama mengembalikan seluruh baris, sehingga
// bebannya tumbuh mengikuti jumlah data. Jangan menambahkan jalur "ambil semua".

const crypto = require('node:crypto');

const TOPICS = Object.freeze(['kuliah', 'mahad', 'courses', 'biaya', 'asrama', 'lainnya']);
const STATUSES = Object.freeze(['new', 'contacted', 'closed']);
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const TOPIC_LABELS = Object.freeze({
  kuliah: 'Pendaftaran Kuliah S1 Al-Azhar',
  mahad: "Pendaftaran Ma'had Al-Azhar Formal",
  courses: 'Hamasah Courses (Bahasa Arab Online)',
  biaya: 'Biaya dan skema pembayaran',
  asrama: 'Asrama dan kehidupan Kairo',
  lainnya: 'Pertanyaan lainnya'
});

function cleanString(value) {
  return String(value ?? '').trim();
}

// Sama dengan aturan di registration-domain.js supaya nomor tersimpan dalam satu bentuk.
function normalizePhone(value) {
  const compact = cleanString(value).replace(/[\s().-]/g, '');
  if (!compact) return '';
  if (compact.startsWith('+62')) return compact;
  if (compact.startsWith('62')) return `+${compact}`;
  if (compact.startsWith('0')) return `+62${compact.slice(1)}`;
  return compact;
}

function isPhoneValid(value) {
  return /^\+?[1-9]\d{7,14}$/.test(value);
}

function toInquiry(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone_e164,
    topic: row.topic,
    topicLabel: TOPIC_LABELS[row.topic] || row.topic,
    message: row.message,
    status: row.status,
    handledByAccountId: row.handled_by_account_id || null,
    handledAt: row.handled_at ? new Date(row.handled_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString()
  };
}

function validate(input) {
  const name = cleanString(input.name);
  const phone = normalizePhone(input.phone);
  const topic = cleanString(input.topic).toLocaleLowerCase('en-US');
  const message = cleanString(input.message);

  if (name.length < 2 || name.length > 120) {
    return { ok: false, field: 'name', error: 'Nama lengkap minimal 2 karakter.' };
  }
  if (!isPhoneValid(phone)) {
    return { ok: false, field: 'phone', error: 'Nomor WhatsApp belum valid. Contoh: 0812xxxxxxxx.' };
  }
  if (!TOPICS.includes(topic)) {
    return { ok: false, field: 'topic', error: 'Pilih salah satu topik yang tersedia.' };
  }
  if (message.length < 10) {
    return { ok: false, field: 'message', error: 'Tuliskan pertanyaan minimal 10 karakter agar dapat kami tindak lanjuti.' };
  }
  if (message.length > 2000) {
    return { ok: false, field: 'message', error: 'Pertanyaan maksimal 2000 karakter.' };
  }
  return { ok: true, value: { name, phone, topic, message } };
}

function createPostgresInquiryStore({ database } = {}) {
  if (!database) {
    throw new Error('createPostgresInquiryStore membutuhkan database.');
  }

  return {
    TOPICS,
    STATUSES,

    async create(input, createdAt = new Date().toISOString()) {
      const valid = validate(input || {});
      if (!valid.ok) return valid;

      const { rows } = await database.query(
        `INSERT INTO inquiries (id, name, phone_e164, topic, message, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'new', $6)
         RETURNING id, name, phone_e164, topic, message, status, handled_by_account_id, handled_at, created_at`,
        [crypto.randomUUID(), valid.value.name, valid.value.phone, valid.value.topic, valid.value.message, createdAt]
      );
      return { ok: true, value: toInquiry(rows[0]) };
    },

    async list({ status, page, pageSize } = {}) {
      const halaman = Math.max(1, Number(page) || 1);
      const ukuran = Math.min(Math.max(Number(pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
      const nilai = [];
      let kondisi = '';
      if (status && STATUSES.includes(status)) {
        nilai.push(status);
        kondisi = `WHERE status = $${nilai.length}`;
      }

      const total = await database.query(`SELECT count(*)::int AS jumlah FROM inquiries ${kondisi}`, nilai);
      const { rows } = await database.query(
        `SELECT id, name, phone_e164, topic, message, status, handled_by_account_id, handled_at, created_at
         FROM inquiries ${kondisi}
         ORDER BY created_at DESC
         LIMIT $${nilai.length + 1} OFFSET $${nilai.length + 2}`,
        [...nilai, ukuran, (halaman - 1) * ukuran]
      );

      return {
        items: rows.map(toInquiry),
        total: total.rows[0].jumlah,
        page: halaman,
        pageSize: ukuran
      };
    },

    async updateStatus(id, status, actorAccountId, changedAt = new Date().toISOString()) {
      if (!STATUSES.includes(status)) {
        return { ok: false, error: 'Status pesan tidak dikenal.' };
      }
      const selesai = status === 'new' ? null : changedAt;
      const { rows } = await database.query(
        `UPDATE inquiries
         SET status = $2, handled_by_account_id = $3, handled_at = $4
         WHERE id = $1
         RETURNING id, name, phone_e164, topic, message, status, handled_by_account_id, handled_at, created_at`,
        [id, status, status === 'new' ? null : actorAccountId || null, selesai]
      );
      if (!rows[0]) return { ok: false, status: 404, error: 'Pesan konsultasi tidak ditemukan.' };
      return { ok: true, value: toInquiry(rows[0]) };
    }
  };
}

module.exports = { STATUSES, TOPICS, TOPIC_LABELS, createPostgresInquiryStore, normalizePhone, validate };
