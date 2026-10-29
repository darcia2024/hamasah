'use strict';

const crypto = require('node:crypto');

// Kritik, saran, apresiasi, dan keluhan dari wali (migrasi 064).
//   - Wali menulis dan hanya melihat kirimannya sendiri beserta status dan balasannya.
//   - Keluhan privat: hanya admin yang membaca dan membalas.
//   - Kritik, saran, dan apresiasi dibaca admin; musyrif hanya yang menyebut ananda di asrama yang dipegangnya.
// Selama tabel belum ada, pembacaan kosong dengan tersedia: false dan pengiriman ditolak dengan arahan
// ke halaman Pengaturan.

const JENIS = Object.freeze({ kritik: 'Kritik', saran: 'Saran', apresiasi: 'Apresiasi', keluhan: 'Keluhan (privat)' });
const STATUS = Object.freeze({ baru: 'Baru', dibaca: 'Sudah dibaca', ditindaklanjuti: 'Sudah ditindaklanjuti' });
const MAKS_PER_HARI = 5;
const HARI_MS = 24 * 60 * 60 * 1000;
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk fitur ini. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';

function tabelBelumAda(error) {
  if (!error) return false;
  if (['42P01', '42703'].includes(error.code)) return true;
  return /parent_feedback/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function rapi(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : null);
}

