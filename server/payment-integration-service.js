'use strict';

const crypto = require('node:crypto');

// Integrasi sistem pembayaran (Sendit), tahap persiapan (migrasi 074).
//
// Prinsip dari rapat: tidak membangun ulang payment gateway; audit dulu; hindari dua sistem yang sama-sama bisa menandai lunas
// tanpa sinkronisasi. Yang ada di sini TIDAK menghubungi Sendit (API-nya belum terverifikasi). Isinya:
//   1. Tautan ke halaman pembayaran yang sudah ada, untuk wali dan santri, serta untuk pesan pengingat.
//   2. Daftar audit dan catatan keputusan (integrasi atau migrasi penuh) yang diisi bersama tim IT.
//   3. Rekonsiliasi: transaksi dari website pembayaran dicatat (idempoten per nomor referensi), dicocokkan ke tagihan, lalu
//      diterapkan lewat operationsService.markInvoicePaid, jalur yang sama dengan pelunasan manual. Dengan begitu hanya ada
//      satu pintu yang menandai lunas, lengkap dengan nomor kuitansi dan jejak audit; pembayaran yang sudah lunas lewat jalur
//      lain terdeteksi, bukan ditimpa.
// Mode "rekonsiliasi" baru bisa dipilih bila audit menyatakan akses integrasi yang sah ada. Sinkronisasi otomatis (webhook)
// sengaja belum dibuat sampai API dan webhook terverifikasi.

const MODE = Object.freeze({ tautan: 'Tautan ke website pembayaran saja', rekonsiliasi: 'Tautan dan rekonsiliasi pembayaran dari website pembayaran' });
const KEPUTUSAN = Object.freeze({ 'belum-final': 'Belum diputuskan', integrasi: 'Integrasi dengan website pembayaran', 'migrasi-penuh': 'Migrasi penuh ke sistem Hamasah' });
const STATUS_AUDIT = Object.freeze({ belum: 'Belum diperiksa', ya: 'Ya, sudah terpenuhi', tidak: 'Tidak tersedia', 'perlu-konfirmasi': 'Perlu konfirmasi tim IT' });
const BAWAAN = Object.freeze({ mode: 'tautan', providerName: 'Sendit', paymentUrl: '', decision: 'belum-final', decisionNote: '', decidedAt: null });
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk integrasi pembayaran. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAKS_IMPOR = 200;

function tabelBelumAda(error) {
  if (!error) return false;
  if (['42P01', '42703'].includes(error.code)) return true;
  return /(payment_integration|payment_audit|external_payments)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function rapi(value, maks) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maks);
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : null);
}

