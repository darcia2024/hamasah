'use strict';

const crypto = require('node:crypto');

// Pesan personal dari musyrif atau petugas berwenang kepada santri (migrasi 065), dan pengaturan catatan
// pembinaan yang boleh dilihat santri.
//
// ATURAN PRIVASI. Ini aturan data, bukan sekadar elemen tampilan yang disembunyikan:
//   - Pesan personal hanya terbaca oleh santri penerimanya dan staf yang berhak atas santri itu
//     (admin; musyrif asrama santri itu). Pesan tidak masuk ke dashboard, laporan, rapor, atau profil.
//   - Wali TIDAK PERNAH menerima pesan otomatis. Wali hanya membaca pesan yang secara sengaja dibagikan
//     staf (shared_with_parent). Pembagian mencatat siapa dan kapan, dan hanya staf yang boleh
//     membagikan atau menarik kembali. Santri dan wali tidak bisa membagikan.
//   - Catatan evaluasi tampil ke santri kecuali ditandai disembunyikan; catatan disiplin disembunyikan
//     dari santri kecuali staf menandainya boleh tampil.
// Selama tabel belum ada, pembacaan kosong dengan available: false dan penulisan ditolak dengan arahan
// ke halaman Pengaturan.

const JENIS = Object.freeze({ evaluasi: 'Evaluasi', pengingat: 'Pengingat', apresiasi: 'Apresiasi', lainnya: 'Pesan' });
const KOLEKSI_CATATAN = Object.freeze(['evaluations', 'violations']);
const MAKS_PER_HARI = 20;
const HARI_MS = 24 * 60 * 60 * 1000;
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk fitur ini. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';

function tabelBelumAda(error) {
  if (!error) return false;
  if (['42P01', '42703'].includes(error.code)) return true;
  return /(student_personal_messages|student_note_visibility)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rapi(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : null);
}

