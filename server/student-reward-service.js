'use strict';

const crypto = require('node:crypto');

// Hadiah dan apresiasi santri berprestasi (migrasi 084).
//
// Wujud hadiah ditetapkan langsung oleh Direktur Asrama dan harus mendidik (dokumen "Follow up Website"), jadi jenisnya dibatasi dan
// yang mencatat hanya akun admin. Musyrif membaca santri asramanya, wali dan santri membaca milik sendiri. Catatan tidak dihapus:
// pembatalan menyimpan alasan, dan keluarga hanya melihat yang masih berlaku.

const JENIS = Object.freeze({
  buku: 'Buku bacaan atau kitab referensi',
  piagam: 'Piagam penghargaan',
  fasilitas: 'Fasilitas penunjang pengembangan diri',
  lainnya: 'Apresiasi mendidik lainnya'
});
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk hadiah santri. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tabelBelumAda(error) {
  if (!error) return false;
  return error.code === '42P01' || (/student_rewards/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || '')));
}

function rapi(value, maks) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maks);
}

function tanggalValid(teks) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(teks || ''))) return false;
  const d = new Date(`${teks}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === teks;
}

function createStudentRewardService({ database, accessFor, staffDormitories, now = () => new Date() } = {}) {
  if (!database || typeof accessFor !== 'function' || typeof staffDormitories !== 'function') throw new Error('createStudentRewardService membutuhkan database, accessFor, dan staffDormitories.');

  const SELECT = `SELECT r.*, to_char(r.awarded_on, 'YYYY-MM-DD') AS awarded_on_text, s.name AS student_name, d.name AS dormitory_name, a.name AS created_by
      FROM student_rewards r JOIN students s ON s.id = r.student_id LEFT JOIN dormitories d ON d.id = s.dormitory_id LEFT JOIN accounts a ON a.id = r.created_by_account_id`;
  const hariIni = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now());
  const staf = (actor) => Boolean(actor && ['admin', 'supervisor'].includes(actor.role));

  function bentuk(r, { internal }) {
    const dasar = { id: r.id, studentId: r.student_id, studentName: r.student_name, kind: r.kind, kindLabel: JENIS[r.kind], title: r.title, reason: r.reason || '', awardedOn: r.awarded_on_text };
    if (!internal) return dasar;
    return { ...dasar, dormitoryName: r.dormitory_name || null, createdBy: r.created_by || null, voided: Boolean(r.voided_at), voidReason: r.void_reason || '' };
  }

  async function tulis(fn) {
    try { return await fn(); } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  // Daftar lintas santri untuk layar kerja: admin semua, musyrif santri di asrama yang dipegangnya.
  async function list(actor) {
    if (!staf(actor)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif.' };
    const batas = actor.role === 'admin' ? null : (await staffDormitories(actor.id)) || [];
    const kinds = Object.entries(JENIS).map(([id, label]) => ({ id, label }));
    try {
      const { rows } = await database.query(`${SELECT} WHERE ($1::uuid[] IS NULL OR s.dormitory_id = ANY($1::uuid[])) ORDER BY r.awarded_on DESC, r.created_at DESC LIMIT 200`, [batas]);
      return { ok: true, value: { available: true, items: rows.map((r) => bentuk(r, { internal: true })), kinds, canManage: actor.role === 'admin' } };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { ok: true, value: { available: false, items: [], kinds, canManage: actor.role === 'admin' } };
    }
  }

  async function forStudent(studentId, actor) {
    if (!actor || !UUID.test(String(studentId))) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    const akses = await accessFor(studentId, actor);
    if (!akses.exists) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    if (!akses.view) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
    try {
      const { rows } = await database.query(`${SELECT} WHERE r.student_id = $1 AND r.voided_at IS NULL ORDER BY r.awarded_on DESC, r.created_at DESC LIMIT 50`, [studentId]);
      return { ok: true, value: { available: true, items: rows.map((r) => bentuk(r, { internal: false })) } };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { ok: true, value: { available: false, items: [] } };
    }
  }

  async function give(input, actor) {
    if (!actor || actor.role !== 'admin') return { ok: false, status: 403, error: 'Hadiah ditetapkan Direktur Asrama dan dicatat lewat akun admin.' };
    const s = input || {};
    if (!UUID.test(String(s.studentId))) return { ok: false, error: 'Pilih santri.' };
    if (!JENIS[s.kind]) return { ok: false, error: 'Pilih jenis hadiah yang mendidik.' };
    const judul = rapi(s.title, 120);
    if (judul.length < 2) return { ok: false, error: 'Tulis wujud hadiahnya, misalnya judul kitab atau nama piagam.' };
    const alasan = rapi(s.reason, 500);
    if (alasan.length < 5) return { ok: false, error: 'Tulis prestasi yang diapresiasi (minimal 5 karakter).' };
    if (!tanggalValid(s.awardedOn) || s.awardedOn > hariIni()) return { ok: false, error: 'Tanggal pemberian tidak valid atau di masa depan.' };
    return tulis(async () => {
      if (!(await database.query('SELECT 1 FROM students WHERE id = $1', [s.studentId])).rows.length) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
      const id = crypto.randomUUID();
      await database.query('INSERT INTO student_rewards (id, student_id, kind, title, reason, awarded_on, created_by_account_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [id, s.studentId, s.kind, judul, alasan, s.awardedOn, actor.id || null, now()]);
      return { ok: true, value: bentuk((await database.query(`${SELECT} WHERE r.id = $1`, [id])).rows[0], { internal: true }) };
    });
  }

  async function voidReward(id, input, actor) {
    if (!actor || actor.role !== 'admin') return { ok: false, status: 403, error: 'Pembatalan hadiah lewat akun admin.' };
    if (!UUID.test(String(id))) return { ok: false, status: 404, error: 'Catatan hadiah tidak ditemukan.' };
    const alasan = rapi(input && input.reason, 300);
    if (alasan.length < 5) return { ok: false, error: 'Alasan pembatalan wajib diisi (minimal 5 karakter).' };
    return tulis(async () => {
      const lama = (await database.query('SELECT voided_at FROM student_rewards WHERE id = $1', [id])).rows[0];
      if (!lama) return { ok: false, status: 404, error: 'Catatan hadiah tidak ditemukan.' };
      if (lama.voided_at) return { ok: false, status: 409, error: 'Catatan hadiah ini sudah dibatalkan.' };
      await database.query('UPDATE student_rewards SET voided_at = $2, void_reason = $3, voided_by_account_id = $4 WHERE id = $1', [id, now(), alasan, actor.id || null]);
      return { ok: true, value: bentuk((await database.query(`${SELECT} WHERE r.id = $1`, [id])).rows[0], { internal: true }) };
    });
  }

  return { list, forStudent, give, void: voidReward };
}

module.exports = { createStudentRewardService, JENIS };