function tanggalValid(teks) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(teks || ''))) return false;
  const d = new Date(`${teks}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === teks;
}

// Hanya tautan https. Mencegah javascript: dan data: lolos dari kolom yang diisi admin.
function tautanAman(nilai) {
  if (!nilai) return '';
  try {
    const url = new URL(String(nilai).trim());
    if (url.protocol !== 'https:' || !url.hostname.includes('.')) return false;
    return url.toString();
  } catch { return false; }
}

function createPaymentIntegrationService({ database, markInvoicePaid, now = () => new Date() } = {}) {
  if (!database) throw new Error('createPaymentIntegrationService membutuhkan database.');

  const staf = (actor) => Boolean(actor && ['admin', 'finance'].includes(actor.role));
  const admin = (actor) => Boolean(actor && actor.role === 'admin');
  const TOLAK = { ok: false, status: 403, error: 'Hanya admin dan keuangan yang mengelola pembayaran.' };
  const TOLAK_ADMIN = { ok: false, status: 403, error: 'Hanya admin yang mengubah pengaturan integrasi pembayaran.' };

  async function tulis(fn) {
    try { return await fn(); } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  async function muatConfig() {
    try {
      const { rows } = await database.query('SELECT config FROM payment_integration_settings WHERE id = 1');
      return { available: true, config: { ...BAWAAN, ...(rows[0] ? rows[0].config : {}) } };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { available: false, config: { ...BAWAAN } };
    }
  }

  // Dipakai pesan pengingat dan portal: tautan halaman pembayaran bila sudah diatur.
  async function link() {
    const { config } = await muatConfig();
    return config.paymentUrl || null;
  }

  async function getLink(actor) {
    if (!actor || !['admin', 'finance', 'parent', 'student'].includes(actor.role)) return { ok: false, status: 403, error: 'Akses ditolak.' };
    const { config } = await muatConfig();
    return { ok: true, value: { url: config.paymentUrl || null, providerName: config.providerName || 'website pembayaran' } };
  }

  // ------------------------------------------------------------------ pengaturan dan audit

  async function audit() {
    try {
      const { rows } = await database.query('SELECT a.*, u.name AS updated_by FROM payment_audit_items a LEFT JOIN accounts u ON u.id = a.updated_by_account_id ORDER BY a.sort_order');
      return rows.map((r) => ({ code: r.code, title: r.title, status: r.status, statusLabel: STATUS_AUDIT[r.status], note: r.note || '', updatedBy: r.updated_by || null, updatedAt: iso(r.updated_at) }));
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return [];
    }
  }

  async function getSettings(actor) {
    if (!staf(actor)) return TOLAK;
    const { available, config } = await muatConfig();
    const items = await audit();
    const ya = (kode) => (items.find((i) => i.code === kode) || {}).status === 'ya';
    return {
      ok: true,
      value: {
        available, config, audit: items, auditStatuses: Object.entries(STATUS_AUDIT).map(([id, label]) => ({ id, label })),
        modes: Object.entries(MODE).map(([id, label]) => ({ id, label })), decisions: Object.entries(KEPUTUSAN).map(([id, label]) => ({ id, label })),
        canReconcileMode: ya('akses-sah') && ya('pemetaan-tagihan'), canEdit: admin(actor),
        automaticSync: { available: false, reason: 'Sinkronisasi otomatis (webhook) belum dibuat: API dan webhook website pembayaran belum terverifikasi.' }
      }
    };
  }

  async function updateSettings(input, actor) {
    if (!admin(actor)) return TOLAK_ADMIN;
    const sumber = input || {};
    return tulis(async () => {
      const { config: lama } = await muatConfig();
      const config = { ...lama };
      if (sumber.providerName !== undefined) config.providerName = rapi(sumber.providerName, 60) || 'Sendit';
      if (sumber.paymentUrl !== undefined) {
        const aman = tautanAman(sumber.paymentUrl);
        if (aman === false) return { ok: false, error: 'Tautan pembayaran harus alamat https yang valid.' };
        config.paymentUrl = aman;
      }
      if (sumber.mode !== undefined) {
        if (!MODE[sumber.mode]) return { ok: false, error: 'Mode integrasi tidak dikenal.' };
        if (sumber.mode === 'rekonsiliasi') {
          const items = await audit();
          const ya = (kode) => (items.find((i) => i.code === kode) || {}).status === 'ya';
          if (!ya('akses-sah') || !ya('pemetaan-tagihan')) return { ok: false, status: 409, error: 'Mode rekonsiliasi baru bisa dipilih setelah audit menyatakan akses integrasi yang sah ada dan nomor tagihan dapat dipetakan ke tagihan Hamasah.' };
        }
        config.mode = sumber.mode;
      }
      if (sumber.decision !== undefined) {
        if (!KEPUTUSAN[sumber.decision]) return { ok: false, error: 'Keputusan tidak dikenal.' };
        const catatan = rapi(sumber.decisionNote, 500);
        if (sumber.decision !== 'belum-final' && catatan.length < 10) return { ok: false, error: 'Catat dasar keputusan bersama tim IT (minimal 10 karakter).' };
        config.decision = sumber.decision;
        config.decisionNote = catatan;
        config.decidedAt = sumber.decision === 'belum-final' ? null : now().toISOString();
      }
      await database.query(
        `INSERT INTO payment_integration_settings (id, config, updated_by_account_id, updated_at) VALUES (1, $1::jsonb, $2, $3)
         ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_by_account_id = EXCLUDED.updated_by_account_id, updated_at = EXCLUDED.updated_at`,
        [JSON.stringify(config), actor.id || null, now()]
      );
      return { ok: true, value: { config } };
    });
  }

  async function updateAudit(code, input, actor) {
    if (!admin(actor)) return TOLAK_ADMIN;
    const status = String(input && input.status || '');
    if (!STATUS_AUDIT[status]) return { ok: false, error: 'Status audit tidak dikenal.' };
    const catatan = rapi(input && input.note, 500);
    if (['tidak', 'perlu-konfirmasi'].includes(status) && catatan.length < 3) return { ok: false, error: 'Tulis catatan untuk butir yang tidak tersedia atau perlu konfirmasi.' };
    return tulis(async () => {
      const { rowCount } = await database.query('UPDATE payment_audit_items SET status = $2, note = $3, updated_by_account_id = $4, updated_at = $5 WHERE code = $1', [String(code), status, catatan, actor.id || null, now()]);
      if (!rowCount) return { ok: false, status: 404, error: 'Butir audit tidak ditemukan.' };
      // Mode rekonsiliasi gugur bila syaratnya dicabut.
      if (['akses-sah', 'pemetaan-tagihan'].includes(code) && status !== 'ya') {
        const { config } = await muatConfig();
        if (config.mode === 'rekonsiliasi') {
          await database.query(`UPDATE payment_integration_settings SET config = jsonb_set(config, '{mode}', '"tautan"'), updated_at = $1 WHERE id = 1`, [now()]);
        }
      }
      return { ok: true, value: { code, status } };
    });
  }

  // ------------------------------------------------------------------ rekonsiliasi

  function bentuk(r) {
    return {
      id: r.id, source: r.source, externalRef: r.external_ref, amount: Number(r.amount_rupiah), paidOn: r.paid_on_text, payerName: r.payer_name || '',
      invoiceNumberReported: r.invoice_number_reported || '', matchedInvoiceId: r.matched_invoice_id || null, matchedInvoiceNumber: r.invoice_number || null,
      invoiceAmount: r.invoice_amount === null || r.invoice_amount === undefined ? null : Number(r.invoice_amount), invoiceStatus: r.invoice_status || null, studentName: r.student_name || null,
      status: r.status, statusLabel: { baru: 'Menunggu diterapkan', diterapkan: 'Sudah diterapkan', ditolak: 'Ditolak' }[r.status], note: r.note || '', createdAt: iso(r.created_at), decidedAt: iso(r.decided_at), decidedBy: r.decided_by || null,
      amountMatches: r.invoice_amount === null || r.invoice_amount === undefined ? null : Number(r.invoice_amount) === Number(r.amount_rupiah)
    };
  }

  const SELECT = `SELECT p.*, to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on_text, i.invoice_number, i.amount_rupiah AS invoice_amount, i.status AS invoice_status, s.name AS student_name, d.name AS decided_by
      FROM external_payments p LEFT JOIN invoices i ON i.id = p.matched_invoice_id LEFT JOIN students s ON s.id = i.student_id LEFT JOIN accounts d ON d.id = p.decided_by_account_id`;

  async function cariTagihan(nomor) {
    const bersih = rapi(nomor, 40).toUpperCase();
    if (!bersih) return null;
    const { rows } = await database.query('SELECT id FROM invoices WHERE invoice_number = $1', [bersih]);
    return rows.length ? rows[0].id : null;
  }

  async function sisip(sumber, actor) {
    const ref = rapi(sumber.externalRef, 80);
    const jumlah = Math.round(Number(sumber.amount));
    if (ref.length < 3) return { ok: false, error: 'Nomor referensi transaksi 3 sampai 80 karakter.' };
    if (!Number.isFinite(jumlah) || jumlah <= 0) return { ok: false, error: 'Nominal harus lebih dari nol.' };
    if (!tanggalValid(sumber.paidOn)) return { ok: false, error: 'Tanggal bayar tidak valid.' };
    // Hari ini menurut Jakarta, sama dengan kuitansi (operations-service). Dengan tanggal UTC, pukul 00.00-07.00 WIB
    // pembayaran hari itu ditolak di sini sebagai "masa depan" padahal kuitansinya menolak tanggal kemarin.
    if (sumber.paidOn > new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now())) return { ok: false, error: 'Tanggal bayar tidak boleh di masa depan.' };
    const asal = sumber.source === 'manual' ? 'manual' : 'sendit';
    const tagihan = await cariTagihan(sumber.invoiceNumber);
    const ada = await database.query('SELECT id FROM external_payments WHERE source = $1 AND external_ref = $2', [asal, ref]);
    if (ada.rows.length) return { ok: false, status: 409, error: `Transaksi dengan referensi ${ref} sudah pernah dicatat.` };
    const id = crypto.randomUUID();
    await database.query(
      `INSERT INTO external_payments (id, source, external_ref, amount_rupiah, paid_on, payer_name, invoice_number_reported, matched_invoice_id, note, created_by_account_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, asal, ref, jumlah, sumber.paidOn, rapi(sumber.payerName, 120), rapi(sumber.invoiceNumber, 40).toUpperCase(), tagihan, rapi(sumber.note, 500), actor.id || null, now()]
    );
    return { ok: true, value: { id } };
  }

  async function record(input, actor) {
    if (!staf(actor)) return TOLAK;
    return tulis(async () => {
      const hasil = await sisip(input || {}, actor);
      if (!hasil.ok) return hasil;
      return { ok: true, value: bentuk((await database.query(`${SELECT} WHERE p.id = $1`, [hasil.value.id])).rows[0]) };
    });
  }

  // Impor banyak transaksi sekaligus (dari ekspor website pembayaran). Baris yang gagal dilaporkan, yang lain tetap masuk.
  async function importRows(input, actor) {
    if (!staf(actor)) return TOLAK;
    const baris = Array.isArray(input && input.rows) ? input.rows : [];
    if (!baris.length) return { ok: false, error: 'Tidak ada baris untuk diimpor.' };
    if (baris.length > MAKS_IMPOR) return { ok: false, error: `Paling banyak ${MAKS_IMPOR} baris per impor.` };
    return tulis(async () => {
      const gagal = [];
      let masuk = 0;
      for (let i = 0; i < baris.length; i += 1) {
        const hasil = await sisip(baris[i] || {}, actor);
        if (hasil.ok) masuk += 1; else gagal.push({ row: i + 1, error: hasil.error });
      }
      return { ok: true, value: { imported: masuk, failed: gagal.length, errors: gagal.slice(0, 50) } };
    });
  }

  async function list(actor, status) {
    if (!staf(actor)) return TOLAK;
    return tulis(async () => {
      const { rows } = await database.query(`${SELECT} WHERE ($1::text IS NULL OR p.status = $1) ORDER BY p.created_at DESC LIMIT 200`, [['baru', 'diterapkan', 'ditolak'].includes(status) ? status : null]);
      const { config } = await muatConfig();
      return { ok: true, value: { available: true, mode: config.mode, items: rows.map(bentuk) } };
    });
  }

  async function matchInvoice(id, input, actor) {
    if (!staf(actor)) return TOLAK;
    return tulis(async () => {
      const row = (await database.query('SELECT status FROM external_payments WHERE id = $1', [UUID.test(String(id)) ? id : null])).rows[0];
      if (!row) return { ok: false, status: 404, error: 'Transaksi tidak ditemukan.' };
      if (row.status !== 'baru') return { ok: false, status: 409, error: 'Transaksi ini sudah diputuskan.' };
      const tagihan = await cariTagihan(input && input.invoiceNumber);
      if (!tagihan) return { ok: false, status: 404, error: 'Nomor tagihan tidak ditemukan.' };
      await database.query('UPDATE external_payments SET matched_invoice_id = $2, invoice_number_reported = $3 WHERE id = $1', [id, tagihan, rapi(input.invoiceNumber, 40).toUpperCase()]);
      return { ok: true, value: bentuk((await database.query(`${SELECT} WHERE p.id = $1`, [id])).rows[0]) };
    });
  }

  // Menerapkan transaksi ke tagihan lewat jalur pelunasan resmi (kuitansi dan audit ikut). Tidak menimpa tagihan yang sudah lunas.
  async function apply(id, input, actor) {
    if (!staf(actor)) return TOLAK;
    if (typeof markInvoicePaid !== 'function') return { ok: false, status: 501, error: 'Penerapan pembayaran belum tersedia.' };
    return tulis(async () => {
      const baris = (await database.query(`${SELECT} WHERE p.id = $1`, [UUID.test(String(id)) ? id : null])).rows[0];
      if (!baris) return { ok: false, status: 404, error: 'Transaksi tidak ditemukan.' };
      if (baris.status !== 'baru') return { ok: false, status: 409, error: 'Transaksi ini sudah diputuskan.' };
      if (!baris.matched_invoice_id) return { ok: false, status: 409, error: 'Cocokkan transaksi ke nomor tagihan lebih dulu.' };
      if (baris.invoice_status === 'paid') return { ok: false, status: 409, error: `Tagihan ${baris.invoice_number} sudah lunas lewat jalur lain. Periksa apakah ini pembayaran ganda; tolak transaksi ini bila ya.` };
      if (baris.invoice_status !== 'unpaid') return { ok: false, status: 409, error: 'Tagihan ini dibatalkan dan tidak bisa menerima pembayaran.' };
      const sama = Number(baris.invoice_amount) === Number(baris.amount_rupiah);
      if (!sama) {
        const alasan = rapi(input && input.mismatchReason, 300);
        if (!admin(actor) || !(input && input.allowMismatch) || alasan.length < 5) {
          return { ok: false, status: 409, error: `Nominal transaksi (${Number(baris.amount_rupiah)}) berbeda dari tagihan (${Number(baris.invoice_amount)}). Hanya admin yang dapat menerapkannya, dengan alasan tertulis.` };
        }
      }
      const catatan = `${baris.source === 'sendit' ? 'Sendit' : 'Manual'} ref ${baris.external_ref}${sama ? '' : ` (selisih nominal: ${rapi(input.mismatchReason, 200)})`}`.slice(0, 300);
      const hasil = await markInvoicePaid(baris.matched_invoice_id, actor, { paidOn: baris.paid_on_text, method: 'lainnya', note: catatan });
      if (!hasil.ok) return { ok: false, status: hasil.status || 422, error: hasil.error || 'Tagihan belum dapat ditandai lunas.' };
      await database.query(`UPDATE external_payments SET status = 'diterapkan', decided_by_account_id = $2, decided_at = $3 WHERE id = $1`, [id, actor.id || null, now()]);
      // paid dikembalikan apa adanya supaya route menjalankan efek samping pelunasan yang sama dengan jalur manual (audit, kelas, notifikasi).
      return { ok: true, value: { ...bentuk((await database.query(`${SELECT} WHERE p.id = $1`, [id])).rows[0]), receiptNumber: hasil.value ? hasil.value.receiptNumber || null : null }, paid: hasil };
    });
  }

  async function reject(id, input, actor) {
    if (!staf(actor)) return TOLAK;
    const alasan = rapi(input && input.reason, 500);
    if (alasan.length < 5) return { ok: false, error: 'Tulis alasan penolakan (minimal 5 karakter).' };
    return tulis(async () => {
      const row = (await database.query('SELECT status FROM external_payments WHERE id = $1', [UUID.test(String(id)) ? id : null])).rows[0];
      if (!row) return { ok: false, status: 404, error: 'Transaksi tidak ditemukan.' };
      if (row.status !== 'baru') return { ok: false, status: 409, error: 'Transaksi ini sudah diputuskan.' };
      await database.query(`UPDATE external_payments SET status = 'ditolak', note = $2, decided_by_account_id = $3, decided_at = $4 WHERE id = $1`, [id, alasan, actor.id || null, now()]);
      return { ok: true, value: bentuk((await database.query(`${SELECT} WHERE p.id = $1`, [id])).rows[0]) };
    });
  }

  return { link, getLink, getSettings, updateSettings, updateAudit, record, importRows, list, matchInvoice, apply, reject };
}

module.exports = { createPaymentIntegrationService, tautanAman };
