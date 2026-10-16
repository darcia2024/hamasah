'use strict';

const crypto = require('node:crypto');

// Kelola Asrama (16 Oktober 2026): jadwal kegiatan rutin, agenda acara, piket, uang kas dan
// iuran santri, serta inventaris per asrama.
//
// Pengelola: musyrif untuk asrama yang dipegangnya, admin untuk semua asrama.
// Pembaca keluarga: santri dan wali melihat jadwal, agenda, dan piket asrama ananda.
// Kas dan inventaris tidak pernah dibuka untuk keluarga.
//
// Tabel dari migrasi 050. Kode ini boleh online lebih dulu: selama tabel belum ada,
// pembacaan mengembalikan tersedia: false dan penyimpanan dibalas 409 dengan arahan ke
// halaman Pengaturan (pola yang sama dengan student-life-service.js).

const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk Kelola Asrama. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';
const KONDISI = Object.freeze(['baik', 'rusak', 'hilang']);
const ARAH = Object.freeze(['masuk', 'keluar']);
const HARI = Object.freeze(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Ahad']);
const MAKS_RUPIAH = 1_000_000_000;
const AGENDA_KE_DEPAN_HARI = 45;

function tabelBelumAda(error) {
  if (!error) return false;
  if (error.code === '42P01') return true;
  return /dormitory_(schedule|duties|duty_assignments|cash_entries|dues|inventory)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function bersih(value, max = 200) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function tanggalJakarta(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
}

function geser(isoDate, hari) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

function isTanggal(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
}

function jam(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const m = s.match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined;
}

function teksJam(v) {
  return v ? String(v).slice(0, 5) : null;
}

function teksTanggal(v) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

function iso(v) {
  return v instanceof Date ? v.toISOString() : (v ? new Date(v).toISOString() : null);
}

function createDormitoryManagementService({ database, staffDormitories, listStudentsForActor, now = () => new Date() } = {}) {
  if (!database || typeof staffDormitories !== 'function' || typeof listStudentsForActor !== 'function') {
    throw new Error('createDormitoryManagementService membutuhkan database, staffDormitories, dan listStudentsForActor.');
  }

  async function ambil(sql, params = []) {
    return (await database.query(sql, params)).rows;
  }

  async function baca(fn, kosong) {
    try {
      return await fn();
    } catch (error) {
      if (tabelBelumAda(error)) return kosong;
      throw error;
    }
  }

  async function tulis(fn) {
    try {
      return await fn();
    } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  // ------------------------------------------------------------- hak akses
  async function asramaDikelola(actor) {
    if (!actor) return [];
    if (actor.role === 'admin') {
      return ambil('SELECT id, name, area, gender FROM dormitories ORDER BY gender, name');
    }
    if (actor.role !== 'supervisor') return [];
    const ids = (await staffDormitories(actor.id)).map(String);
    if (!ids.length) return [];
    return ambil('SELECT id, name, area, gender FROM dormitories WHERE id::text = ANY($1::text[]) ORDER BY name', [ids]);
  }

  async function bolehKelola(dormitoryId, actor) {
    const daftar = await asramaDikelola(actor);
    const asrama = daftar.find((d) => String(d.id) === String(dormitoryId));
    if (asrama) return { ok: true, asrama };
    const ada = (await ambil('SELECT 1 FROM dormitories WHERE id::text = $1', [String(dormitoryId)])).length > 0;
    return ada ? { ok: false, status: 403, error: 'Asrama ini bukan asrama yang Anda pegang.' } : { ok: false, status: 404, error: 'Asrama tidak ditemukan.' };
  }

  async function santriAsrama(dormitoryId) {
    return ambil(`SELECT id, name FROM students WHERE dormitory_id = $1 AND status = 'active' ORDER BY name`, [dormitoryId]);
  }

  // ------------------------------------------------------------- jadwal
  function barisJadwal(row) {
    return {
      id: row.id,
      kind: row.kind,
      dayOfWeek: row.day_of_week === null ? null : Number(row.day_of_week),
      date: teksTanggal(row.event_date),
      startTime: teksJam(row.start_time),
      endTime: teksJam(row.end_time),
      title: row.title,
      location: row.location,
      note: row.note
    };
  }

  async function jadwal(dormitoryIds, { dariTanggal = null } = {}) {
    const rows = await ambil(
      `SELECT id, dormitory_id, kind, day_of_week, event_date, start_time, end_time, title, location, note
         FROM dormitory_schedule
        WHERE dormitory_id::text = ANY($1::text[])
          AND (kind = 'rutin' OR $2::date IS NULL OR event_date >= $2::date)
        ORDER BY kind, day_of_week NULLS LAST, event_date NULLS LAST, start_time NULLS FIRST, title`,
      [dormitoryIds.map(String), dariTanggal]
    );
    return rows.map((row) => ({ ...barisJadwal(row), dormitoryId: row.dormitory_id }));
  }

  function validasiJadwal(input) {
    const s = input || {};
    const kind = s.kind === 'acara' ? 'acara' : 'rutin';
    const title = bersih(s.title, 120);
    if (title.length < 3) return { ok: false, error: 'Nama kegiatan minimal 3 huruf.' };
    const startTime = jam(s.startTime);
    const endTime = jam(s.endTime);
    if (startTime === undefined || endTime === undefined) return { ok: false, error: 'Format jam tidak valid. Gunakan JJ:MM, misal 05:30.' };
    if (startTime && endTime && endTime <= startTime) return { ok: false, error: 'Jam selesai harus setelah jam mulai.' };
    const nilai = { kind, title, startTime, endTime, location: bersih(s.location, 80), note: bersih(s.note, 300), dayOfWeek: null, date: null };
    if (kind === 'rutin') {
      const hari = Number(s.dayOfWeek);
      if (!Number.isInteger(hari) || hari < 1 || hari > 7) return { ok: false, error: 'Pilih hari kegiatan.' };
      nilai.dayOfWeek = hari;
    } else {
      if (!isTanggal(s.date)) return { ok: false, error: 'Pilih tanggal acara.' };
      nilai.date = String(s.date);
    }
    return { ok: true, value: nilai };
  }

  async function addSchedule(dormitoryId, input, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    const v = validasiJadwal(input);
    if (!v.ok) return v;
    return tulis(async () => {
      const id = crypto.randomUUID();
      const [row] = await ambil(
        `INSERT INTO dormitory_schedule (id, dormitory_id, kind, day_of_week, event_date, start_time, end_time, title, location, note, created_by_account_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [id, dormitoryId, v.value.kind, v.value.dayOfWeek, v.value.date, v.value.startTime, v.value.endTime, v.value.title, v.value.location, v.value.note, actor.id || null]
      );
      return { ok: true, value: barisJadwal(row) };
    });
  }

  async function updateSchedule(dormitoryId, itemId, input, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    const v = validasiJadwal(input);
    if (!v.ok) return v;
    return tulis(async () => {
      const [row] = await ambil(
        `UPDATE dormitory_schedule SET kind = $3, day_of_week = $4, event_date = $5, start_time = $6, end_time = $7, title = $8, location = $9, note = $10, updated_at = now()
          WHERE id::text = $1 AND dormitory_id::text = $2 RETURNING *`,
        [String(itemId), String(dormitoryId), v.value.kind, v.value.dayOfWeek, v.value.date, v.value.startTime, v.value.endTime, v.value.title, v.value.location, v.value.note]
      );
      return row ? { ok: true, value: barisJadwal(row) } : { ok: false, status: 404, error: 'Jadwal tidak ditemukan.' };
    });
  }

  async function deleteSchedule(dormitoryId, itemId, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    return tulis(async () => {
      const rows = await ambil('DELETE FROM dormitory_schedule WHERE id::text = $1 AND dormitory_id::text = $2 RETURNING id', [String(itemId), String(dormitoryId)]);
      return rows.length ? { ok: true, value: { id: itemId } } : { ok: false, status: 404, error: 'Jadwal tidak ditemukan.' };
    });
  }

  // ------------------------------------------------------------- piket
  async function piket(dormitoryIds) {
    const tugas = await ambil(
      `SELECT id, dormitory_id, name, position FROM dormitory_duties WHERE dormitory_id::text = ANY($1::text[]) ORDER BY position, created_at`,
      [dormitoryIds.map(String)]
    );
    const isi = tugas.length ? await ambil(
      `SELECT a.duty_id, a.day_of_week, a.student_id, s.name
         FROM dormitory_duty_assignments a JOIN students s ON s.id = a.student_id
        WHERE a.duty_id::text = ANY($1::text[]) ORDER BY s.name`,
      [tugas.map((t) => String(t.id))]
    ) : [];
    return tugas.map((t) => {
      const days = {};
      for (let hari = 1; hari <= 7; hari += 1) days[hari] = [];
      isi.filter((row) => String(row.duty_id) === String(t.id)).forEach((row) => {
        days[Number(row.day_of_week)].push({ id: row.student_id, name: row.name });
      });
      return { id: t.id, dormitoryId: t.dormitory_id, name: t.name, position: Number(t.position), days };
    });
  }

  async function addDuty(dormitoryId, input, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    const name = bersih(input && input.name, 80);
    if (name.length < 2) return { ok: false, error: 'Nama tugas piket minimal 2 huruf.' };
    return tulis(async () => {
      const [urutan] = await ambil('SELECT coalesce(max(position), 0) + 1 AS berikut FROM dormitory_duties WHERE dormitory_id = $1', [dormitoryId]);
      const id = crypto.randomUUID();
      await ambil('INSERT INTO dormitory_duties (id, dormitory_id, name, position) VALUES ($1, $2, $3, $4)', [id, dormitoryId, name, Number(urutan.berikut)]);
      return { ok: true, value: { id, name } };
    });
  }

  async function deleteDuty(dormitoryId, dutyId, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    return tulis(async () => {
      const rows = await ambil('DELETE FROM dormitory_duties WHERE id::text = $1 AND dormitory_id::text = $2 RETURNING id', [String(dutyId), String(dormitoryId)]);
      return rows.length ? { ok: true, value: { id: dutyId } } : { ok: false, status: 404, error: 'Tugas piket tidak ditemukan.' };
    });
  }

  // Mengganti seluruh pembagian piket asrama: [{ dutyId, day, studentIds }]. Hanya tugas
  // milik asrama ini dan santri aktif asrama ini yang diterima.
  async function setDutyAssignments(dormitoryId, input, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    const daftar = Array.isArray(input && input.assignments) ? input.assignments : null;
    if (!daftar) return { ok: false, error: 'Data pembagian piket tidak valid.' };
    return tulis(async () => {
      const tugas = new Set((await ambil('SELECT id FROM dormitory_duties WHERE dormitory_id = $1', [dormitoryId])).map((r) => String(r.id)));
      const santri = new Set((await santriAsrama(dormitoryId)).map((r) => String(r.id)));
      const baris = [];
      const kunci = new Set();
      for (const a of daftar.slice(0, 500)) {
        const hari = Number(a && a.day);
        if (!tugas.has(String(a && a.dutyId)) || !Number.isInteger(hari) || hari < 1 || hari > 7) return { ok: false, error: 'Ada tugas atau hari piket yang tidak valid.' };
        for (const sid of (Array.isArray(a.studentIds) ? a.studentIds : []).map(String)) {
          if (!santri.has(sid)) return { ok: false, error: 'Ada santri yang bukan penghuni asrama ini.' };
          const k = `${a.dutyId}:${hari}:${sid}`;
          if (!kunci.has(k)) { kunci.add(k); baris.push([String(a.dutyId), hari, sid]); }
        }
      }
      await database.withTransaction(async (tx) => {
        await tx.query('DELETE FROM dormitory_duty_assignments WHERE duty_id::text = ANY($1::text[])', [[...tugas]]);
        for (const [dutyId, hari, sid] of baris) {
          await tx.query('INSERT INTO dormitory_duty_assignments (duty_id, day_of_week, student_id) VALUES ($1, $2, $3)', [dutyId, hari, sid]);
        }
      });
      return { ok: true, value: { assignments: baris.length } };
    });
  }

  // ------------------------------------------------------------- uang kas
  function barisKas(row) {
    return {
      id: row.id,
      date: teksTanggal(row.entry_date),
      direction: row.direction,
      amount: Number(row.amount_rupiah),
      category: row.category,
      note: row.note,
      studentId: row.student_id || null,
      studentName: row.student_name || null,
      period: row.period || null,
      createdAt: iso(row.created_at),
      voided: Boolean(row.voided_at),
      voidReason: row.void_reason || null
    };
  }

  async function kas(dormitoryId, bulan) {
    const [saldo] = await ambil(
      `SELECT coalesce(sum(CASE WHEN direction = 'masuk' THEN amount_rupiah ELSE -amount_rupiah END), 0)::float8 AS saldo
         FROM dormitory_cash_entries WHERE dormitory_id = $1 AND voided_at IS NULL`,
      [dormitoryId]
    );
    const entries = await ambil(
      `SELECT c.*, s.name AS student_name FROM dormitory_cash_entries c LEFT JOIN students s ON s.id = c.student_id
        WHERE c.dormitory_id = $1 AND to_char(c.entry_date, 'YYYY-MM') = $2
        ORDER BY c.entry_date DESC, c.created_at DESC`,
      [dormitoryId, bulan]
    );
    const [iuran] = await ambil('SELECT monthly_amount_rupiah FROM dormitory_dues WHERE dormitory_id = $1', [dormitoryId]);
    const bayar = await ambil(
      `SELECT student_id, sum(amount_rupiah)::float8 AS jumlah FROM dormitory_cash_entries
        WHERE dormitory_id = $1 AND category = 'iuran' AND period = $2 AND voided_at IS NULL AND student_id IS NOT NULL
        GROUP BY student_id`,
      [dormitoryId, bulan]
    );
    const daftar = entries.map(barisKas);
    const aktif = daftar.filter((e) => !e.voided);
    const perSantri = new Map(bayar.map((b) => [String(b.student_id), Number(b.jumlah)]));
    const besaran = iuran ? Number(iuran.monthly_amount_rupiah) : 0;
    const santri = await santriAsrama(dormitoryId);
    return {
      balance: Number(saldo.saldo),
      month: bulan,
      monthIn: aktif.filter((e) => e.direction === 'masuk').reduce((j, e) => j + e.amount, 0),
      monthOut: aktif.filter((e) => e.direction === 'keluar').reduce((j, e) => j + e.amount, 0),
      entries: daftar,
      dues: {
        monthlyAmount: besaran,
        students: santri.map((s) => {
          const dibayar = perSantri.get(String(s.id)) || 0;
          return { id: s.id, name: s.name, paid: dibayar, settled: besaran > 0 ? dibayar >= besaran : dibayar > 0 };
        })
      }
    };
  }

  async function addCash(dormitoryId, input, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    const s = input || {};
    const direction = ARAH.includes(s.direction) ? s.direction : null;
    const amount = Math.round(Number(s.amount));
    const date = isTanggal(s.date) ? String(s.date) : tanggalJakarta(now());
    const category = bersih(s.category, 40).toLowerCase();
    if (!direction) return { ok: false, error: 'Pilih pemasukan atau pengeluaran.' };
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAKS_RUPIAH) return { ok: false, error: 'Jumlah uang tidak valid.' };
    if (date > tanggalJakarta(now())) return { ok: false, error: 'Tanggal tidak boleh di masa depan.' };
    if (category.length < 2) return { ok: false, error: 'Isi kategori, misal iuran, kebersihan, atau konsumsi.' };
    let studentId = null;
    let period = null;
    if (category === 'iuran') {
      if (direction !== 'masuk') return { ok: false, error: 'Iuran selalu pemasukan.' };
      const santri = (await santriAsrama(dormitoryId)).find((r) => String(r.id) === String(s.studentId));
      if (!santri) return { ok: false, error: 'Pilih santri yang membayar iuran.' };
      studentId = santri.id;
      period = /^\d{4}-\d{2}$/.test(String(s.period || '')) ? String(s.period) : date.slice(0, 7);
    }
    return tulis(async () => {
      const id = crypto.randomUUID();
      const [row] = await ambil(
        `INSERT INTO dormitory_cash_entries (id, dormitory_id, entry_date, direction, amount_rupiah, category, note, student_id, period, created_by_account_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [id, dormitoryId, date, direction, amount, category, bersih(s.note, 200), studentId, period, actor.id || null]
      );
      return { ok: true, value: barisKas(row) };
    });
  }

  async function voidCash(dormitoryId, entryId, input, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    const reason = bersih(input && input.reason, 200);
    if (reason.length < 5) return { ok: false, error: 'Tulis alasan pembatalan (minimal 5 huruf).' };
    return tulis(async () => {
      const rows = await ambil(
        `UPDATE dormitory_cash_entries SET voided_at = now(), void_reason = $3, voided_by_account_id = $4
          WHERE id::text = $1 AND dormitory_id::text = $2 AND voided_at IS NULL RETURNING id`,
        [String(entryId), String(dormitoryId), reason, actor.id || null]
      );
      return rows.length ? { ok: true, value: { id: entryId } } : { ok: false, status: 404, error: 'Catatan kas tidak ditemukan atau sudah dibatalkan.' };
    });
  }

  async function setDues(dormitoryId, input, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    const amount = Math.round(Number(input && input.monthlyAmount));
    if (!Number.isFinite(amount) || amount < 0 || amount > MAKS_RUPIAH) return { ok: false, error: 'Besaran iuran tidak valid.' };
    return tulis(async () => {
      await ambil(
        `INSERT INTO dormitory_dues (dormitory_id, monthly_amount_rupiah, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (dormitory_id) DO UPDATE SET monthly_amount_rupiah = EXCLUDED.monthly_amount_rupiah, updated_at = now()`,
        [dormitoryId, amount]
      );
      return { ok: true, value: { monthlyAmount: amount } };
    });
  }

  // ------------------------------------------------------------- inventaris
  function barisBarang(row) {
    return { id: row.id, name: row.name, quantity: Number(row.quantity), condition: row.condition, note: row.note, updatedAt: iso(row.updated_at) };
  }

  function validasiBarang(input) {
    const s = input || {};
    const name = bersih(s.name, 80);
    const quantity = Number(s.quantity);
    if (name.length < 2) return { ok: false, error: 'Nama barang minimal 2 huruf.' };
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000) return { ok: false, error: 'Jumlah barang tidak valid.' };
    const condition = KONDISI.includes(s.condition) ? s.condition : 'baik';
    return { ok: true, value: { name, quantity, condition, note: bersih(s.note, 200) } };
  }

  async function addInventory(dormitoryId, input, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    const v = validasiBarang(input);
    if (!v.ok) return v;
    return tulis(async () => {
      const [row] = await ambil(
        `INSERT INTO dormitory_inventory (id, dormitory_id, name, quantity, condition, note, updated_by_account_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [crypto.randomUUID(), dormitoryId, v.value.name, v.value.quantity, v.value.condition, v.value.note, actor.id || null]
      );
      return { ok: true, value: barisBarang(row) };
    });
  }

  async function updateInventory(dormitoryId, itemId, input, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    const v = validasiBarang(input);
    if (!v.ok) return v;
    return tulis(async () => {
      const [row] = await ambil(
        `UPDATE dormitory_inventory SET name = $3, quantity = $4, condition = $5, note = $6, updated_by_account_id = $7, updated_at = now()
          WHERE id::text = $1 AND dormitory_id::text = $2 AND archived_at IS NULL RETURNING *`,
        [String(itemId), String(dormitoryId), v.value.name, v.value.quantity, v.value.condition, v.value.note, actor.id || null]
      );
      return row ? { ok: true, value: barisBarang(row) } : { ok: false, status: 404, error: 'Barang tidak ditemukan.' };
    });
  }

  async function archiveInventory(dormitoryId, itemId, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    return tulis(async () => {
      const rows = await ambil(
        `UPDATE dormitory_inventory SET archived_at = now(), updated_by_account_id = $3 WHERE id::text = $1 AND dormitory_id::text = $2 AND archived_at IS NULL RETURNING id`,
        [String(itemId), String(dormitoryId), actor.id || null]
      );
      return rows.length ? { ok: true, value: { id: itemId } } : { ok: false, status: 404, error: 'Barang tidak ditemukan.' };
    });
  }

  // ------------------------------------------------------------- baca
  async function list(actor) {
    const daftar = await asramaDikelola(actor);
    if (!actor || !['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Kelola Asrama untuk musyrif dan admin.' };
    return { ok: true, value: { dormitories: daftar.map((d) => ({ id: d.id, name: d.name, area: d.area, gender: d.gender })) } };
  }

  async function overview(dormitoryId, actor, { month } = {}) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    const bulan = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : tanggalJakarta(now()).slice(0, 7);
    const santri = await santriAsrama(dormitoryId);
    const isi = await baca(async () => ({
      tersedia: true,
      schedule: await jadwal([dormitoryId], { dariTanggal: geser(tanggalJakarta(now()), -30) }),
      duties: await piket([dormitoryId]),
      cash: await kas(dormitoryId, bulan),
      inventory: (await ambil(
        `SELECT * FROM dormitory_inventory WHERE dormitory_id = $1 AND archived_at IS NULL ORDER BY name`,
        [dormitoryId]
      )).map(barisBarang)
    }), { tersedia: false, schedule: [], duties: [], cash: null, inventory: [] });
    return {
      ok: true,
      value: {
        ...isi,
        today: tanggalJakarta(now()),
        dormitory: { id: izin.asrama.id, name: izin.asrama.name, area: izin.asrama.area, gender: izin.asrama.gender },
        students: santri.map((s) => ({ id: s.id, name: s.name }))
      }
    };
  }

  // Santri dan wali: jadwal rutin, agenda 45 hari ke depan, dan piket ananda.
  async function forFamily(actor) {
    // Admin memegang semua izin baca, tetapi tidak punya ananda: daftarnya kosong.
    if (actor && actor.role === 'admin') return { ok: true, value: { tersedia: true, today: tanggalJakarta(now()), dormitories: [] } };
    if (!actor || !['student', 'parent'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya untuk santri dan wali.' };
    const anak = (await listStudentsForActor(actor)).filter((s) => s.dormitoryId);
    const dormIds = [...new Set(anak.map((s) => String(s.dormitoryId)))];
    if (!dormIds.length) return { ok: true, value: { tersedia: true, dormitories: [] } };
    const hariIni = tanggalJakarta(now());
    const hasil = await baca(async () => {
      const semuaJadwal = await jadwal(dormIds, { dariTanggal: hariIni });
      const semuaPiket = await piket(dormIds);
      return { tersedia: true, semuaJadwal, semuaPiket };
    }, { tersedia: false, semuaJadwal: [], semuaPiket: [] });
    const batasAgenda = geser(hariIni, AGENDA_KE_DEPAN_HARI);
    const dormitories = dormIds.map((dormId) => {
      const penghuni = anak.filter((s) => String(s.dormitoryId) === dormId);
      const idAnak = new Set(penghuni.map((s) => String(s.id)));
      const jadwalAsrama = hasil.semuaJadwal.filter((j) => String(j.dormitoryId) === dormId);
      const piketAsrama = hasil.semuaPiket.filter((p) => String(p.dormitoryId) === dormId);
      const piketAnak = [];
      piketAsrama.forEach((p) => {
        Object.entries(p.days).forEach(([hari, daftar]) => {
          daftar.filter((s) => idAnak.has(String(s.id))).forEach((s) => piketAnak.push({ studentId: s.id, studentName: s.name, duty: p.name, dayOfWeek: Number(hari) }));
        });
      });
      return {
        id: dormId,
        name: penghuni[0].dormitoryName || null,
        students: penghuni.map((s) => ({ id: s.id, name: s.name })),
        routine: jadwalAsrama.filter((j) => j.kind === 'rutin').map(({ dormitoryId, ...j }) => j),
        events: jadwalAsrama.filter((j) => j.kind === 'acara' && j.date <= batasAgenda).map(({ dormitoryId, ...j }) => j),
        duties: piketAnak.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.duty.localeCompare(b.duty))
      };
    });
    return { ok: true, value: { tersedia: hasil.tersedia, today: hariIni, dormitories } };
  }

  return Object.freeze({
    list, overview, forFamily,
    addSchedule, updateSchedule, deleteSchedule,
    addDuty, deleteDuty, setDutyAssignments,
    addCash, voidCash, setDues,
    addInventory, updateInventory, archiveInventory
  });
}

module.exports = { createDormitoryManagementService, HARI, DATABASE_BELUM_SIAP };
