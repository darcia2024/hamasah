'use strict';

const crypto = require('node:crypto');
const { whatsappUrl } = require('../website/whatsapp-message.js');

// Pengingat tagihan lewat WhatsApp klik-untuk-chat (migrasi 073).
//
// Yang dilakukan sistem: menyusun daftar wali dengan tagihan BELUM LUNAS, menyusun pesan dari templat yang bisa diedit, dan
// membuka tautan wa.me. Yang tidak dilakukan: mengirim pesan. Membuka chat dicatat sebagai "dibuka", bukan "terkirim"; petugas
// boleh menandainya terkirim sendiri setelah benar-benar menekan kirim di WhatsApp.
//
// Pembatasan: pengingat hanya untuk tagihan yang masih belum lunas pada saat chat dibuka (tagihan yang sudah dibayar otomatis
// keluar dari pesan), paling banyak monthlyTarget kali per bulan per wali, dengan jarak minimum minGapDays antar pengingat.
// Hanya admin yang boleh melampaui batas itu (force), dan tercatat.

const FINANCE_ROLES = Object.freeze(['admin', 'finance']);
const BAWAAN = Object.freeze({
  defaultDueDays: 14, monthlyTarget: 3, minGapDays: 7,
  template: 'Assalamu\'alaikum Bapak/Ibu {nama_wali},\n\nKami dari tim keuangan Hamasah International menginformasikan tagihan ananda {nama_santri} yang belum lunas:\n{daftar_tagihan}\nTotal: {total}\n{jatuh_tempo}\nRincian dan cara pembayaran: {tautan_bayar}\n\nBila sudah membayar, mohon abaikan pesan ini. Terima kasih.\n\nWassalamu\'alaikum,\nTim Keuangan Hamasah International'
});
const VARIABEL = Object.freeze(['{nama_wali}', '{nama_santri}', '{daftar_tagihan}', '{total}', '{jatuh_tempo}', '{tautan_bayar}']);
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk pengingat tagihan. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HARI_MS = 24 * 60 * 60 * 1000;

