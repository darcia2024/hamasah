'use strict';

// Kotak pesan satu pintu untuk santri dan wali (item 19). Tiga jenis pesan sengaja dibedakan dan tidak dicampur aturannya:
//   umum       : pengumuman dari admin atau musyrif untuk kelompok penerima tertentu (student-life-service.js).
//   pembinaan  : pesan personal dari musyrif atau petugas kepada santri. Privat: wali hanya melihat yang sengaja dibagikan staf
//                (student-message-service.js, migrasi 065).
//   masukan    : kritik, saran, apresiasi, atau keluhan wali dan balasannya, hanya untuk wali yang mengirimnya
//                (parent-feedback-service.js, migrasi 064).
// Layanan ini hanya merangkum dan menandai dibaca; hak akses tiap jenis tetap ditegakkan lewat kueri di sini yang membatasi
// pada santri milik pembaca. Selama tabel jenis tertentu belum ada, jenis itu tampil kosong dan yang lain tetap jalan.

const JENIS = Object.freeze({ umum: 'Pengumuman', pembinaan: 'Pesan pembinaan', masukan: 'Masukan dan balasan' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABEL_PEMBINAAN = Object.freeze({ evaluasi: 'Evaluasi', pengingat: 'Pengingat', apresiasi: 'Apresiasi', lainnya: 'Pesan' });
const LABEL_MASUKAN = Object.freeze({ kritik: 'Kritik', saran: 'Saran', apresiasi: 'Apresiasi', keluhan: 'Keluhan' });

function tabelBelumAda(error) {
  if (!error) return false;
  if (['42P01', '42703'].includes(error.code)) return true;
  return /(student_personal_messages|parent_feedback|announcement)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : null);
}

function createInboxService({ database, studentLife, now = () => new Date() } = {}) {
  if (!database || !studentLife) throw new Error('createInboxService membutuhkan database dan studentLife.');

  const peran = (actor) => Boolean(actor && ['student', 'parent'].includes(actor.role));
  const TOLAK = { ok: false, status: 403, error: 'Kotak pesan ini untuk santri dan wali.' };

  async function baca(fn, kosong) {
    try { return await fn(); } catch (error) {
      if (tabelBelumAda(error)) return kosong;
      throw error;
    }
  }

  async function anakDari(actor) {
    const { rows } = actor.role === 'student'
      ? await database.query('SELECT id, name FROM students WHERE student_account_id = $1', [actor.id])
      : await database.query('SELECT s.id, s.name FROM students s JOIN student_parent_accounts pa ON pa.student_id = s.id WHERE pa.parent_account_id = $1', [actor.id]);
    return rows;
  }

  async function pesanPembinaan(actor, anak) {
    if (!anak.length) return [];
    const rows = await baca(async () => (await database.query(
      `SELECT m.id, m.student_id, m.kind, m.subject, m.body, m.read_at, m.created_at, a.name AS author
         FROM student_personal_messages m LEFT JOIN accounts a ON a.id = m.author_account_id
        WHERE m.student_id = ANY($1::uuid[]) AND ($2::boolean OR m.shared_with_parent)
        ORDER BY m.created_at DESC LIMIT 50`, [anak.map((s) => s.id), actor.role === 'student']
    )).rows, []);
    return rows.map((m) => ({
      id: m.id, kind: 'pembinaan', kindLabel: JENIS.pembinaan, subKind: LABEL_PEMBINAAN[m.kind] || 'Pesan', title: m.subject, body: m.body,
      from: m.author || 'Staf Hamasah', studentName: actor.role === 'parent' ? (anak.find((s) => s.id === m.student_id) || {}).name || null : null,
      at: iso(m.created_at),
      // Wali melihat pesan yang dibagikan sebagai informasi; status baca hanya milik santri.
      read: actor.role === 'student' ? Boolean(m.read_at) : true
    }));
  }

  async function masukanWali(actor) {
    if (actor.role !== 'parent') return [];
    let rows;
    try {
      rows = (await database.query(
        `SELECT f.id, f.kind, f.subject, f.status, f.reply, f.handled_at, f.created_at, f.reply_read_at, a.name AS handler
           FROM parent_feedback f LEFT JOIN accounts a ON a.id = f.handled_by_account_id WHERE f.parent_account_id = $1 ORDER BY f.created_at DESC LIMIT 30`, [actor.id]
      )).rows;
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      // Migrasi 078 belum ada: balasan tetap tampil, status baca tidak dilacak.
      rows = await baca(async () => (await database.query(
        `SELECT f.id, f.kind, f.subject, f.status, f.reply, f.handled_at, f.created_at, a.name AS handler
           FROM parent_feedback f LEFT JOIN accounts a ON a.id = f.handled_by_account_id WHERE f.parent_account_id = $1 ORDER BY f.created_at DESC LIMIT 30`, [actor.id]
      )).rows.map((r) => ({ ...r, reply_read_at: r.handled_at })), []);
    }
    return rows.map((f) => ({
      id: f.id, kind: 'masukan', kindLabel: JENIS.masukan, subKind: LABEL_MASUKAN[f.kind] || 'Masukan', title: f.subject,
      body: f.reply ? `Balasan: ${f.reply}` : (f.status === 'dibaca' ? 'Masukan Anda sudah dibaca. Menunggu tindak lanjut.' : 'Masukan Anda sudah diterima. Menunggu dibaca.'),
      from: f.reply ? (f.handler || 'Admin Hamasah') : 'Anda', at: iso(f.reply ? (f.handled_at || f.created_at) : f.created_at), status: f.status,
      // Hanya balasan yang bisa "belum dibaca"; masukan tanpa balasan tidak mengundang tindakan wali.
      read: !f.reply || Boolean(f.reply_read_at)
    }));
  }

  async function inboxFor(actor, { limit = 40 } = {}) {
    // Admin memegang semua izin baca tetapi tidak punya ananda: kotaknya kosong.
    if (actor && actor.role === 'admin') return { ok: true, value: { unread: { total: 0, umum: 0, pembinaan: 0, masukan: 0 }, kinds: [], items: [] } };
    if (!peran(actor)) return TOLAK;
    const anak = await anakDari(actor);
    const umum = await studentLife.announcementsFor(actor, { limit: 50 });
    const pengumuman = (umum.ok ? umum.value.items : []).map((a) => ({
      id: a.id, kind: 'umum', kindLabel: JENIS.umum, subKind: a.target ? a.target.label : 'Pengumuman', title: a.title, body: a.body, from: a.author || 'Admin Hamasah', at: a.createdAt, read: a.read
    }));
    const semua = [...pengumuman, ...(await pesanPembinaan(actor, anak)), ...(await masukanWali(actor))]
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const hitung = (jenis) => semua.filter((i) => i.kind === jenis && !i.read).length;
    const batas = Math.min(Math.max(Number(limit) || 40, 1), 100);
    return {
      ok: true,
      value: {
        unread: { total: semua.filter((i) => !i.read).length, umum: hitung('umum'), pembinaan: hitung('pembinaan'), masukan: hitung('masukan') },
        kinds: Object.entries(JENIS).map(([id, label]) => ({ id, label })).filter((k) => k.id !== 'masukan' || actor.role === 'parent'),
        items: semua.slice(0, batas)
      }
    };
  }

  // Menandai dibaca: tiap jenis dengan aturannya sendiri. Hanya penerima yang sah yang bisa menandai.
  async function markRead(kind, id, actor) {
    if (actor && actor.role === 'admin') return { ok: false, status: 404, error: 'Pesan tidak ditemukan.' };
    if (!peran(actor)) return TOLAK;
    if (!JENIS[kind] || !UUID.test(String(id))) return { ok: false, status: 404, error: 'Pesan tidak ditemukan.' };
    if (kind === 'umum') return studentLife.markAnnouncementRead(id, actor);
    if (kind === 'pembinaan') {
      if (actor.role !== 'student') return { ok: true, value: { id, read: true } };
      const anak = (await anakDari(actor)).map((s) => s.id);
      return baca(async () => {
        const { rowCount } = await database.query('UPDATE student_personal_messages SET read_at = COALESCE(read_at, $3) WHERE id = $1 AND student_id = ANY($2::uuid[])', [id, anak, now()]);
        return rowCount ? { ok: true, value: { id, read: true } } : { ok: false, status: 404, error: 'Pesan tidak ditemukan.' };
      }, { ok: false, status: 409, error: 'Database belum diperbarui untuk pesan pembinaan.' });
    }
    if (actor.role !== 'parent') return { ok: false, status: 404, error: 'Pesan tidak ditemukan.' };
    return baca(async () => {
      const { rowCount } = await database.query('UPDATE parent_feedback SET reply_read_at = COALESCE(reply_read_at, $3) WHERE id = $1 AND parent_account_id = $2 AND reply IS NOT NULL', [id, actor.id, now()]);
      return rowCount ? { ok: true, value: { id, read: true } } : { ok: false, status: 404, error: 'Balasan tidak ditemukan.' };
    }, { ok: false, status: 409, error: 'Database belum diperbarui untuk status baca balasan.' });
  }

  async function markAllRead(actor) {
    if (actor && actor.role === 'admin') return { ok: true, value: { marked: 0 } };
    if (!peran(actor)) return TOLAK;
    const isi = await inboxFor(actor, { limit: 100 });
    let ditandai = 0;
    for (const item of isi.value.items.filter((i) => !i.read)) {
      const hasil = await markRead(item.kind, item.id, actor);
      if (hasil.ok) ditandai += 1;
    }
    return { ok: true, value: { marked: ditandai } };
  }

  return { inboxFor, markRead, markAllRead };
}

module.exports = { createInboxService, JENIS };
