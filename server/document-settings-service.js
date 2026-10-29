'use strict';

// Pengaturan batas peringatan dokumen tinggal (migrasi 069): paspor dan iqamah. Admin mengubahnya; monitoring pusat dan
// profil santri membacanya. Bila tabel belum ada, dipakai nilai bawaan yang sama dengan nilai awal migrasi.

const BAWAAN = Object.freeze({ passportWarningDays: 180, passportUrgentDays: 60, iqamahWarningDays: 60, iqamahUrgentDays: 14 });
const LABEL = Object.freeze({
  passportWarningDays: 'Peringatan paspor (hari sebelum habis)', passportUrgentDays: 'Paspor segera (hari)',
  iqamahWarningDays: 'Peringatan iqamah (hari sebelum habis)', iqamahUrgentDays: 'Iqamah segera (hari)'
});
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk pengaturan dokumen. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';

function tabelBelumAda(error) {
  return Boolean(error) && (error.code === '42P01' || (/document_alert_settings/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''))));
}

function periksa(input, lama) {
  const config = { ...lama };
  for (const kunci of Object.keys(BAWAAN)) {
    if (input[kunci] === undefined) continue;
    const n = Number(input[kunci]);
    if (!Number.isInteger(n) || n < 1 || n > 730) return { error: `${LABEL[kunci]} harus bilangan bulat 1 sampai 730.` };
    config[kunci] = n;
  }
  if (config.passportUrgentDays >= config.passportWarningDays) return { error: 'Batas paspor segera harus lebih kecil dari batas peringatan.' };
  if (config.iqamahUrgentDays >= config.iqamahWarningDays) return { error: 'Batas iqamah segera harus lebih kecil dari batas peringatan.' };
  return { config };
}

function createDocumentSettingsService({ database, now = () => new Date() } = {}) {
  if (!database) throw new Error('createDocumentSettingsService membutuhkan database.');

  async function muat() {
    try {
      const { rows } = await database.query('SELECT config FROM document_alert_settings WHERE id = 1');
      return { available: true, config: { ...BAWAAN, ...(rows[0] ? rows[0].config : {}) } };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { available: false, config: { ...BAWAAN } };
    }
  }

  async function get() {
    return (await muat()).config;
  }

  async function read(actor) {
    // Keuangan ikut membaca: tab Visa & Paspor memakai batas yang sama dengan Monitoring Pusat.
    if (!actor || !['admin', 'supervisor', 'finance'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya admin, musyrif, dan keuangan.' };
    const { available, config } = await muat();
    return { ok: true, value: { available, config, canEdit: actor.role === 'admin', labels: LABEL } };
  }

  async function update(input, actor) {
    if (!actor || actor.role !== 'admin') return { ok: false, status: 403, error: 'Hanya admin yang mengubah batas peringatan dokumen.' };
    const { config: lama } = await muat();
    const hasil = periksa(input || {}, lama);
    if (hasil.error) return { ok: false, error: hasil.error };
    try {
      await database.query(
        `INSERT INTO document_alert_settings (id, config, updated_by_account_id, updated_at) VALUES (1, $1::jsonb, $2, $3)
         ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_by_account_id = EXCLUDED.updated_by_account_id, updated_at = EXCLUDED.updated_at`,
        [JSON.stringify(hasil.config), actor.id || null, now()]
      );
    } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
    return { ok: true, value: { available: true, config: hasil.config, canEdit: true, labels: LABEL } };
  }

  return { get, read, update };
}

module.exports = { createDocumentSettingsService, BAWAAN };
