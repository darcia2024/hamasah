// Aturan asrama dan penugasan musyrif.

const crypto = require('node:crypto');
const { GENDERS } = require('./postgres-dormitory-store.js');

const ADMIN_ROLE = 'admin';
const SUPERVISOR_ROLE = 'supervisor';

function clean(value) { return String(value || '').trim(); }

function createMemoryDormitoryStore() {
  const dormitories = new Map();
  const assignments = new Map(); // accountId -> Set<dormitoryId>
  return {
    async listDormitories() {
      return [...dormitories.values()]
        .map((item) => ({ ...item }))
        .sort((kiri, kanan) => kiri.name.localeCompare(kanan.name, 'id-ID'));
    },
    async getDormitory(id) {
      return dormitories.has(id) ? { ...dormitories.get(id) } : null;
    },
    async createDormitory(dormitory) {
      const tersimpan = { ...dormitory, id: dormitory.id || crypto.randomUUID(), updatedAt: dormitory.createdAt };
      dormitories.set(tersimpan.id, tersimpan);
      return { ...tersimpan };
    },
    async dormitoriesForStaff(accountId) {
      return [...(assignments.get(accountId) || [])];
    },
    async listAssignments() {
      const hasil = [];
      for (const [accountId, daftar] of assignments) {
        for (const dormitoryId of daftar) {
          hasil.push({ accountId, dormitoryId, dormitoryName: (dormitories.get(dormitoryId) || {}).name });
        }
      }
      return hasil;
    },
    async assignStaff(accountId, dormitoryId) {
      const daftar = assignments.get(accountId) || new Set();
      daftar.add(dormitoryId);
      assignments.set(accountId, daftar);
    },
    async unassignStaff(accountId, dormitoryId) {
      const daftar = assignments.get(accountId);
      return Boolean(daftar && daftar.delete(dormitoryId));
    }
  };
}

function createDormitoryService(options) {
  const config = options || {};
  const store = config.store || createMemoryDormitoryStore();
  const now = config.now || function currentTime() { return new Date().toISOString(); };
  // Dipakai untuk memastikan yang ditugaskan memang akun musyrif.
  const getAccount = config.getAccount || async function tanpaAkun() { return null; };

  function adminOnly(actor) {
    return Boolean(actor && actor.role === ADMIN_ROLE);
  }

  async function list(actor) {
    if (!adminOnly(actor)) {
      return { ok: false, error: 'Akses admin diperlukan.' };
    }
    const [dormitories, assignments] = await Promise.all([store.listDormitories(), store.listAssignments()]);
    return { ok: true, value: { dormitories, assignments } };
  }

  async function create(input, actor) {
    if (!adminOnly(actor)) {
      return { ok: false, error: 'Akses admin diperlukan.' };
    }
    const source = input || {};
    const name = clean(source.name);
    const area = clean(source.area);
    const gender = clean(source.gender);
    if (name.length < 2 || area.length < 2 || !GENDERS.includes(gender)) {
      return { ok: false, error: 'Nama, wilayah, dan jenis asrama belum lengkap atau belum valid.' };
    }
    const sudahAda = (await store.listDormitories())
      .some((asrama) => asrama.name.toLocaleLowerCase('id-ID') === name.toLocaleLowerCase('id-ID'));
    if (sudahAda) {
      return { ok: false, error: 'Nama asrama sudah dipakai.' };
    }
    return { ok: true, value: await store.createDormitory({ id: crypto.randomUUID(), name, area, gender, createdAt: now() }) };
  }

  async function assign(dormitoryId, accountId, actor) {
    if (!adminOnly(actor)) {
      return { ok: false, error: 'Akses admin diperlukan.' };
    }
    if (!(await store.getDormitory(dormitoryId))) {
      return { ok: false, error: 'Asrama tidak ditemukan.' };
    }
    const account = await getAccount(accountId);
    // Hanya musyrif yang ditugaskan ke asrama. Kalau akun role lain boleh ditugaskan,
    // penugasan itu tidak berarti apa-apa dan hanya membingungkan saat dibaca.
    if (!account || account.role !== SUPERVISOR_ROLE) {
      return { ok: false, error: 'Penugasan asrama hanya untuk akun musyrif.' };
    }
    await store.assignStaff(accountId, dormitoryId, now());
    return { ok: true, value: { accountId, dormitoryId } };
  }

  async function unassign(dormitoryId, accountId, actor) {
    if (!adminOnly(actor)) {
      return { ok: false, error: 'Akses admin diperlukan.' };
    }
    const dihapus = await store.unassignStaff(accountId, dormitoryId);
    if (!dihapus) {
      return { ok: false, error: 'Penugasan tidak ditemukan.' };
    }
    return { ok: true, value: { accountId, dormitoryId } };
  }

  // Dipakai service santri untuk membatasi apa yang dilihat musyrif.
  function dormitoriesForStaff(accountId) {
    return store.dormitoriesForStaff(accountId);
  }

  return Object.freeze({ assign, create, createMemoryDormitoryStore, dormitoriesForStaff, list, unassign });
}

module.exports = { GENDERS, createDormitoryService, createMemoryDormitoryStore };
