// Jadwal keberangkatan per kloter.
//
// Petugas pendaftaran dan admin membuat kloter (nama, tanggal rencana, kota/bandara asal,
// status, catatan untuk pendaftar) lalu menugaskan pendaftar ke kloter. Pendaftar melihat
// kloternya di halaman cek status. Tidak ada tanggal atau status yang dikarang: kloter tanpa
// tanggal tampil "belum ditetapkan", pendaftar tanpa kloter tampil "belum ditetapkan".
const crypto = require('node:crypto');

const STATUSES = Object.freeze({ planned: 'Direncanakan', confirmed: 'Terkonfirmasi', departed: 'Sudah berangkat', cancelled: 'Dibatalkan' });
const STAFF_ROLES = Object.freeze(['admin', 'registration-officer']);

function clean(value, max) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function validDate(value) {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00Z`).getTime())) return { ok: false };
  return { ok: true, value: text };
}

// Bentuk untuk pendaftar: tanpa id internal, hitungan anggota, atau waktu audit.
function forApplicant(group) {
  if (!group) return null;
  return {
    name: group.name,
    plannedDate: group.plannedDate,
    origin: group.origin,
    status: group.status,
    statusLabel: STATUSES[group.status] || group.status,
    note: group.applicantNote
  };
}

function createDepartureService({ store, now = () => new Date().toISOString(), registrationExists } = {}) {
  if (!store) throw new Error('createDepartureService membutuhkan store.');
  const staff = (actor) => Boolean(actor && STAFF_ROLES.includes(actor.role));

  function readGroupInput(input, current = {}) {
    const source = input || {};
    const pick = (key) => (source[key] === undefined ? current[key] : source[key]);
    const name = clean(pick('name'), 80);
    const date = validDate(pick('plannedDate'));
    const status = String(pick('status') || 'planned');
    if (!name || name.length < 3) return { ok: false, error: 'Nama kloter minimal 3 karakter.' };
    if (!date.ok) return { ok: false, error: 'Tanggal rencana harus berformat YYYY-MM-DD.' };
    if (!STATUSES[status]) return { ok: false, error: 'Status kloter tidak dikenal.' };
    return { ok: true, value: { name, plannedDate: date.value, origin: clean(pick('origin'), 80), status, applicantNote: clean(pick('applicantNote'), 500) } };
  }

  return Object.freeze({
    STATUSES,
    async listGroups(actor) {
      if (!staff(actor)) return { ok: false, error: 'Akses petugas diperlukan.' };
      return { ok: true, value: await store.listGroups() };
    },
    async createGroup(input, actor) {
      if (!staff(actor)) return { ok: false, error: 'Akses petugas diperlukan.' };
      const parsed = readGroupInput(input);
      if (!parsed.ok) return parsed;
      const waktu = now();
      return { ok: true, value: await store.createGroup({ id: crypto.randomUUID(), ...parsed.value, createdAt: waktu, updatedAt: waktu }) };
    },
    async updateGroup(groupId, input, actor) {
      if (!staff(actor)) return { ok: false, error: 'Akses petugas diperlukan.' };
      const current = await store.getGroup(groupId);
      if (!current) return { ok: false, status: 404, error: 'Kloter tidak ditemukan.' };
      const parsed = readGroupInput(input, current);
      if (!parsed.ok) return parsed;
      return { ok: true, value: await store.updateGroup(groupId, { ...parsed.value, updatedAt: now() }) };
    },
    // groupId null melepas pendaftar dari kloter.
    async assign(registrationId, groupId, actor) {
      if (!staff(actor)) return { ok: false, error: 'Akses petugas diperlukan.' };
      if (registrationExists && !(await registrationExists(registrationId))) return { ok: false, status: 404, error: 'Pendaftaran tidak ditemukan.' };
      if (groupId) {
        const group = await store.getGroup(groupId);
        if (!group) return { ok: false, status: 404, error: 'Kloter tidak ditemukan.' };
        if (group.status === 'cancelled') return { ok: false, error: 'Kloter yang dibatalkan tidak bisa menerima pendaftar.' };
      }
      const sebelum = (await store.forRegistrations([registrationId]))[registrationId] || null;
      await store.assign(registrationId, groupId || null, { accountId: actor.id || null, at: now() });
      const map = await store.forRegistrations([registrationId]);
      const sesudah = map[registrationId] || null;
      // changed: kloter berganti (termasuk dari "belum ditetapkan"); menyimpan ulang kloter
      // yang sama bukan perubahan dan tidak boleh memicu email kedua.
      return { ok: true, value: sesudah, changed: (sebelum ? sebelum.id : null) !== (sesudah ? sesudah.id : null) };
    },
    // Untuk daftar petugas: { registrationId: kloter } (bentuk lengkap).
    async forRegistrations(registrationIds) {
      return registrationIds.length ? store.forRegistrations(registrationIds) : {};
    },
    // Untuk pendaftar: kloter miliknya dalam bentuk aman, atau null.
    async forApplicant(registrationId) {
      const map = await store.forRegistrations([registrationId]);
      return forApplicant(map[registrationId] || null);
    }
  });
}

module.exports = { STATUSES, createDepartureService, forApplicant };