function tabelBelumAda(error) {
  if (!error) return false;
  if (['42P01', '42703'].includes(error.code)) return true;
  return /(wa_reminder|due_on)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function tanggalJakarta(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
}

function selisihHari(dari, ke) {
  return Math.round((new Date(`${ke}T00:00:00Z`) - new Date(`${dari}T00:00:00Z`)) / HARI_MS);
}

function tambahHari(tanggal, hari) {
  return new Date(new Date(`${tanggal}T00:00:00Z`).getTime() + hari * HARI_MS).toISOString().slice(0, 10);
}

const RUPIAH = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const bacaTanggal = (t) => TANGGAL.format(new Date(`${t}T00:00:00Z`));

function createWhatsappReminderService({ database, appBaseUrl = '', paymentLink = null, now = () => new Date() } = {}) {
  if (!database) throw new Error('createWhatsappReminderService membutuhkan database.');

  const boleh = (actor) => Boolean(actor && FINANCE_ROLES.includes(actor.role));
  const TOLAK = { ok: false, status: 403, error: 'Hanya admin dan keuangan yang mengirim pengingat tagihan.' };

  async function tulis(fn) {
    try { return await fn(); } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  async function muatConfig() {
    try {
      const { rows } = await database.query('SELECT config FROM wa_reminder_settings WHERE id = 1');
      return { available: true, config: { ...BAWAAN, ...(rows[0] ? rows[0].config : {}) } };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { available: false, config: { ...BAWAAN } };
    }
  }

  async function tautanBayar() {
    try {
      const tautan = paymentLink ? await paymentLink() : null;
      if (tautan) return tautan;
    } catch { /* jatuh ke portal */ }
    return `${String(appBaseUrl || '').replace(/\/$/, '')}/portal`;
  }

  // ------------------------------------------------------------------ pengaturan

  async function getSettings(actor) {
    if (!boleh(actor)) return TOLAK;
    const { available, config } = await muatConfig();
    return { ok: true, value: { available, config, variables: VARIABEL } };
  }

  async function updateSettings(input, actor) {
    if (!boleh(actor)) return TOLAK;
    const sumber = input || {};
    const { config: lama } = await muatConfig();
    const config = { ...lama };
    const angka = (v, nama, min, maks) => { const n = Number(v); if (!Number.isInteger(n) || n < min || n > maks) throw new Error(`${nama} harus bilangan bulat ${min} sampai ${maks}.`); return n; };
    try {
      if (sumber.defaultDueDays !== undefined) config.defaultDueDays = angka(sumber.defaultDueDays, 'Batas jatuh tempo bawaan (hari)', 0, 365);
      if (sumber.monthlyTarget !== undefined) config.monthlyTarget = angka(sumber.monthlyTarget, 'Target pengingat per bulan', 1, 10);
      if (sumber.minGapDays !== undefined) config.minGapDays = angka(sumber.minGapDays, 'Jarak minimum antar pengingat (hari)', 0, 60);
      if (sumber.template !== undefined) {
        const teks = String(sumber.template).replace(/\r\n/g, '\n').trim();
        if (teks.length < 20 || teks.length > 2000) throw new Error('Templat pesan 20 sampai 2000 karakter.');
        if (!teks.includes('{daftar_tagihan}')) throw new Error('Templat harus memuat {daftar_tagihan} supaya wali tahu tagihan mana yang dimaksud.');
        const asing = (teks.match(/\{[a-z_]+\}/g) || []).filter((v) => !VARIABEL.includes(v));
        if (asing.length) throw new Error(`Variabel tidak dikenal: ${[...new Set(asing)].join(', ')}.`);
        config.template = teks;
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }
    return tulis(async () => {
      await database.query(
        `INSERT INTO wa_reminder_settings (id, config, updated_by_account_id, updated_at) VALUES (1, $1::jsonb, $2, $3)
         ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_by_account_id = EXCLUDED.updated_by_account_id, updated_at = EXCLUDED.updated_at`,
        [JSON.stringify(config), actor.id || null, now()]
      );
      return { ok: true, value: { available: true, config, variables: VARIABEL } };
    });
  }

  // ------------------------------------------------------------------ jatuh tempo

  async function setDueDate(invoiceId, input, actor) {
    if (!boleh(actor)) return TOLAK;
    if (!UUID.test(String(invoiceId))) return { ok: false, status: 404, error: 'Tagihan tidak ditemukan.' };
    const tanggal = input && input.dueOn === null ? null : String(input && input.dueOn || '');
    if (tanggal !== null) {
      const d = new Date(`${tanggal}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== tanggal) return { ok: false, error: 'Tanggal jatuh tempo tidak valid.' };
    }
    return tulis(async () => {
      const { rows } = await database.query('SELECT status FROM invoices WHERE id = $1', [invoiceId]);
      if (!rows.length) return { ok: false, status: 404, error: 'Tagihan tidak ditemukan.' };
      if (rows[0].status !== 'unpaid') return { ok: false, status: 409, error: 'Jatuh tempo hanya untuk tagihan yang belum dibayar.' };
      await database.query('UPDATE invoices SET due_on = $2 WHERE id = $1', [invoiceId, tanggal]);
      return { ok: true, value: { invoiceId, dueOn: tanggal } };
    });
  }

  // ------------------------------------------------------------------ daftar wali

  async function bacaTagihan(config, { period, parentId, invoiceIds } = {}) {
    const { rows } = await database.query(
      `SELECT i.id, i.invoice_number, i.description, i.amount_rupiah, to_char(i.issued_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS issued_on,
              to_char(i.due_on, 'YYYY-MM-DD') AS due_on, s.id AS student_id, s.name AS student_name, pa.parent_account_id, a.name AS parent_name, a.email,
              r.guardian_phone_e164 AS phone
         FROM invoices i
         JOIN students s ON s.id = i.student_id
         JOIN student_parent_accounts pa ON pa.student_id = s.id
         JOIN accounts a ON a.id = pa.parent_account_id AND a.active AND a.role = 'parent'
         LEFT JOIN registrations r ON r.id = s.registration_id AND lower(r.guardian_email) = lower(a.email)
        WHERE i.status = 'unpaid'
          AND ($1::text IS NULL OR to_char(i.issued_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') = $1)
          AND ($2::uuid IS NULL OR pa.parent_account_id = $2::uuid)
          AND ($3::uuid[] IS NULL OR i.id = ANY($3::uuid[]))
        ORDER BY a.name, i.issued_at`,
      [period || null, parentId || null, invoiceIds || null]
    );
    const hari = tanggalJakarta(now());
    return rows.map((r) => {
      const jatuh = r.due_on || tambahHari(r.issued_on, config.defaultDueDays);
      return {
        id: r.id, number: r.invoice_number, description: r.description, amount: Number(r.amount_rupiah), issuedOn: r.issued_on,
        dueOn: jatuh, dueSet: Boolean(r.due_on), daysLate: selisihHari(jatuh, hari), studentId: r.student_id, studentName: r.student_name,
        parentId: r.parent_account_id, parentName: r.parent_name, email: r.email, phone: r.phone || ''
      };
    });
  }

  async function riwayatWali(parentIds) {
    if (!parentIds.length) return new Map();
    const awalBulan = `${tanggalJakarta(now()).slice(0, 7)}-01`;
    const { rows } = await database.query(
      `SELECT parent_account_id, count(DISTINCT batch_id) FILTER (WHERE opened_at >= $2::date)::int AS bulan_ini, max(opened_at) AS terakhir
         FROM wa_reminder_log WHERE parent_account_id = ANY($1::uuid[]) GROUP BY parent_account_id`, [parentIds, awalBulan]
    );
    return new Map(rows.map((r) => [r.parent_account_id, { thisMonth: r.bulan_ini, last: r.terakhir ? new Date(r.terakhir).toISOString() : null }]));
  }

  function boleh_kirim(riwayat, config) {
    const terakhir = riwayat && riwayat.last ? tanggalJakarta(new Date(riwayat.last)) : null;
    const jarak = terakhir ? selisihHari(terakhir, tanggalJakarta(now())) : null;
    const kuota = Math.max(0, config.monthlyTarget - (riwayat ? riwayat.thisMonth : 0));
    const tungguHari = jarak !== null && jarak < config.minGapDays ? config.minGapDays - jarak : 0;
    return { quotaRemaining: kuota, waitDays: tungguHari, allowed: kuota > 0 && tungguHari === 0 };
  }

  async function listDebtors(actor, { period, due, q } = {}) {
    if (!boleh(actor)) return TOLAK;
    if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period))) return { ok: false, error: 'Periode memakai format YYYY-MM.' };
    const filterJatuh = ['semua', 'lewat', '7-hari', 'belum-diatur'].includes(due) ? due : 'semua';
    return tulis(async () => {
      const { available, config } = await muatConfig();
      let tagihan = await bacaTagihan(config, { period });
      if (filterJatuh === 'lewat') tagihan = tagihan.filter((t) => t.daysLate > 0);
      else if (filterJatuh === '7-hari') tagihan = tagihan.filter((t) => t.daysLate <= 0 && t.daysLate >= -7);
      else if (filterJatuh === 'belum-diatur') tagihan = tagihan.filter((t) => !t.dueSet);
      const kata = String(q || '').trim().toLowerCase();
      if (kata) tagihan = tagihan.filter((t) => `${t.parentName} ${t.studentName} ${t.number}`.toLowerCase().includes(kata));
      const perWali = new Map();
      tagihan.forEach((t) => {
        const w = perWali.get(t.parentId) || { parentId: t.parentId, parentName: t.parentName, email: t.email, hasPhone: false, students: new Set(), invoices: [], total: 0, maxDaysLate: -9999 };
        w.hasPhone = w.hasPhone || Boolean(t.phone);
        w.students.add(t.studentName);
        w.invoices.push({ id: t.id, number: t.number, description: t.description, amount: t.amount, studentName: t.studentName, issuedOn: t.issuedOn, dueOn: t.dueOn, dueSet: t.dueSet, daysLate: t.daysLate });
        w.total += t.amount;
        w.maxDaysLate = Math.max(w.maxDaysLate, t.daysLate);
        perWali.set(t.parentId, w);
      });
      const riwayat = await riwayatWali([...perWali.keys()]).catch((error) => { if (tabelBelumAda(error)) return new Map(); throw error; });
      const items = [...perWali.values()].map((w) => {
        const r = riwayat.get(w.parentId) || { thisMonth: 0, last: null };
        return { ...w, students: [...w.students], remindersThisMonth: r.thisMonth, lastReminderAt: r.last, ...boleh_kirim(r, config) };
      }).sort((a, b) => b.maxDaysLate - a.maxDaysLate || b.total - a.total);
      return { ok: true, value: { available, config, today: tanggalJakarta(now()), items, totalParents: items.length, totalAmount: items.reduce((n, w) => n + w.total, 0) } };
    });
  }

  // ------------------------------------------------------------------ pesan dan pencatatan

  function susunPesan(config, wali, tagihan, tautan) {
    const santri = [...new Set(tagihan.map((t) => t.studentName))];
    const total = tagihan.reduce((n, t) => n + t.amount, 0);
    const lewat = tagihan.filter((t) => t.daysLate > 0);
    const daftar = tagihan.map((t) => `- ${t.number}: ${t.description}${santri.length > 1 ? ` (${t.studentName})` : ''}, ${RUPIAH.format(t.amount)}, jatuh tempo ${bacaTanggal(t.dueOn)}${t.daysLate > 0 ? ` (terlambat ${t.daysLate} hari)` : ''}`).join('\n');
    const jatuh = lewat.length ? `${lewat.length} tagihan sudah melewati jatuh tempo.` : `Jatuh tempo terdekat ${bacaTanggal(tagihan.map((t) => t.dueOn).sort()[0])}.`;
    return config.template
      .replace(/\{nama_wali\}/g, wali.parentName).replace(/\{nama_santri\}/g, santri.join(', ')).replace(/\{daftar_tagihan\}/g, daftar)
      .replace(/\{total\}/g, RUPIAH.format(total)).replace(/\{jatuh_tempo\}/g, jatuh).replace(/\{tautan_bayar\}/g, tautan);
  }

  async function siapkan(parentId, invoiceIds, actor) {
    if (!UUID.test(String(parentId))) return { ok: false, status: 404, error: 'Wali tidak ditemukan.' };
    const ids = Array.isArray(invoiceIds) && invoiceIds.length ? invoiceIds.filter((i) => UUID.test(String(i))) : null;
    const { config } = await muatConfig();
    // Dibaca ulang dari database: tagihan yang sudah dibayar sejak daftar dimuat tidak ikut dalam pesan.
    const tagihan = await bacaTagihan(config, { parentId, invoiceIds: ids });
    if (!tagihan.length) return { ok: false, status: 409, error: 'Wali ini tidak punya tagihan yang belum lunas (mungkin baru saja dibayar), jadi tidak ada yang perlu diingatkan.' };
    const wali = { parentId, parentName: tagihan[0].parentName };
    const telepon = tagihan.map((t) => t.phone).find(Boolean) || '';
    const pesan = susunPesan(config, wali, tagihan, await tautanBayar());
    const riwayat = (await riwayatWali([parentId])).get(parentId) || { thisMonth: 0, last: null };
    return { ok: true, config, tagihan, wali, telepon, pesan, batas: boleh_kirim(riwayat, config), riwayat };
  }

  async function preview(parentId, input, actor) {
    if (!boleh(actor)) return TOLAK;
    return tulis(async () => {
      const s = await siapkan(parentId, input && input.invoiceIds, actor);
      if (!s.ok) return s;
      return { ok: true, value: { message: s.pesan, invoices: s.tagihan.map((t) => t.id), hasPhone: Boolean(s.telepon), quotaRemaining: s.batas.quotaRemaining, waitDays: s.batas.waitDays, allowed: s.batas.allowed, monthlyTarget: s.config.monthlyTarget } };
    });
  }

  // Membuka chat: mencatat "dibuka" (bukan "terkirim") dan mengembalikan tautan wa.me.
  async function open(parentId, input, actor) {
    if (!boleh(actor)) return TOLAK;
    return tulis(async () => {
      const s = await siapkan(parentId, input && input.invoiceIds, actor);
      if (!s.ok) return s;
      const paksa = Boolean(input && input.force);
      if (!s.batas.allowed) {
        if (!(paksa && actor.role === 'admin')) {
          return { ok: false, status: 429, error: s.batas.quotaRemaining <= 0 ? `Wali ini sudah diingatkan ${s.config.monthlyTarget} kali bulan ini. Hanya admin yang dapat menambah di luar target.` : `Pengingat terakhir belum lama. Tunggu ${s.batas.waitDays} hari lagi (jarak minimum ${s.config.minGapDays} hari), atau admin dapat melanjutkan.` };
        }
      }
      const batch = crypto.randomUUID();
      for (const t of s.tagihan) {
        await database.query(
          'INSERT INTO wa_reminder_log (id, batch_id, parent_account_id, invoice_id, no_phone, opened_by_account_id, opened_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [crypto.randomUUID(), batch, parentId, t.id, !s.telepon, actor.id || null, now()]
        );
      }
      return {
        ok: true,
        value: {
          batchId: batch, message: s.pesan, requiresContactSelection: !s.telepon, forced: !s.batas.allowed, invoiceCount: s.tagihan.length,
          url: s.telepon ? whatsappUrl(s.telepon, s.pesan) : `https://wa.me/?text=${encodeURIComponent(s.pesan)}`,
          notice: 'Chat WhatsApp dibuka dan dicatat sebagai "dibuka". Pesan baru terkirim setelah Anda menekan kirim di WhatsApp; tandai terkirim sendiri bila sudah.'
        }
      };
    });
  }

  async function confirmSent(batchId, actor) {
    if (!boleh(actor)) return TOLAK;
    if (!UUID.test(String(batchId))) return { ok: false, status: 404, error: 'Catatan tidak ditemukan.' };
    return tulis(async () => {
      const { rowCount } = await database.query(
        `UPDATE wa_reminder_log SET status = 'terkirim-dikonfirmasi', confirmed_by_account_id = $2, confirmed_at = $3 WHERE batch_id = $1 AND status = 'dibuka'`, [batchId, actor.id || null, now()]
      );
      if (!rowCount) return { ok: false, status: 404, error: 'Catatan tidak ditemukan atau sudah dikonfirmasi.' };
      return { ok: true, value: { batchId, confirmed: rowCount } };
    });
  }

  async function history(actor, { parentId } = {}) {
    if (!boleh(actor)) return TOLAK;
    return tulis(async () => {
      const { rows } = await database.query(
        `SELECT l.batch_id, l.parent_account_id, a.name AS parent_name, min(l.opened_at) AS opened_at, count(*)::int AS invoices, bool_or(l.no_phone) AS no_phone,
                min(l.status) AS status, max(u.name) AS opened_by, max(c.name) AS confirmed_by, max(l.confirmed_at) AS confirmed_at
           FROM wa_reminder_log l LEFT JOIN accounts a ON a.id = l.parent_account_id LEFT JOIN accounts u ON u.id = l.opened_by_account_id LEFT JOIN accounts c ON c.id = l.confirmed_by_account_id
          WHERE ($1::uuid IS NULL OR l.parent_account_id = $1::uuid) GROUP BY l.batch_id, l.parent_account_id, a.name ORDER BY min(l.opened_at) DESC LIMIT 100`,
        [parentId && UUID.test(parentId) ? parentId : null]
      );
      return { ok: true, value: { items: rows.map((r) => ({ batchId: r.batch_id, parentId: r.parent_account_id, parentName: r.parent_name, openedAt: new Date(r.opened_at).toISOString(), invoices: r.invoices, noPhone: r.no_phone, status: r.status, statusLabel: r.status === 'dibuka' ? 'Chat dibuka' : r.status === 'terkirim-dikonfirmasi' ? 'Terkirim (dikonfirmasi petugas)' : 'Gagal', openedBy: r.opened_by || null, confirmedBy: r.confirmed_by || null })) } };
    });
  }

  return { getSettings, updateSettings, setDueDate, listDebtors, preview, open, confirmSent, history };
}

module.exports = { createWhatsappReminderService, BAWAAN };
