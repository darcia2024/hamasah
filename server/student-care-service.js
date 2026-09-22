// Ibadah (sholat berjamaah 5 waktu, setoran hafalan) dan kesehatan santri.
//
// Hak akses memakai aturan rekam jejak santri yang sudah ada (accessFor dari
// student-portal-service): musyrif hanya untuk santri di asramanya, wali dan santri hanya
// santrinya sendiri. Kesehatan adalah data pribadi spesifik (UU PDP): wali dan santri hanya
// menerima kondisi dan catatan untuk wali; keluhan dan tindakan hanya untuk staf. Seluruh
// fitur kesehatan dikunci healthEnabled sampai kebijakan privasi memuatnya.
const crypto = require('node:crypto');

const PRAYERS = Object.freeze(['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya']);
const PRAYER_STATUSES = Object.freeze(['berjamaah', 'munfarid', 'tidak', 'izin']);
const MEMORIZATION_KINDS = Object.freeze(['ziyadah', 'murajaah']);
const MEMORIZATION_GRADES = Object.freeze(['lancar', 'kurang-lancar', 'ulang']);
const HEALTH_CONDITIONS = Object.freeze(['sehat', 'sakit-ringan', 'perlu-perhatian', 'dirujuk']);
const MAX_RANGE_DAYS = 92;

function clean(value, max) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function jakartaToday(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(now()));
}

function shiftDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function createStudentCareService({ store, accessFor, healthEnabled = false, now = () => new Date().toISOString() } = {}) {
  if (!store || typeof accessFor !== 'function') throw new Error('createStudentCareService membutuhkan store dan accessFor.');

  async function writable(studentId, actor) {
    const access = await accessFor(studentId, actor);
    if (!access.exists) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    if (!access.write) return { ok: false, status: 403, error: 'Akses pengawas atau admin untuk santri ini diperlukan.' };
    return { ok: true };
  }

  // Rentang tanggal: default 30 hari terakhir (WIB), maksimal 92 hari.
  function range(options = {}) {
    const to = options.to || jakartaToday(now);
    const from = options.from || shiftDays(to, -29);
    if (!isDate(from) || !isDate(to) || from > to) return { ok: false, error: 'Rentang tanggal tidak valid.' };
    if (shiftDays(from, MAX_RANGE_DAYS) < to) return { ok: false, error: `Rentang tanggal maksimal ${MAX_RANGE_DAYS} hari.` };
    return { ok: true, value: { from, to } };
  }

  return Object.freeze({
    healthEnabled,

    // Presensi sholat satu tanggal: entries [{ prayer, status, note? }]. Mengganti nilai
    // yang sudah ada untuk waktu yang sama, jadi koreksi tidak membuat baris ganda.
    async recordPrayers(studentId, input, actor) {
      const izin = await writable(studentId, actor);
      if (!izin.ok) return izin;
      const source = input || {};
      const date = String(source.date || '');
      if (!isDate(date) || date > jakartaToday(now)) return { ok: false, error: 'Tanggal sholat tidak valid atau di masa depan.' };
      const entries = Array.isArray(source.entries) ? source.entries : [];
      if (!entries.length || entries.length > PRAYERS.length) return { ok: false, error: 'Isi status untuk minimal satu waktu sholat.' };
      const seen = new Set();
      const rows = [];
      for (const entry of entries) {
        const prayer = String(entry && entry.prayer || '');
        const status = String(entry && entry.status || '');
        if (!PRAYERS.includes(prayer) || !PRAYER_STATUSES.includes(status) || seen.has(prayer)) return { ok: false, error: 'Waktu atau status sholat tidak valid.' };
        seen.add(prayer);
        rows.push({ id: crypto.randomUUID(), prayer, status, note: clean(entry.note, 300) });
      }
      await store.upsertPrayers(studentId, date, rows, { accountId: actor.id || null, at: now() });
      return { ok: true, value: { date, entries: rows.map(({ prayer, status, note }) => ({ prayer, status, note })) } };
    },

    async addMemorization(studentId, input, actor) {
      const izin = await writable(studentId, actor);
      if (!izin.ok) return izin;
      const source = input || {};
      const occurredOn = String(source.occurredOn || jakartaToday(now));
      const kind = String(source.kind || '');
      const grade = String(source.grade || '');
      const portion = clean(source.portion, 120);
      if (!isDate(occurredOn) || occurredOn > jakartaToday(now)) return { ok: false, error: 'Tanggal setoran tidak valid atau di masa depan.' };
      if (!MEMORIZATION_KINDS.includes(kind) || !MEMORIZATION_GRADES.includes(grade) || !portion || portion.length < 2) {
        return { ok: false, error: 'Jenis setoran, bagian hafalan, dan penilaian wajib diisi dengan benar.' };
      }
      const record = { id: crypto.randomUUID(), studentId, occurredOn, kind, portion, grade, note: clean(source.note, 300), accountId: actor.id || null, createdAt: now() };
      await store.addMemorization(record);
      return { ok: true, value: { id: record.id, occurredOn, kind, portion, grade, note: record.note } };
    },

    async addHealth(studentId, input, actor) {
      if (!healthEnabled) return { ok: false, status: 404, error: 'Catatan kesehatan belum diaktifkan.' };
      const izin = await writable(studentId, actor);
      if (!izin.ok) return izin;
      const source = input || {};
      const occurredOn = String(source.occurredOn || jakartaToday(now));
      const condition = String(source.condition || '');
      if (!isDate(occurredOn) || occurredOn > jakartaToday(now)) return { ok: false, error: 'Tanggal catatan tidak valid atau di masa depan.' };
      if (!HEALTH_CONDITIONS.includes(condition)) return { ok: false, error: 'Kondisi kesehatan tidak valid.' };
      const record = {
        id: crypto.randomUUID(), studentId, occurredOn, condition,
        complaint: clean(source.complaint, 500), actionTaken: clean(source.actionTaken, 500), parentNote: clean(source.parentNote, 500),
        accountId: actor.id || null, createdAt: now()
      };
      await store.addHealth(record);
      return { ok: true, value: { id: record.id, occurredOn, condition, complaint: record.complaint, actionTaken: record.actionTaken, parentNote: record.parentNote } };
    },

    // Ringkasan untuk portal, monitoring, dan rapor. health bernilai null bila fitur mati.
    async summary(studentId, actor, options = {}) {
      const access = await accessFor(studentId, actor);
      if (!access.exists) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
      if (!access.view) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
      const period = range(options);
      if (!period.ok) return period;
      const [prayers, memorization, health] = await Promise.all([
        store.listPrayers(studentId, period.value),
        store.listMemorization(studentId, period.value),
        healthEnabled ? store.listHealth(studentId, period.value) : Promise.resolve(null)
      ]);
      const totals = Object.fromEntries(PRAYER_STATUSES.map((status) => [status, prayers.filter((entry) => entry.status === status).length]));
      const berjamaahRate = prayers.length ? Math.round((totals.berjamaah / prayers.length) * 100) : null;
      const days = [...new Set(prayers.map((entry) => entry.date))].sort().reverse().map((date) => ({
        date,
        prayers: Object.fromEntries(PRAYERS.map((prayer) => {
          const entry = prayers.find((item) => item.date === date && item.prayer === prayer);
          return [prayer, entry ? entry.status : null];
        }))
      }));
      return {
        ok: true,
        value: {
          period: period.value,
          prayers: { recorded: prayers.length, totals, berjamaahRate, days },
          memorization,
          health: health === null ? null : (access.staff
            ? health
            : health.map(({ occurredOn, condition, parentNote }) => ({ occurredOn, condition, parentNote })))
        }
      };
    }
  });
}

module.exports = { HEALTH_CONDITIONS, MEMORIZATION_GRADES, MEMORIZATION_KINDS, PRAYERS, PRAYER_STATUSES, createStudentCareService };
