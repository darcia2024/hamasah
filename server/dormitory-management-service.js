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
// Galeri: foto terbaru yang dikirim ke halaman (musyrif dan keluarga).
const GALERI_KELOLA = 60;
const GALERI_KELUARGA = 24;

function tabelBelumAda(error) {
  if (!error) return false;
  if (error.code === '42P01') return true;
  return /dormitory_(schedule|duties|duty_assignments|cash_entries|dues|inventory|gallery)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
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

  // ------------------------------------------------------------- galeri
  // Foto dan video kegiatan per asrama (migrasi 051 dan 077). Berkasnya unggahan 'dormitory-photo' atau
  // 'dormitory-video' dengan entityId = id asrama; baris galeri menautkannya beserta keterangan, kategori,
  // thumbnail, penonton (seluruh asrama atau santri terpilih), dan status publikasi.
  const KATEGORI_GALERI = Object.freeze({ belajar: 'Belajar', ibadah: 'Ibadah', olahraga: 'Olahraga', kebersamaan: 'Kebersamaan', perjalanan: 'Perjalanan', lainnya: 'Lainnya' });
  const STATUS_PUBLIK = Object.freeze({ internal: 'Internal', diajukan: 'Menunggu persetujuan publikasi', dipublikasi: 'Dipublikasikan', ditolak: 'Publikasi ditolak' });
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const DATABASE_GALERI_BARU = 'Database belum diperbarui untuk galeri foto dan video. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';

  function barisFoto(row) {
    return {
      id: row.id, fileId: row.file_id, caption: row.caption, takenOn: teksTanggal(row.taken_on), createdAt: iso(row.created_at),
      mediaType: row.media_type || 'foto', category: row.category || 'lainnya', categoryLabel: KATEGORI_GALERI[row.category || 'lainnya'],
      thumbFileId: row.thumb_file_id || null, audience: row.audience || 'asrama',
      publicStatus: row.public_status || 'internal', publicStatusLabel: STATUS_PUBLIK[row.public_status || 'internal'],
      consentNote: row.consent_note || '', publicDecisionNote: row.public_decision_note || ''
    };
  }

  // anakIds null = pandangan staf (semua item asrama, lengkap dengan santri yang ditandai). Selain itu pandangan
  // keluarga: item ber-audience 'terpilih' hanya muncul bila salah satu anak mereka ditandai.
  async function galeri(dormitoryIds, batas, { anakIds = null } = {}) {
    let rows;
    try {
      rows = await ambil(
        `SELECT * FROM (
           SELECT g.*, row_number() OVER (PARTITION BY g.dormitory_id ORDER BY COALESCE(g.taken_on, g.created_at::date) DESC, g.created_at DESC) AS urutan
             FROM dormitory_gallery g
            WHERE g.dormitory_id::text = ANY($1::text[]) AND g.archived_at IS NULL
              AND ($3::text[] IS NULL OR g.audience = 'asrama' OR EXISTS (SELECT 1 FROM dormitory_gallery_students s WHERE s.gallery_id = g.id AND s.student_id::text = ANY($3::text[])))
         ) t WHERE urutan <= $2
         ORDER BY COALESCE(taken_on, created_at::date) DESC, created_at DESC`,
        [dormitoryIds.map(String), batas, anakIds ? anakIds.map(String) : null]
      );
    } catch (error) {
      // Migrasi 077 belum diterapkan: galeri lama (foto saja) tetap tampil.
      if (error.code !== '42703' && error.code !== '42P01') throw error;
      if (error.code === '42P01' && !/dormitory_gallery_students/.test(String(error.message || ''))) throw error;
      rows = await ambil(
        `SELECT id, dormitory_id, file_id, caption, taken_on, created_at FROM (
           SELECT g.*, row_number() OVER (PARTITION BY g.dormitory_id ORDER BY COALESCE(g.taken_on, g.created_at::date) DESC, g.created_at DESC) AS urutan
             FROM dormitory_gallery g WHERE g.dormitory_id::text = ANY($1::text[]) AND g.archived_at IS NULL
         ) t WHERE urutan <= $2 ORDER BY COALESCE(taken_on, created_at::date) DESC, created_at DESC`,
        [dormitoryIds.map(String), batas]
      );
    }
    const hasil = rows.map((row) => ({ ...barisFoto(row), dormitoryId: row.dormitory_id }));
    if (!anakIds && hasil.length) {
      const ditandai = await ambil(
        `SELECT s.gallery_id, st.id, st.name FROM dormitory_gallery_students s JOIN students st ON st.id = s.student_id WHERE s.gallery_id::text = ANY($1::text[]) ORDER BY st.name`,
        [hasil.map((f) => String(f.id))]
      ).catch(() => []);
      hasil.forEach((f) => { f.students = ditandai.filter((d) => String(d.gallery_id) === String(f.id)).map((d) => ({ id: d.id, name: d.name })); });
    }
    return hasil;
  }

  async function berkasSiap(fileId, purpose, dormitoryId) {
    if (!UUID.test(String(fileId || ''))) return null;
    const rows = await ambil(`SELECT id FROM file_objects WHERE id::text = $1 AND purpose = $2 AND entity_id = $3 AND status = 'ready'`, [String(fileId), purpose, String(dormitoryId)]);
    return rows.length ? rows[0].id : null;
  }

  async function addPhoto(dormitoryId, input, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    const s = input || {};
    const jenis = s.mediaType === 'video' ? 'video' : 'foto';
    const kategori = s.category === undefined || s.category === '' ? 'lainnya' : String(s.category);
    if (!KATEGORI_GALERI[kategori]) return { ok: false, error: 'Kategori galeri tidak dikenal.' };
    const caption = bersih(s.caption, 160);
    const takenOn = s.takenOn ? String(s.takenOn) : null;
    if (takenOn && !isTanggal(takenOn)) return { ok: false, error: 'Tanggal kegiatan tidak valid.' };
    const audience = s.audience === 'terpilih' ? 'terpilih' : 'asrama';
    const studentIds = [...new Set((Array.isArray(s.studentIds) ? s.studentIds : []).map(String))];
    if (audience === 'terpilih' && !studentIds.length) return { ok: false, error: 'Pilih santri yang boleh melihat item ini, atau tampilkan untuk seluruh asrama.' };
    if (audience === 'asrama' && studentIds.length) return { ok: false, error: 'Daftar santri hanya dipakai bila audiens "santri terpilih".' };
    const persetujuan = bersih(s.publicConsentNote, 300);
    if (persetujuan && jenis === 'video') return { ok: false, error: 'Video tidak dipublikasikan di website. Hanya foto yang dapat diajukan untuk publikasi.' };
    if (persetujuan && persetujuan.length < 10) return { ok: false, error: 'Catatan persetujuan publikasi minimal 10 karakter: siapa yang menyetujui dan bagaimana.' };
    // Unggahan harus benar-benar berkas asrama ini yang sudah selesai dikirim.
    const fileId = await berkasSiap(s.fileId, jenis === 'video' ? 'dormitory-video' : 'dormitory-photo', dormitoryId);
    if (!fileId) return { ok: false, error: jenis === 'video' ? 'Video belum selesai diunggah. Coba unggah ulang.' : 'Foto belum selesai diunggah. Coba unggah ulang.' };
    let thumbId = null;
    if (s.thumbFileId) {
      thumbId = await berkasSiap(s.thumbFileId, 'dormitory-photo', dormitoryId);
      if (!thumbId) return { ok: false, error: 'Thumbnail belum selesai diunggah. Coba unggah ulang.' };
    }
    return tulis(async () => {
      try {
        if (audience === 'terpilih') {
          const sah = await ambil(`SELECT id FROM students WHERE dormitory_id = $1 AND status = 'active' AND id::text = ANY($2::text[])`, [dormitoryId, studentIds]);
          if (sah.length !== studentIds.length) return { ok: false, error: 'Ada santri yang bukan penghuni aktif asrama ini.' };
        }
        const id = crypto.randomUUID();
        const [row] = await ambil(
          `INSERT INTO dormitory_gallery (id, dormitory_id, file_id, caption, taken_on, created_by_account_id, media_type, category, thumb_file_id, audience, public_status, consent_note, consent_by_account_id, consent_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
          [id, dormitoryId, fileId, caption, takenOn, actor.id || null, jenis, kategori, thumbId, audience, persetujuan ? 'diajukan' : 'internal', persetujuan, persetujuan ? (actor.id || null) : null, persetujuan ? now() : null]
        );
        for (const sid of studentIds) await database.query('INSERT INTO dormitory_gallery_students (gallery_id, student_id) VALUES ($1, $2)', [id, sid]);
        return { ok: true, value: barisFoto(row) };
      } catch (error) {
        if (error.code === '42703' || (error.code === '42P01' && /dormitory_gallery_students/.test(String(error.message || '')))) return { ok: false, status: 409, error: DATABASE_GALERI_BARU };
        throw error;
      }
    });
  }

  async function archivePhoto(dormitoryId, photoId, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    return tulis(async () => {
      const rows = await ambil(
        `UPDATE dormitory_gallery SET archived_at = now() WHERE id::text = $1 AND dormitory_id::text = $2 AND archived_at IS NULL RETURNING id`,
        [String(photoId), String(dormitoryId)]
      );
      return rows.length ? { ok: true, value: { id: photoId } } : { ok: false, status: 404, error: 'Foto tidak ditemukan.' };
    });
  }

  async function ambilItem(dormitoryId, photoId) {
    if (!UUID.test(String(photoId || ''))) return null;
    return (await ambil(`SELECT * FROM dormitory_gallery WHERE id::text = $1 AND dormitory_id::text = $2 AND archived_at IS NULL`, [String(photoId), String(dormitoryId)]))[0] || null;
  }

  // Mengajukan foto untuk ditampilkan publik: butuh catatan persetujuan (wali atau pihak berwenang) dan keputusan admin.
  async function requestPublic(dormitoryId, photoId, input, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    const catatan = bersih(input && input.consentNote, 300);
    if (catatan.length < 10) return { ok: false, error: 'Tulis catatan persetujuan publikasi (minimal 10 karakter): siapa yang menyetujui dan bagaimana.' };
    return tulis(async () => {
      const item = await ambilItem(dormitoryId, photoId);
      if (!item) return { ok: false, status: 404, error: 'Foto tidak ditemukan.' };
      if (item.media_type === 'video') return { ok: false, status: 409, error: 'Video tidak dipublikasikan di website.' };
      if (!['internal', 'ditolak'].includes(item.public_status)) return { ok: false, status: 409, error: item.public_status === 'dipublikasi' ? 'Foto ini sudah dipublikasikan.' : 'Foto ini sudah diajukan.' };
      const [row] = await ambil(`UPDATE dormitory_gallery SET public_status = 'diajukan', consent_note = $2, consent_by_account_id = $3, consent_at = $4, public_decision_note = '', public_decided_by_account_id = NULL, public_decided_at = NULL WHERE id = $1 RETURNING *`, [item.id, catatan, actor.id || null, now()]);
      return { ok: true, value: barisFoto(row) };
    });
  }

  async function decidePublic(dormitoryId, photoId, input, actor) {
    if (!actor || actor.role !== 'admin') return { ok: false, status: 403, error: 'Hanya admin yang memutuskan publikasi foto.' };
    const keputusan = String(input && input.decision || '');
    if (!['dipublikasi', 'ditolak'].includes(keputusan)) return { ok: false, error: 'Keputusan harus dipublikasi atau ditolak.' };
    const catatan = bersih(input && input.note, 300);
    if (keputusan === 'ditolak' && catatan.length < 5) return { ok: false, error: 'Tulis alasan penolakan (minimal 5 karakter).' };
    return tulis(async () => {
      const item = await ambilItem(dormitoryId, photoId);
      if (!item) return { ok: false, status: 404, error: 'Foto tidak ditemukan.' };
      if (item.public_status !== 'diajukan') return { ok: false, status: 409, error: 'Foto ini tidak sedang menunggu keputusan publikasi.' };
      if (keputusan === 'dipublikasi' && String(item.consent_note || '').length < 10) return { ok: false, status: 409, error: 'Tidak ada catatan persetujuan publikasi.' };
      const [row] = await ambil(`UPDATE dormitory_gallery SET public_status = $2, public_decision_note = $3, public_decided_by_account_id = $4, public_decided_at = $5 WHERE id = $1 RETURNING *`, [item.id, keputusan, catatan, actor.id || null, now()]);
      return { ok: true, value: barisFoto(row) };
    });
  }

  // Mencabut publikasi: boleh oleh pengelola asrama (privasi didahulukan), foto kembali internal.
  async function revokePublic(dormitoryId, photoId, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    return tulis(async () => {
      const item = await ambilItem(dormitoryId, photoId);
      if (!item) return { ok: false, status: 404, error: 'Foto tidak ditemukan.' };
      if (!['diajukan', 'dipublikasi'].includes(item.public_status)) return { ok: false, status: 409, error: 'Foto ini tidak sedang diajukan atau dipublikasikan.' };
      const [row] = await ambil(`UPDATE dormitory_gallery SET public_status = 'internal', public_decision_note = 'Dicabut oleh pengelola asrama.', public_decided_by_account_id = $2, public_decided_at = $3 WHERE id = $1 RETURNING *`, [item.id, actor.id || null, now()]);
      return { ok: true, value: barisFoto(row) };
    });
  }

  // Daftar publik (tanpa sesi): hanya foto yang sudah disetujui. Tanpa nama asrama, santri, atau catatan persetujuan.
  async function publicGallery() {
    const rows = await baca(() => ambil(
      `SELECT id, caption, category, taken_on, created_at FROM dormitory_gallery WHERE public_status = 'dipublikasi' AND media_type = 'foto' AND archived_at IS NULL
        ORDER BY COALESCE(taken_on, created_at::date) DESC, created_at DESC LIMIT 60`
    ), []).catch((error) => { if (error.code === '42703') return []; throw error; });
    return rows.map((r) => ({ id: r.id, caption: r.caption, category: r.category, categoryLabel: KATEGORI_GALERI[r.category], takenOn: teksTanggal(r.taken_on) }));
  }

  // Berkas yang boleh disajikan publik untuk satu item galeri yang dipublikasikan; null bila tidak (atau ditarik).
  async function publicFileId(galleryId, kecil) {
    if (!UUID.test(String(galleryId || ''))) return null;
    const rows = await baca(() => ambil(`SELECT file_id, thumb_file_id FROM dormitory_gallery WHERE id::text = $1 AND public_status = 'dipublikasi' AND media_type = 'foto' AND archived_at IS NULL`, [String(galleryId)]), [])
      .catch((error) => { if (error.code === '42703') return []; throw error; });
    if (!rows.length) return null;
    return kecil && rows[0].thumb_file_id ? rows[0].thumb_file_id : rows[0].file_id;
  }

  // Aturan unggah dan unduh berkas 'dormitory-photo' (storage/upload-policies.js).
  async function bolehUnggahFoto(dormitoryId, actor) {
    return (await bolehKelola(dormitoryId, actor)).ok;
  }

  // Berkas foto dan video galeri: staf asrama itu (dan admin) bebas; santri dan wali hanya berkas yang tertaut ke item galeri
  // yang masih tayang dan memang untuk mereka (seluruh asrama, atau item terpilih yang menandai salah satu anak mereka).
  async function bolehLihatFoto(dormitoryId, actor, record = null) {
    if (!actor) return false;
    if (['admin', 'supervisor'].includes(actor.role)) return (await bolehKelola(dormitoryId, actor)).ok;
    if (!['student', 'parent'].includes(actor.role)) return false;
    const anak = (await listStudentsForActor(actor)).filter((s) => s.dormitoryId && String(s.dormitoryId) === String(dormitoryId));
    if (!anak.length) return false;
    if (!record || !record.id) return false;
    const item = await baca(() => ambil(
      `SELECT g.id, g.audience FROM dormitory_gallery g WHERE g.dormitory_id::text = $1 AND g.archived_at IS NULL AND (g.file_id::text = $2 OR g.thumb_file_id::text = $2)`,
      [String(dormitoryId), String(record.id)]
    ), []).catch((error) => { if (error.code === '42703') return [{ audience: 'asrama' }]; throw error; });
    if (!item.length) return false;
    if (item.every((g) => g.audience !== 'terpilih')) return true;
    const boleh = await ambil(
      `SELECT 1 FROM dormitory_gallery_students s JOIN dormitory_gallery g ON g.id = s.gallery_id WHERE g.dormitory_id::text = $1 AND g.archived_at IS NULL AND (g.file_id::text = $2 OR g.thumb_file_id::text = $2) AND s.student_id::text = ANY($3::text[])`,
      [String(dormitoryId), String(record.id), anak.map((s) => String(s.id))]
    );
    return item.some((g) => g.audience !== 'terpilih') || boleh.length > 0;
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
    // Galeri dari migrasi 051: boleh belum ada walau tabel 050 sudah ada.
    const galeriAsrama = await baca(async () => ({ tersedia: true, items: (await galeri([dormitoryId], GALERI_KELOLA)).map(({ dormitoryId: _d, ...f }) => f) }), { tersedia: false, items: [] });
    return {
      ok: true,
      value: {
        ...isi,
        gallery: galeriAsrama,
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
    const semuaFoto = (await baca(() => galeri(dormIds, GALERI_KELUARGA, { anakIds: anak.map((s) => s.id) }), [])).map(({ consentNote, publicDecisionNote, ...f }) => f);
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
        duties: piketAnak.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.duty.localeCompare(b.duty)),
        gallery: semuaFoto.filter((f) => String(f.dormitoryId) === dormId).map(({ dormitoryId, ...f }) => f)
      };
    });
    return { ok: true, value: { tersedia: hasil.tersedia, today: hariIni, dormitories } };
  }

  return Object.freeze({
    list, overview, forFamily,
    addSchedule, updateSchedule, deleteSchedule,
    addDuty, deleteDuty, setDutyAssignments,
    addCash, voidCash, setDues,
    addInventory, updateInventory, archiveInventory,
    addPhoto, archivePhoto, requestPublic, decidePublic, revokePublic, publicGallery, publicFileId, bolehUnggahFoto, bolehLihatFoto
  });
}

module.exports = { createDormitoryManagementService, HARI, DATABASE_BELUM_SIAP };
