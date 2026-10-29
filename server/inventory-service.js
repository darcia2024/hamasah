'use strict';

const crypto = require('node:crypto');

// Inventaris asrama yang diperluas (migrasi 075): data aset lengkap, riwayat perawatan/kerusakan/kehilangan, pemeriksaan bulanan
// oleh musyrif, dan dashboard aset per asrama. Melengkapi daftar barang sederhana di Kelola Asrama (tabel dormitory_inventory
// yang sama). Musyrif hanya mengelola asrama yang dipegangnya; admin semua.

const KATEGORI = Object.freeze({ elektronik: 'Elektronik', furnitur: 'Furnitur', 'perlengkapan-tidur': 'Perlengkapan tidur', kebersihan: 'Kebersihan', dapur: 'Dapur', ac: 'AC dan pendingin', lainnya: 'Lainnya' });
const AWALAN = Object.freeze({ elektronik: 'ELK', furnitur: 'FRN', 'perlengkapan-tidur': 'TDR', kebersihan: 'BRS', dapur: 'DPR', ac: 'AC', lainnya: 'LNN' });
const KONDISI = Object.freeze({ baik: 'Baik', perawatan: 'Perlu perawatan', rusak: 'Rusak', hilang: 'Hilang' });
const KEJADIAN = Object.freeze({ pembelian: 'Pembelian', perawatan: 'Perawatan', kerusakan: 'Kerusakan', perbaikan: 'Perbaikan', kehilangan: 'Kehilangan', temuan: 'Ditemukan kembali', catatan: 'Catatan' });
// Sumber dana dan pemilik barang (migrasi 081). Barang pribadi santri dicatat terpisah dan tidak dihitung sebagai nilai aset.
const SUMBER_DANA = Object.freeze({ hamasah: 'Dana Hamasah', 'kas-asrama': 'Kas asrama', patungan: 'Patungan santri', donasi: 'Donasi atau hibah', pribadi: 'Milik pribadi santri', lainnya: 'Lainnya' });
const PEMILIK = Object.freeze({ asrama: 'Aset asrama', santri: 'Barang pribadi santri' });
// Kejadian yang sekaligus mengubah kondisi aset.
const UBAH_KONDISI = Object.freeze({ kerusakan: 'rusak', kehilangan: 'hilang', perbaikan: 'baik', temuan: 'baik' });
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk inventaris. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;