function createParentFeedbackService({ database, accessFor, staffDormitories, now = () => new Date() } = {}) {
  if (!database || typeof accessFor !== 'function' || typeof staffDormitories !== 'function') {
    throw new Error('createParentFeedbackService membutuhkan database, accessFor, dan staffDormitories.');
  }

  async function baca(fn, kosong) {
    try { return await fn(); } catch (error) {
      if (tabelBelumAda(error)) return kosong;
      throw error;
    }
  }

  async function tulis(fn) {
    try { return await fn(); } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  const opsi = {
    kinds: Object.entries(JENIS).map(([id, label]) => ({ id, label })),
    statuses: Object.entries(STATUS).map(([id, label]) => ({ id, label }))
  };

  function bentuk(row, { staf = false } = {}) {
    return {
      id: row.id, kind: row.kind, kindLabel: JENIS[row.kind], private: row.kind === 'keluhan',
      subject: row.subject, body: row.body,
      studentId: row.student_id || null, studentName: row.student_name || null, dormitoryName: row.dormitory_name || null,
      status: row.status, statusLabel: STATUS[row.status], reply: row.reply || '', handledBy: row.handled_by || null,
      handledAt: iso(row.handled_at), createdAt: iso(row.created_at),
      ...(staf ? { parentName: row.parent_name || null, verified: Boolean(row.verified_at), verificationNote: row.verification_note || '', kpiAccountId: row.kpi_account_id || null } : {})
    };
  }

  const SELECT = `SELECT f.*, s.name AS student_name, d.name AS dormitory_name, p.name AS parent_name, h.name AS handled_by
      FROM parent_feedback f
      LEFT JOIN students s ON s.id = f.student_id
      LEFT JOIN dormitories d ON d.id = s.dormitory_id
      LEFT JOIN accounts p ON p.id = f.parent_account_id
      LEFT JOIN accounts h ON h.id = f.handled_by_account_id`;

  async function send(input, actor) {
    if (!actor || actor.role !== 'parent') return { ok: false, status: 403, error: 'Formulir ini untuk wali santri.' };
    const sumber = input || {};
    const kind = String(sumber.kind || '');
    if (!JENIS[kind]) return { ok: false, error: 'Pilih jenis masukan: kritik, saran, apresiasi, atau keluhan.' };
    const subject = rapi(sumber.subject).replace(/\n/g, ' ');
    const body = rapi(sumber.body);
    if (subject.length < 3 || subject.length > 120) return { ok: false, error: 'Judul 3 sampai 120 karakter.' };
    if (body.length < 10 || body.length > 2000) return { ok: false, error: 'Isi masukan 10 sampai 2000 karakter.' };
    const studentId = sumber.studentId ? String(sumber.studentId) : null;
    if (studentId) {
      const akses = await accessFor(studentId, actor);
      if (!akses.exists || !akses.view) return { ok: false, status: 403, error: 'Ananda ini tidak terhubung dengan akun Anda.' };
    }
    return tulis(async () => {
      const { rows: hitung } = await database.query(
        'SELECT count(*)::int AS jumlah FROM parent_feedback WHERE parent_account_id = $1 AND created_at > $2',
        [actor.id, new Date(now().getTime() - HARI_MS)]
      );
      if (hitung[0].jumlah >= MAKS_PER_HARI) {
        return { ok: false, status: 429, error: `Paling banyak ${MAKS_PER_HARI} masukan sehari. Coba lagi besok.` };
      }
      const id = crypto.randomUUID();
      await database.query(
        'INSERT INTO parent_feedback (id, parent_account_id, student_id, kind, subject, body, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, actor.id, studentId, kind, subject, body, now()]
      );
      const { rows } = await database.query(`${SELECT} WHERE f.id = $1`, [id]);
      return { ok: true, value: bentuk(rows[0]) };
    });
  }

  async function mine(actor) {
    if (!actor || actor.role !== 'parent') return { ok: false, status: 403, error: 'Formulir ini untuk wali santri.' };
    const hasil = await baca(async () => ({
      tersedia: true,
      rows: (await database.query(`${SELECT} WHERE f.parent_account_id = $1 ORDER BY f.created_at DESC LIMIT 30`, [actor.id])).rows
    }), { tersedia: false, rows: [] });
    return { ok: true, value: { available: hasil.tersedia, items: hasil.rows.map((row) => bentuk(row)), options: opsi } };
  }

  // Cakupan staf: admin semua; musyrif hanya yang bukan keluhan dan menyebut santri di asramanya.
  async function cakupan(actor) {
    if (actor.role === 'admin') return { semua: true, asrama: null };
    return { semua: false, asrama: await staffDormitories(actor.id) };
  }

  async function inbox(actor, statusInput) {
    if (!actor || !['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif.' };
    const status = String(statusInput || 'terbuka');
    if (!['terbuka', 'semua'].includes(status)) return { ok: false, error: 'Status tidak dikenal.' };
    const { semua, asrama } = await cakupan(actor);
    const hasil = await baca(async () => ({
      tersedia: true,
      rows: (await database.query(
        `${SELECT}
          WHERE ($1::text = 'semua' OR f.status <> 'ditindaklanjuti')
            AND ($2::boolean OR (f.kind <> 'keluhan' AND s.dormitory_id = ANY($3::uuid[])))
          ORDER BY f.created_at DESC LIMIT 100`,
        [status, semua, asrama || []]
      )).rows
    }), { tersedia: false, rows: [] });
    return { ok: true, value: { available: hasil.tersedia, items: hasil.rows.map((row) => bentuk(row, { staf: true })), options: opsi } };
  }

  async function handle(id, input, actor) {
    if (!actor || !['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif.' };
    const sumber = input || {};
    const status = String(sumber.status || '');
    if (!['dibaca', 'ditindaklanjuti'].includes(status)) return { ok: false, error: 'Status harus dibaca atau ditindaklanjuti.' };
    const balasan = sumber.reply === undefined ? undefined : rapi(sumber.reply);
    if (balasan !== undefined && balasan !== '' && (balasan.length < 2 || balasan.length > 1000)) return { ok: false, error: 'Balasan 2 sampai 1000 karakter.' };
    return tulis(async () => {
      const { rows } = await database.query(`${SELECT} WHERE f.id = $1`, [id]);
      const lama = rows[0];
      if (!lama) return { ok: false, status: 404, error: 'Masukan tidak ditemukan.' };
      if (actor.role === 'supervisor') {
        const asrama = await staffDormitories(actor.id);
        const dalam = lama.kind !== 'keluhan' && Boolean(lama.student_id)
          && (await database.query('SELECT dormitory_id FROM students WHERE id = $1', [lama.student_id])).rows.some((r) => asrama.includes(r.dormitory_id));
        if (!dalam) return { ok: false, status: 404, error: 'Masukan tidak ditemukan.' };
      }
      await database.query(
        `UPDATE parent_feedback SET status = $2, reply = COALESCE($3, reply), handled_by_account_id = $4, handled_at = $5 WHERE id = $1`,
        [id, status, balasan ? balasan : null, actor.id || null, now()]
      );
      // Balasan baru dihitung belum dibaca wali (kotak pesan). Kolomnya dari migrasi 078; sebelum itu dilewati.
      if (balasan) await database.query('UPDATE parent_feedback SET reply_read_at = NULL WHERE id = $1', [id]).catch((error) => { if (error.code !== '42703') throw error; });
      const { rows: akhir } = await database.query(`${SELECT} WHERE f.id = $1`, [id]);
      return { ok: true, value: bentuk(akhir[0], { staf: true }) };
    });
  }

  // Verifikasi keluhan untuk KPI. Hanya admin; keluhan yang belum diverifikasi tidak pernah memengaruhi KPI siapa pun.
  // kpiAccountId (opsional) menautkan keluhan ke musyrif tertentu; tanpa tautan, verifikasi tidak memengaruhi KPI.
  async function verify(id, input, actor) {
    if (!actor || actor.role !== 'admin') return { ok: false, status: 403, error: 'Hanya admin yang memverifikasi keluhan.' };
    const sumber = input || {};
    const catatan = rapi(sumber.note);
    if (catatan.length < 5) return { ok: false, error: 'Tulis catatan verifikasi (minimal 5 karakter): apa yang sudah dicek.' };
    return tulis(async () => {
      const { rows } = await database.query('SELECT id, kind FROM parent_feedback WHERE id = $1', [/^[0-9a-f-]{36}$/i.test(String(id)) ? id : null]);
      if (!rows.length) return { ok: false, status: 404, error: 'Masukan tidak ditemukan.' };
      if (rows[0].kind !== 'keluhan') return { ok: false, error: 'Hanya keluhan yang diverifikasi untuk KPI.' };
      let kpiAkun = null;
      if (sumber.kpiAccountId) {
        const akun = (await database.query(`SELECT id FROM accounts WHERE id = $1 AND role = 'supervisor' AND active`, [/^[0-9a-f-]{36}$/i.test(String(sumber.kpiAccountId)) ? sumber.kpiAccountId : null])).rows[0];
        if (!akun) return { ok: false, error: 'Musyrif yang dituju tidak ditemukan.' };
        kpiAkun = akun.id;
      }
      await database.query('UPDATE parent_feedback SET verified_at = $2, verified_by_account_id = $3, verification_note = $4, kpi_account_id = $5 WHERE id = $1', [id, now(), actor.id || null, catatan, kpiAkun]);
      const { rows: akhir } = await database.query(`${SELECT} WHERE f.id = $1`, [id]);
      return { ok: true, value: bentuk(akhir[0], { staf: true }) };
    });
  }

  return { send, mine, inbox, handle, verify };
}

module.exports = { createParentFeedbackService, JENIS, STATUS };