function createStudentMessageService({ database, accessFor, now = () => new Date() } = {}) {
  if (!database || typeof accessFor !== 'function') throw new Error('createStudentMessageService membutuhkan database dan accessFor.');

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

  const staf = (actor) => Boolean(actor && ['admin', 'supervisor'].includes(actor.role));

  async function akses(studentId, actor, perlu) {
    if (!actor) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
    const hasil = await accessFor(studentId, actor);
    if (!hasil.exists) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    if (!hasil[perlu]) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
    return { ok: true };
  }

  function bentuk(row, peran) {
    const dasar = {
      id: row.id, studentId: row.student_id, kind: row.kind, kindLabel: JENIS[row.kind], subject: row.subject, body: row.body,
      createdAt: iso(row.created_at), authorName: row.author_name || null
    };
    if (peran === 'parent') return { ...dasar, sharedAt: iso(row.shared_at) };
    return {
      ...dasar, readAt: iso(row.read_at), sharedWithParent: Boolean(row.shared_with_parent), sharedAt: iso(row.shared_at), sharedBy: row.shared_by || null,
      ...(peran === 'staff' ? { studentName: row.student_name || null } : {})
    };
  }

  const SELECT = `SELECT m.*, a.name AS author_name, sb.name AS shared_by, s.name AS student_name
      FROM student_personal_messages m
      JOIN students s ON s.id = m.student_id
      LEFT JOIN accounts a ON a.id = m.author_account_id
      LEFT JOIN accounts sb ON sb.id = m.shared_by_account_id`;

  async function send(studentId, input, actor) {
    if (!staf(actor)) return { ok: false, status: 403, error: 'Pesan personal dikirim oleh musyrif atau admin.' };
    const izin = await akses(studentId, actor, 'write');
    if (!izin.ok) return izin;
    const sumber = input || {};
    const kind = String(sumber.kind || 'lainnya');
    if (!JENIS[kind]) return { ok: false, error: 'Jenis pesan tidak dikenal.' };
    const subject = rapi(sumber.subject).replace(/\n/g, ' ');
    const body = rapi(sumber.body);
    if (subject.length < 3 || subject.length > 120) return { ok: false, error: 'Judul 3 sampai 120 karakter.' };
    if (body.length < 5 || body.length > 2000) return { ok: false, error: 'Isi pesan 5 sampai 2000 karakter.' };
    return tulis(async () => {
      const { rows: hitung } = await database.query(
        'SELECT count(*)::int AS jumlah FROM student_personal_messages WHERE author_account_id = $1 AND created_at > $2',
        [actor.id, new Date(now().getTime() - HARI_MS)]
      );
      if (hitung[0].jumlah >= MAKS_PER_HARI) return { ok: false, status: 429, error: `Paling banyak ${MAKS_PER_HARI} pesan personal sehari.` };
      const id = crypto.randomUUID();
      // Pesan baru selalu privat: tidak ada cara membagikannya ke wali saat membuat.
      await database.query(
        'INSERT INTO student_personal_messages (id, student_id, author_account_id, kind, subject, body, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, studentId, actor.id, kind, subject, body, now()]
      );
      const { rows } = await database.query(`${SELECT} WHERE m.id = $1`, [id]);
      return { ok: true, value: bentuk(rows[0], 'staff') };
    });
  }

  // Santri: pesan untuk dirinya. Staf berhak: semua pesan santri itu. Wali: hanya yang dibagikan.
  async function list(studentId, actor) {
    if (!actor) return { ok: false, status: 403, error: 'Akses ditolak.' };
    const izin = await akses(studentId, actor, 'view');
    if (!izin.ok) return izin;
    const peran = actor.role === 'parent' ? 'parent' : actor.role === 'student' ? 'student' : 'staff';
    const hasil = await baca(async () => ({
      available: true,
      rows: (await database.query(
        `${SELECT} WHERE m.student_id = $1 AND ($2::boolean OR m.shared_with_parent) ORDER BY m.created_at DESC LIMIT 50`,
        [studentId, peran !== 'parent']
      )).rows
    }), { available: false, rows: [] });
    const items = hasil.rows.map((row) => bentuk(row, peran));
    return { ok: true, value: { available: hasil.available, items, unread: peran === 'student' ? items.filter((m) => !m.readAt).length : undefined, kinds: Object.entries(JENIS).map(([id, label]) => ({ id, label })) } };
  }

  async function ambilPesan(id) {
    if (!UUID.test(String(id))) return null;
    const { rows } = await database.query(`${SELECT} WHERE m.id = $1`, [id]);
    return rows[0] || null;
  }

  // Hanya santri penerima yang menandai pesannya sudah dibaca.
  async function markRead(id, actor) {
    if (!actor || actor.role !== 'student') return { ok: false, status: 403, error: 'Hanya santri penerima yang menandai pesan dibaca.' };
    return tulis(async () => {
      const row = await ambilPesan(id);
      if (!row) return { ok: false, status: 404, error: 'Pesan tidak ditemukan.' };
      const izin = await akses(row.student_id, actor, 'view');
      if (!izin.ok) return { ok: false, status: 404, error: 'Pesan tidak ditemukan.' };
      if (!row.read_at) await database.query('UPDATE student_personal_messages SET read_at = $2 WHERE id = $1 AND read_at IS NULL', [id, now()]);
      return { ok: true, value: bentuk(await ambilPesan(id), 'student') };
    });
  }

  // Staf membagikan satu pesan ke wali (atau menariknya kembali). Tidak pernah otomatis.
  async function share(id, input, actor) {
    if (!staf(actor)) return { ok: false, status: 403, error: 'Hanya musyrif atau admin yang membagikan pesan ke wali.' };
    const bagikan = Boolean(input && input.shared);
    return tulis(async () => {
      const row = await ambilPesan(id);
      if (!row) return { ok: false, status: 404, error: 'Pesan tidak ditemukan.' };
      const izin = await akses(row.student_id, actor, 'write');
      if (!izin.ok) return { ok: false, status: 404, error: 'Pesan tidak ditemukan.' };
      await database.query(
        'UPDATE student_personal_messages SET shared_with_parent = $2, shared_by_account_id = $3, shared_at = $4 WHERE id = $1',
        [id, bagikan, bagikan ? actor.id : null, bagikan ? now() : null]
      );
      return { ok: true, value: bentuk(await ambilPesan(id), 'staff') };
    });
  }

  // Peta kunci "koleksi:id" -> boleh tampil ke santri, hanya berisi yang diatur staf.
  async function visibilityOf(studentId) {
    return baca(async () => {
      const { rows } = await database.query('SELECT record_type, record_id, student_visible FROM student_note_visibility WHERE student_id = $1', [studentId]);
      return new Map(rows.map((row) => [`${row.record_type}:${row.record_id}`, Boolean(row.student_visible)]));
    }, new Map());
  }

  async function setNoteVisibility(studentId, koleksi, recordId, input, actor) {
    if (!staf(actor)) return { ok: false, status: 403, error: 'Hanya musyrif atau admin yang mengatur ini.' };
    if (!KOLEKSI_CATATAN.includes(koleksi)) return { ok: false, error: 'Hanya catatan evaluasi dan disiplin yang bisa diatur.' };
    if (!input || typeof input.studentVisible !== 'boolean') return { ok: false, error: 'studentVisible harus true atau false.' };
    const izin = await akses(studentId, actor, 'write');
    if (!izin.ok) return izin;
    if (!UUID.test(String(recordId))) return { ok: false, status: 404, error: 'Catatan tidak ditemukan.' };
    const tabel = koleksi === 'evaluations' ? 'student_evaluations' : 'student_violations';
    return tulis(async () => {
      const { rows } = await database.query(`SELECT id FROM ${tabel} WHERE id = $1 AND student_id = $2`, [recordId, studentId]);
      if (!rows.length) return { ok: false, status: 404, error: 'Catatan tidak ditemukan.' };
      await database.query(
        `INSERT INTO student_note_visibility (record_type, record_id, student_id, student_visible, set_by_account_id, set_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (record_type, record_id) DO UPDATE SET student_visible = EXCLUDED.student_visible, set_by_account_id = EXCLUDED.set_by_account_id, set_at = EXCLUDED.set_at`,
        [koleksi, recordId, studentId, input.studentVisible, actor.id || null, now()]
      );
      return { ok: true, value: { recordId, collection: koleksi, studentVisible: input.studentVisible } };
    });
  }

  return { send, list, markRead, share, visibilityOf, setNoteVisibility };
}

module.exports = { createStudentMessageService, JENIS };