function tabelBelumAda(error) {
  if (!error) return false;
  if (['42P01', '42703'].includes(error.code)) return true;
  return /(inventory_|dormitory_inventory|dormitory_ac)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
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

function createInventoryService({ database, staffDormitories, now = () => new Date() } = {}) {
  if (!database || typeof staffDormitories !== 'function') throw new Error('createInventoryService membutuhkan database dan staffDormitories.');

  async function tulis(fn) {
    try { return await fn(); } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  const staf = (actor) => Boolean(actor && ['admin', 'supervisor'].includes(actor.role));
  const TOLAK = { ok: false, status: 403, error: 'Hanya admin dan musyrif yang mengelola inventaris.' };
  const hariIni = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now());

  async function batas(actor) {
    return actor.role === 'admin' ? null : ((await staffDormitories(actor.id)) || []);
  }

  async function bolehAsrama(dormitoryId, actor) {
    if (!staf(actor)) return TOLAK;
    if (!UUID.test(String(dormitoryId))) return { ok: false, status: 404, error: 'Asrama tidak ditemukan.' };
    const b = await batas(actor);
    if (b !== null && !b.includes(dormitoryId)) return { ok: false, status: 403, error: 'Asrama ini bukan asrama yang Anda pegang.' };
    const ada = await database.query('SELECT name FROM dormitories WHERE id = $1', [dormitoryId]);
    if (!ada.rows.length) return { ok: false, status: 404, error: 'Asrama tidak ditemukan.' };
    return { ok: true, name: ada.rows[0].name };
  }

  async function berkas(fileId, dormitoryId) {
    if (fileId === undefined || fileId === null || fileId === '') return null;
    if (!UUID.test(String(fileId))) return false;
    const rows = (await database.query(`SELECT id FROM file_objects WHERE id = $1 AND purpose = 'inventory-file' AND entity_id = $2 AND status = 'ready'`, [fileId, String(dormitoryId)])).rows;
    return rows.length ? rows[0].id : false;
  }

  async function listDormitories(actor) {
    if (!staf(actor)) return TOLAK;
    const b = await batas(actor);
    const { rows } = await database.query('SELECT id, name FROM dormitories WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[])) ORDER BY name', [b]);
    return { ok: true, value: { items: rows, categories: Object.entries(KATEGORI).map(([id, label]) => ({ id, label })), conditions: Object.entries(KONDISI).map(([id, label]) => ({ id, label })), eventKinds: Object.entries(KEJADIAN).map(([id, label]) => ({ id, label })), fundingSources: Object.entries(SUMBER_DANA).map(([id, label]) => ({ id, label })), ownerTypes: Object.entries(PEMILIK).map(([id, label]) => ({ id, label })) } };
  }

  // ------------------------------------------------------------------ aset

  function bentuk(r) {
    return {
      id: r.id, dormitoryId: r.dormitory_id, code: r.code || '', name: r.name, category: r.category, categoryLabel: KATEGORI[r.category] || r.category, location: r.location || '',
      quantity: Number(r.quantity), condition: r.condition, conditionLabel: KONDISI[r.condition] || r.condition, note: r.note || '', purchasedOn: r.purchased_on_text || null,
      unitPrice: r.unit_price_rupiah === null || r.unit_price_rupiah === undefined ? null : Number(r.unit_price_rupiah), value: r.unit_price_rupiah === null || r.unit_price_rupiah === undefined ? null : Number(r.unit_price_rupiah) * Number(r.quantity),
      photoFileId: r.photo_file_id || null, proofFileId: r.proof_file_id || null, events: r.event_count === undefined ? undefined : Number(r.event_count), updatedAt: iso(r.updated_at),
      fundingSource: r.funding_source || '', fundingSourceLabel: SUMBER_DANA[r.funding_source] || 'Belum diisi',
      ownerType: r.owner_type || 'asrama', ownerTypeLabel: PEMILIK[r.owner_type || 'asrama'], ownerStudentId: r.owner_student_id || null, ownerStudentName: r.owner_student_name || null
    };
  }

  const SELECT = `SELECT i.*, to_char(i.purchased_on, 'YYYY-MM-DD') AS purchased_on_text, (SELECT count(*) FROM inventory_events e WHERE e.item_id = i.id) AS event_count,
                         (SELECT s.name FROM students s WHERE s.id = i.owner_student_id) AS owner_student_name FROM dormitory_inventory i`;

  async function listItems(dormitoryId, actor, { q, category, condition, owner } = {}) {
    const izin = await bolehAsrama(dormitoryId, actor);
    if (!izin.ok) return izin;
    return tulis(async () => {
      const { rows } = await database.query(
        `${SELECT} WHERE i.dormitory_id = $1 AND i.archived_at IS NULL AND ($2::text IS NULL OR i.name ILIKE $2 OR i.code ILIKE $2 OR i.location ILIKE $2)
            AND ($3::text IS NULL OR i.category = $3) AND ($4::text IS NULL OR i.condition = $4) AND ($5::text IS NULL OR i.owner_type = $5) ORDER BY i.owner_type, i.category, i.name`,
        [dormitoryId, q ? `%${rapi(q, 60).replace(/[%_]/g, '')}%` : null, KATEGORI[category] ? category : null, KONDISI[condition] ? condition : null, PEMILIK[owner] ? owner : null]
      );
      const items = rows.map(bentuk);
      // Nilai, rusak, dan hilang dihitung dari aset asrama saja; barang pribadi santri hanya dijumlah terpisah.
      const aset = items.filter((i) => i.ownerType === 'asrama');
      // Penghuni aktif, untuk memilih pemilik barang pribadi di formulir aset.
      const residents = (await database.query(`SELECT id, name FROM students WHERE dormitory_id = $1 AND status IN ('active', 'leave') ORDER BY name`, [dormitoryId])).rows;
      return { ok: true, value: { available: true, dormitory: { id: dormitoryId, name: izin.name }, items, residents, totals: { count: aset.length, quantity: aset.reduce((n, i) => n + i.quantity, 0), value: aset.reduce((n, i) => n + (i.value || 0), 0), damaged: aset.filter((i) => i.condition === 'rusak').reduce((n, i) => n + i.quantity, 0), lost: aset.filter((i) => i.condition === 'hilang').reduce((n, i) => n + i.quantity, 0), personal: items.length - aset.length } } };
    });
  }

  async function kodeBaru(dormitoryId, kategori) {
    const awalan = AWALAN[kategori];
    const { rows } = await database.query('SELECT code FROM dormitory_inventory WHERE dormitory_id = $1 AND code LIKE $2', [dormitoryId, `${awalan}-%`]);
    const terbesar = rows.reduce((n, r) => Math.max(n, Number(String(r.code).split('-').pop()) || 0), 0);
    return `${awalan}-${String(terbesar + 1).padStart(3, '0')}`;
  }

  async function periksaInput(dormitoryId, input, lama = null) {
    const s = input || {};
    const ambil = (kunci, bawaan) => (s[kunci] === undefined ? bawaan : s[kunci]);
    const name = rapi(ambil('name', lama && lama.name), 80);
    const quantity = Number(ambil('quantity', lama && lama.quantity));
    const kondisi = ambil('condition', lama ? lama.condition : 'baik');
    const kategori = ambil('category', lama ? lama.category : 'lainnya');
    if (name.length < 2) return { ok: false, error: 'Nama aset minimal 2 huruf.' };
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000) return { ok: false, error: 'Jumlah aset tidak valid.' };
    if (!KONDISI[kondisi]) return { ok: false, error: 'Kondisi aset tidak dikenal.' };
    if (!KATEGORI[kategori]) return { ok: false, error: 'Kategori aset tidak dikenal.' };
    const tanggal = ambil('purchasedOn', lama ? lama.purchased_on_text : null) || null;
    if (tanggal && (!tanggalValid(tanggal) || tanggal > hariIni())) return { ok: false, error: 'Tanggal pembelian tidak valid atau di masa depan.' };
    const harga = ambil('unitPrice', lama ? lama.unit_price_rupiah : null);
    const hargaAngka = harga === null || harga === '' || harga === undefined ? null : Math.round(Number(harga));
    if (hargaAngka !== null && (!Number.isFinite(hargaAngka) || hargaAngka < 0)) return { ok: false, error: 'Harga satuan tidak valid.' };
    const foto = await berkas(ambil('photoFileId', lama ? lama.photo_file_id : null), dormitoryId);
    const bukti = await berkas(ambil('proofFileId', lama ? lama.proof_file_id : null), dormitoryId);
    if (foto === false || bukti === false) return { ok: false, error: 'Berkas foto atau bukti pembelian tidak ditemukan untuk asrama ini.' };
    const kode = rapi(ambil('code', lama ? lama.code : ''), 30).toUpperCase();
    const pemilik = ambil('ownerType', lama ? lama.owner_type : 'asrama') || 'asrama';
    if (!PEMILIK[pemilik]) return { ok: false, error: 'Pemilik barang tidak dikenal.' };
    let pemilikSantri = null;
    if (pemilik === 'santri') {
      pemilikSantri = rapi(ambil('ownerStudentId', lama ? lama.owner_student_id : null), 64);
      if (!UUID.test(pemilikSantri)) return { ok: false, error: 'Pilih santri pemilik barang pribadi.' };
      const ada = (await database.query(`SELECT 1 FROM students WHERE id = $1 AND dormitory_id = $2 AND status IN ('active', 'leave')`, [pemilikSantri, dormitoryId])).rows.length;
      if (!ada) return { ok: false, error: 'Santri pemilik bukan penghuni aktif asrama ini.' };
    }
    const sumber = ambil('fundingSource', lama ? lama.funding_source : '') || (pemilik === 'santri' ? 'pribadi' : '');
    if (sumber && !SUMBER_DANA[sumber]) return { ok: false, error: 'Sumber dana tidak dikenal.' };
    return { ok: true, value: { name, quantity, condition: kondisi, category: kategori, location: rapi(ambil('location', lama ? lama.location : ''), 80), note: rapi(ambil('note', lama ? lama.note : ''), 200), purchasedOn: tanggal, unitPrice: hargaAngka, photoFileId: foto, proofFileId: bukti, code: kode, fundingSource: sumber, ownerType: pemilik, ownerStudentId: pemilikSantri } };
  }

  async function catatKejadian(itemId, jenis, catatan, { biaya = null, tanggal = null, berkasId = null, actor }) {
    await database.query(
      'INSERT INTO inventory_events (id, item_id, kind, note, cost_rupiah, occurred_on, file_id, recorded_by_account_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [crypto.randomUUID(), itemId, jenis, rapi(catatan, 500).padEnd(3, '.'), biaya, tanggal || hariIni(), berkasId, actor && actor.id ? actor.id : null, now()]
    );
  }

  async function createItem(dormitoryId, input, actor) {
    const izin = await bolehAsrama(dormitoryId, actor);
    if (!izin.ok) return izin;
    return tulis(async () => {
      const v = await periksaInput(dormitoryId, input);
      if (!v.ok) return v;
      const kode = v.value.code || await kodeBaru(dormitoryId, v.value.category);
      const dupe = await database.query(`SELECT 1 FROM dormitory_inventory WHERE dormitory_id = $1 AND code = $2 AND archived_at IS NULL`, [dormitoryId, kode]);
      if (dupe.rows.length) return { ok: false, status: 409, error: `Kode aset ${kode} sudah dipakai di asrama ini.` };
      const id = crypto.randomUUID();
      await database.query(
        `INSERT INTO dormitory_inventory (id, dormitory_id, name, quantity, condition, note, code, category, location, purchased_on, unit_price_rupiah, photo_file_id, proof_file_id, updated_by_account_id, funding_source, owner_type, owner_student_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [id, dormitoryId, v.value.name, v.value.quantity, v.value.condition, v.value.note, kode, v.value.category, v.value.location, v.value.purchasedOn, v.value.unitPrice, v.value.photoFileId, v.value.proofFileId, actor.id || null, v.value.fundingSource, v.value.ownerType, v.value.ownerStudentId]
      );
      if (v.value.purchasedOn) await catatKejadian(id, 'pembelian', `Aset dicatat: ${v.value.quantity} unit ${v.value.name}.`, { biaya: v.value.unitPrice === null ? null : v.value.unitPrice * v.value.quantity, tanggal: v.value.purchasedOn, berkasId: v.value.proofFileId, actor });
      return { ok: true, value: bentuk((await database.query(`${SELECT} WHERE i.id = $1`, [id])).rows[0]) };
    });
  }

  async function updateItem(dormitoryId, itemId, input, actor) {
    const izin = await bolehAsrama(dormitoryId, actor);
    if (!izin.ok) return izin;
    if (!UUID.test(String(itemId))) return { ok: false, status: 404, error: 'Aset tidak ditemukan.' };
    return tulis(async () => {
      const lama = (await database.query(`${SELECT} WHERE i.id = $1 AND i.dormitory_id = $2 AND i.archived_at IS NULL`, [itemId, dormitoryId])).rows[0];
      if (!lama) return { ok: false, status: 404, error: 'Aset tidak ditemukan.' };
      const v = await periksaInput(dormitoryId, input, lama);
      if (!v.ok) return v;
      const kode = v.value.code || lama.code || await kodeBaru(dormitoryId, v.value.category);
      const dupe = await database.query(`SELECT 1 FROM dormitory_inventory WHERE dormitory_id = $1 AND code = $2 AND id <> $3 AND archived_at IS NULL`, [dormitoryId, kode, itemId]);
      if (dupe.rows.length) return { ok: false, status: 409, error: `Kode aset ${kode} sudah dipakai di asrama ini.` };
      await database.query(
        `UPDATE dormitory_inventory SET name = $3, quantity = $4, condition = $5, note = $6, code = $7, category = $8, location = $9, purchased_on = $10, unit_price_rupiah = $11,
                photo_file_id = $12, proof_file_id = $13, updated_by_account_id = $14, funding_source = $15, owner_type = $16, owner_student_id = $17, updated_at = now() WHERE id = $1 AND dormitory_id = $2`,
        [itemId, dormitoryId, v.value.name, v.value.quantity, v.value.condition, v.value.note, kode, v.value.category, v.value.location, v.value.purchasedOn, v.value.unitPrice, v.value.photoFileId, v.value.proofFileId, actor.id || null, v.value.fundingSource, v.value.ownerType, v.value.ownerStudentId]
      );
      // Perubahan kondisi tercatat otomatis di riwayat aset.
      if (lama.condition !== v.value.condition) {
        const jenis = { rusak: 'kerusakan', hilang: 'kehilangan', baik: lama.condition === 'perawatan' ? 'perawatan' : 'perbaikan', perawatan: 'perawatan' }[v.value.condition];
        await catatKejadian(itemId, jenis, `Kondisi berubah dari ${KONDISI[lama.condition]} menjadi ${KONDISI[v.value.condition]}.${rapi(input && input.eventNote, 300) ? ` ${rapi(input.eventNote, 300)}` : ''}`, { actor });
      }
      return { ok: true, value: bentuk((await database.query(`${SELECT} WHERE i.id = $1`, [itemId])).rows[0]) };
    });
  }

  // Aset tidak dihapus: diarsipkan dengan alasan, riwayatnya tetap tersimpan.
  async function archiveItem(dormitoryId, itemId, input, actor) {
    const izin = await bolehAsrama(dormitoryId, actor);
    if (!izin.ok) return izin;
    if (!UUID.test(String(itemId))) return { ok: false, status: 404, error: 'Aset tidak ditemukan.' };
    const alasan = rapi(input && input.reason, 300);
    if (alasan.length < 5) return { ok: false, error: 'Tulis alasan pengarsipan (minimal 5 karakter).' };
    return tulis(async () => {
      const item = (await database.query('SELECT id, code, name FROM dormitory_inventory WHERE id = $1 AND dormitory_id = $2 AND archived_at IS NULL', [itemId, dormitoryId])).rows[0];
      if (!item) return { ok: false, status: 404, error: 'Aset tidak ditemukan.' };
      await catatKejadian(itemId, 'catatan', `Aset diarsipkan: ${alasan}`, { actor });
      await database.query('UPDATE dormitory_inventory SET archived_at = $2, updated_by_account_id = $3, updated_at = now() WHERE id = $1', [itemId, now(), actor.id || null]);
      return { ok: true, value: { id: itemId, code: item.code, archived: true } };
    });
  }

  async function addEvent(dormitoryId, itemId, input, actor) {
    const izin = await bolehAsrama(dormitoryId, actor);
    if (!izin.ok) return izin;
    const s = input || {};
    if (!KEJADIAN[s.kind]) return { ok: false, error: 'Jenis kejadian tidak dikenal.' };
    const catatan = rapi(s.note, 500);
    if (catatan.length < 3) return { ok: false, error: 'Tulis keterangan kejadian (minimal 3 karakter).' };
    const tanggal = s.occurredOn || hariIni();
    if (!tanggalValid(tanggal) || tanggal > hariIni()) return { ok: false, error: 'Tanggal kejadian tidak valid atau di masa depan.' };
    const biaya = s.costRupiah === undefined || s.costRupiah === null || s.costRupiah === '' ? null : Math.round(Number(s.costRupiah));
    if (biaya !== null && (!Number.isFinite(biaya) || biaya < 0)) return { ok: false, error: 'Biaya tidak valid.' };
    if (!UUID.test(String(itemId))) return { ok: false, status: 404, error: 'Aset tidak ditemukan.' };
    return tulis(async () => {
      const item = (await database.query('SELECT condition FROM dormitory_inventory WHERE id = $1 AND dormitory_id = $2 AND archived_at IS NULL', [itemId, dormitoryId])).rows[0];
      if (!item) return { ok: false, status: 404, error: 'Aset tidak ditemukan.' };
      const berkasId = await berkas(s.fileId, dormitoryId);
      if (berkasId === false) return { ok: false, error: 'Berkas tidak ditemukan untuk asrama ini.' };
      await catatKejadian(itemId, s.kind, catatan, { biaya, tanggal, berkasId, actor });
      if (UBAH_KONDISI[s.kind] && UBAH_KONDISI[s.kind] !== item.condition) {
        await database.query('UPDATE dormitory_inventory SET condition = $2, updated_by_account_id = $3, updated_at = now() WHERE id = $1', [itemId, UBAH_KONDISI[s.kind], actor.id || null]);
      }
      return { ok: true, value: bentuk((await database.query(`${SELECT} WHERE i.id = $1`, [itemId])).rows[0]) };
    });
  }

  async function listEvents(dormitoryId, itemId, actor) {
    const izin = await bolehAsrama(dormitoryId, actor);
    if (!izin.ok) return izin;
    if (!UUID.test(String(itemId))) return { ok: false, status: 404, error: 'Aset tidak ditemukan.' };
    return tulis(async () => {
      const item = (await database.query(`${SELECT} WHERE i.id = $1 AND i.dormitory_id = $2`, [itemId, dormitoryId])).rows[0];
      if (!item) return { ok: false, status: 404, error: 'Aset tidak ditemukan.' };
      const { rows } = await database.query(
        `SELECT e.*, to_char(e.occurred_on, 'YYYY-MM-DD') AS occurred_on_text, a.name AS actor_name FROM inventory_events e LEFT JOIN accounts a ON a.id = e.recorded_by_account_id WHERE e.item_id = $1 ORDER BY e.occurred_on DESC, e.created_at DESC LIMIT 100`, [itemId]
      );
      return { ok: true, value: { item: bentuk(item), events: rows.map((e) => ({ id: e.id, kind: e.kind, kindLabel: KEJADIAN[e.kind], note: e.note, cost: e.cost_rupiah === null ? null : Number(e.cost_rupiah), occurredOn: e.occurred_on_text, fileId: e.file_id || null, by: e.actor_name || null })) } };
    });
  }

  // ------------------------------------------------------------------ pemeriksaan bulanan

  function bentukPeriksa(c, items) {
    return {
      id: c.id, dormitoryId: c.dormitory_id, month: c.month, status: c.status, statusLabel: c.status === 'selesai' ? 'Selesai' : 'Sedang berjalan', note: c.note || '', completedAt: iso(c.completed_at), proofFileId: c.proof_file_id || null,
      items: items.map((i) => ({ itemId: i.item_id, code: i.code || '', name: i.name, location: i.location || '', expectedQuantity: i.expected_quantity, expectedCondition: i.expected_condition, expectedConditionLabel: KONDISI[i.expected_condition], foundQuantity: i.found_quantity === null ? null : Number(i.found_quantity), foundCondition: i.found_condition || null, note: i.note || '' })),
      checked: items.filter((i) => i.found_quantity !== null).length, total: items.length
    };
  }

  async function muatPeriksa(checkId) {
    const c = (await database.query('SELECT * FROM inventory_checks WHERE id = $1', [checkId])).rows[0];
    if (!c) return null;
    const items = (await database.query(
      `SELECT ci.*, i.code, i.name, i.location FROM inventory_check_items ci JOIN dormitory_inventory i ON i.id = ci.item_id WHERE ci.check_id = $1 ORDER BY i.category, i.name`, [checkId]
    )).rows;
    return { c, items };
  }

  async function startCheck(dormitoryId, bulan, actor) {
    const izin = await bolehAsrama(dormitoryId, actor);
    if (!izin.ok) return izin;
    if (!BULAN.test(String(bulan)) || bulan > hariIni().slice(0, 7)) return { ok: false, error: 'Bulan pemeriksaan tidak valid.' };
    return tulis(async () => {
      let c = (await database.query('SELECT * FROM inventory_checks WHERE dormitory_id = $1 AND month = $2', [dormitoryId, bulan])).rows[0];
      if (!c) {
        const id = crypto.randomUUID();
        await database.query('INSERT INTO inventory_checks (id, dormitory_id, month, started_by_account_id, started_at) VALUES ($1, $2, $3, $4, $5)', [id, dormitoryId, bulan, actor.id || null, now()]);
        await database.query(
          `INSERT INTO inventory_check_items (check_id, item_id, expected_quantity, expected_condition) SELECT $1, id, quantity, condition FROM dormitory_inventory WHERE dormitory_id = $2 AND archived_at IS NULL`, [id, dormitoryId]
        );
        c = { id };
      }
      const { c: baris, items } = await muatPeriksa(c.id);
      return { ok: true, value: bentukPeriksa(baris, items) };
    });
  }

  async function getCheck(dormitoryId, bulan, actor) {
    const izin = await bolehAsrama(dormitoryId, actor);
    if (!izin.ok) return izin;
    return tulis(async () => {
      const c = (await database.query('SELECT id FROM inventory_checks WHERE dormitory_id = $1 AND month = $2', [dormitoryId, BULAN.test(String(bulan)) ? bulan : '0000-00'])).rows[0];
      if (!c) return { ok: true, value: null };
      const { c: baris, items } = await muatPeriksa(c.id);
      return { ok: true, value: bentukPeriksa(baris, items) };
    });
  }

  async function periksaPemeriksaan(checkId, actor) {
    if (!UUID.test(String(checkId))) return { ok: false, status: 404, error: 'Pemeriksaan tidak ditemukan.' };
    const c = (await database.query('SELECT * FROM inventory_checks WHERE id = $1', [checkId])).rows[0];
    if (!c) return { ok: false, status: 404, error: 'Pemeriksaan tidak ditemukan.' };
    const izin = await bolehAsrama(c.dormitory_id, actor);
    if (!izin.ok) return izin.status === 403 ? { ok: false, status: 404, error: 'Pemeriksaan tidak ditemukan.' } : izin;
    return { ok: true, check: c };
  }

  async function saveCheck(checkId, input, actor) {
    const izin = await periksaPemeriksaan(checkId, actor);
    if (!izin.ok) return izin;
    if (izin.check.status === 'selesai') return { ok: false, status: 409, error: 'Pemeriksaan ini sudah selesai.' };
    const daftar = Array.isArray(input && input.entries) ? input.entries : [];
    if (!daftar.length) return { ok: false, error: 'Tidak ada hasil pemeriksaan yang dikirim.' };
    for (const e of daftar) {
      if (!e || !UUID.test(String(e.itemId))) return { ok: false, error: 'Setiap baris butuh itemId.' };
      if (!Number.isInteger(Number(e.foundQuantity)) || Number(e.foundQuantity) < 0 || Number(e.foundQuantity) > 100000) return { ok: false, error: 'Jumlah yang ditemukan harus bilangan bulat tidak negatif.' };
      if (!KONDISI[e.foundCondition]) return { ok: false, error: 'Kondisi yang ditemukan tidak dikenal.' };
      if (e.foundCondition === 'hilang' && Number(e.foundQuantity) > 0) return { ok: false, error: 'Aset yang hilang tidak mungkin ditemukan dalam jumlah lebih dari nol.' };
    }
    return tulis(async () => {
      let tersimpan = 0;
      for (const e of daftar) {
        const { rowCount } = await database.query(
          'UPDATE inventory_check_items SET found_quantity = $3, found_condition = $4, note = $5 WHERE check_id = $1 AND item_id = $2', [checkId, e.itemId, Number(e.foundQuantity), e.foundCondition, rapi(e.note, 300)]
        );
        tersimpan += rowCount || 0;
      }
      const { c, items } = await muatPeriksa(checkId);
      return { ok: true, value: { saved: tersimpan, ...bentukPeriksa(c, items) } };
    });
  }

  // Menyelesaikan pemeriksaan: semua aset harus sudah diperiksa dan foto bukti pemeriksaan wajib dilampirkan (notulen rapat);
  // selisih jumlah dan kondisi diterapkan ke aset dan tercatat di riwayatnya.
  async function completeCheck(checkId, input, actor) {
    const izin = await periksaPemeriksaan(checkId, actor);
    if (!izin.ok) return izin;
    if (izin.check.status === 'selesai') return { ok: false, status: 409, error: 'Pemeriksaan ini sudah selesai.' };
    return tulis(async () => {
      const { items } = await muatPeriksa(checkId);
      const belum = items.filter((i) => i.found_quantity === null);
      if (belum.length) return { ok: false, status: 409, error: `${belum.length} aset belum diperiksa: ${belum.slice(0, 5).map((i) => i.name).join(', ')}${belum.length > 5 ? ', ...' : ''}.` };
      const foto = await berkas(input && input.proofFileId, izin.check.dormitory_id);
      if (!foto) return { ok: false, error: 'Lampirkan foto bukti pemeriksaan (misalnya foto ruangan atau barang yang diperiksa) sebelum menyelesaikan.' };
      let disesuaikan = 0;
      for (const i of items) {
        const jumlahBeda = Number(i.found_quantity) !== Number(i.expected_quantity);
        const kondisiBeda = i.found_condition !== i.expected_condition;
        if (!jumlahBeda && !kondisiBeda) continue;
        disesuaikan += 1;
        await database.query('UPDATE dormitory_inventory SET quantity = $2, condition = $3, updated_by_account_id = $4, updated_at = now() WHERE id = $1', [i.item_id, Number(i.found_quantity), i.found_condition, actor.id || null]);
        const label = `Pemeriksaan ${izin.check.month}`;
        if (jumlahBeda) {
          const kurang = Number(i.found_quantity) < Number(i.expected_quantity);
          await catatKejadian(i.item_id, kurang ? 'kehilangan' : 'temuan', `${label}: ditemukan ${i.found_quantity} dari ${i.expected_quantity} yang tercatat.${i.note ? ` ${i.note}` : ''}`, { actor });
        }
        if (kondisiBeda && i.found_condition !== 'hilang') {
          const jenis = { rusak: 'kerusakan', baik: 'perbaikan', perawatan: 'perawatan' }[i.found_condition];
          await catatKejadian(i.item_id, jenis, `${label}: kondisi ${KONDISI[i.expected_condition]} menjadi ${KONDISI[i.found_condition]}.${i.note ? ` ${i.note}` : ''}`, { actor });
        }
      }
      await database.query(`UPDATE inventory_checks SET status = 'selesai', note = $2, completed_by_account_id = $3, completed_at = $4, proof_file_id = $5 WHERE id = $1`, [checkId, rapi(input && input.note, 500), actor.id || null, now(), foto]);
      const { c, items: akhir } = await muatPeriksa(checkId);
      return { ok: true, value: { adjusted: disesuaikan, ...bentukPeriksa(c, akhir) } };
    });
  }

  // ------------------------------------------------------------------ dashboard

  async function dashboard(actor) {
    if (!staf(actor)) return TOLAK;
    const b = await batas(actor);
    return tulis(async () => {
      const bulan = hariIni().slice(0, 7);
      const { rows } = await database.query(
        `SELECT d.id, d.name,
                count(i.id)::int AS jumlah_jenis, COALESCE(sum(i.quantity), 0)::int AS jumlah_unit,
                COALESCE(sum(i.unit_price_rupiah * i.quantity), 0)::bigint AS nilai,
                COALESCE(sum(i.quantity) FILTER (WHERE i.condition = 'rusak'), 0)::int AS rusak,
                COALESCE(sum(i.quantity) FILTER (WHERE i.condition = 'hilang'), 0)::int AS hilang,
                COALESCE(sum(i.quantity) FILTER (WHERE i.condition = 'perawatan'), 0)::int AS perawatan,
                (SELECT max(month) FROM inventory_checks c WHERE c.dormitory_id = d.id AND c.status = 'selesai') AS pemeriksaan_terakhir,
                (SELECT status FROM inventory_checks c WHERE c.dormitory_id = d.id AND c.month = $2) AS pemeriksaan_bulan_ini
           FROM dormitories d LEFT JOIN dormitory_inventory i ON i.dormitory_id = d.id AND i.archived_at IS NULL AND i.owner_type = 'asrama'
          WHERE ($1::uuid[] IS NULL OR d.id = ANY($1::uuid[])) GROUP BY d.id, d.name ORDER BY d.name`, [b, bulan]
      );
      const kategori = (await database.query(
        `SELECT i.dormitory_id, i.category, COALESCE(sum(i.quantity), 0)::int AS unit FROM dormitory_inventory i WHERE i.archived_at IS NULL AND i.owner_type = 'asrama' AND ($1::uuid[] IS NULL OR i.dormitory_id = ANY($1::uuid[])) GROUP BY i.dormitory_id, i.category`, [b]
      )).rows;
      const ac = (await database.query(
        `SELECT dormitory_id, count(*) FILTER (WHERE ownership = 'hamasah')::int AS hamasah, count(*) FILTER (WHERE ownership = 'patungan')::int AS patungan FROM dormitory_ac_units WHERE archived_at IS NULL GROUP BY dormitory_id`
      ).catch((error) => { if (tabelBelumAda(error)) return { rows: [] }; throw error; })).rows;
      const items = rows.map((r) => ({
        dormitoryId: r.id, name: r.name, itemTypes: r.jumlah_jenis, units: r.jumlah_unit, value: Number(r.nilai), damaged: r.rusak, lost: r.hilang, maintenance: r.perawatan,
        lastCheck: r.pemeriksaan_terakhir || null, thisMonthCheck: r.pemeriksaan_bulan_ini || null, checkDue: r.pemeriksaan_bulan_ini !== 'selesai',
        byCategory: Object.fromEntries(kategori.filter((k) => k.dormitory_id === r.id).map((k) => [k.category, k.unit])),
        ac: (ac.find((a) => a.dormitory_id === r.id) || { hamasah: 0, patungan: 0 })
      }));
      return { ok: true, value: { available: true, month: bulan, items, totals: { units: items.reduce((n, i) => n + i.units, 0), value: items.reduce((n, i) => n + i.value, 0), damaged: items.reduce((n, i) => n + i.damaged, 0), lost: items.reduce((n, i) => n + i.lost, 0), checkDue: items.filter((i) => i.checkDue).length } } };
    });
  }

  return { listDormitories, listItems, createItem, updateItem, archiveItem, addEvent, listEvents, startCheck, getCheck, saveCheck, completeCheck, dashboard };
}

module.exports = { createInventoryService, KATEGORI, KONDISI };
