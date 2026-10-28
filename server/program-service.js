'use strict';
// Lokasi operasional, program pembinaan, dan batch (migrasi 060).
//
//   lokasi (Mesir, Indonesia) -> asrama, petugas, program -> batch -> peserta
//
// Batch BUKAN asrama. Asrama adalah tempat tinggal; batch adalah rombongan peserta dalam satu
// program pada rentang tanggal tertentu (karantina di Indonesia, pembinaan di Mesir). Satu santri
// bisa mengikuti batch di Indonesia lebih dulu, lalu masuk asrama di Mesir. Keduanya dicatat
// terpisah dan sama-sama melekat pada santri, jadi riwayatnya tidak hilang saat santri berpindah
// lokasi (lihat studentHistory).
//
// Akses: admin mengelola semuanya. Petugas (musyrif atau petugas pendaftaran) hanya mengelola
// lokasi yang ditugaskan kepadanya; musyrif juga otomatis mengelola lokasi tempat asrama yang
// dipegangnya berada. Hanya admin yang menugaskan petugas ke lokasi.
//
// Kode ini boleh online lebih dulu daripada migrasi: selama tabelnya belum ada, pembacaan
// mengembalikan available: false dan penyimpanan dibalas 409 dengan arahan ke halaman Pengaturan.

const crypto = require('node:crypto');

const ADMIN_ROLE = 'admin';
const STAF_PETUGAS = Object.freeze(['supervisor', 'registration-officer']);
const JENIS = Object.freeze({ karantina: 'Karantina', pembinaan: 'Pembinaan' });
const STATUS_BATCH = Object.freeze(['direncanakan', 'berjalan', 'selesai', 'dibatalkan']);
// Alur status: batch yang selesai atau dibatalkan tidak dibuka lagi.
const ALUR = Object.freeze({ direncanakan: ['berjalan', 'dibatalkan'], berjalan: ['selesai', 'dibatalkan'], selesai: [], dibatalkan: [] });
const STATUS_PESERTA = Object.freeze(['aktif', 'lulus', 'keluar', 'pindah']);
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk program dan batch. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';

function tabelBelumAda(error) {
  if (!error) return false;
  if (error.code === '42P01' || error.code === '42703') return true;
  return /(location_staff|programs|program_batches|batch_participants|locations|placement_history)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function bersih(value, maks) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maks);
}

function adaId(value) {
  return /^[\w-]{8,64}$/.test(String(value || ''));
}

function isTanggal(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function tanggalJakarta(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : null);
}

function teksTanggal(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function createProgramService({ database, accessFor, now = () => new Date() } = {}) {
  if (!database) throw new Error('createProgramService membutuhkan database.');

  async function ambil(sql, params = [], tx = database) {
    return (await tx.query(sql, params)).rows;
  }

  async function tulis(fn) {
    try {
      return await fn();
    } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  function staf(actor) {
    return Boolean(actor && (actor.role === ADMIN_ROLE || STAF_PETUGAS.includes(actor.role)));
  }

  // Asrama beserta lokasinya. Asrama tanpa lokasi mengikuti lokasi negaranya ("Hamasah <negara>").
  async function petaAsrama() {
    const lokasi = await ambil('SELECT id, name, country FROM locations ORDER BY country, name');
    let asrama;
    try {
      asrama = await ambil('SELECT id, name, area, gender, capacity, location_id, country FROM dormitories ORDER BY name');
    } catch (error) {
      if (error.code !== '42703') throw error;
      asrama = (await ambil('SELECT id, name, area, gender, capacity, location_id FROM dormitories ORDER BY name')).map((row) => ({ ...row, country: 'Mesir' }));
    }
    const hub = new Map(lokasi.filter((l) => l.name === `Hamasah ${l.country}`).map((l) => [l.country, l.id]));
    const efektif = asrama.map((row) => ({ ...row, locationId: row.location_id || hub.get(row.country) || null }));
    return { lokasi, asrama: efektif };
  }

  // null = semua lokasi (admin); selain itu daftar id lokasi yang boleh dikelola.
  async function lokasiBoleh(actor, peta) {
    if (actor.role === ADMIN_ROLE) return null;
    const boleh = new Set((await ambil('SELECT location_id FROM location_staff WHERE account_id = $1', [actor.id])).map((row) => row.location_id));
    if (actor.role === 'supervisor') {
      const dipegang = new Set((await ambil('SELECT dormitory_id FROM staff_dormitory_assignments WHERE account_id = $1', [actor.id])).map((row) => row.dormitory_id));
      peta.asrama.filter((a) => dipegang.has(a.id) && a.locationId).forEach((a) => boleh.add(a.locationId));
    }
    return boleh;
  }

  async function bolehLokasi(locationId, actor, peta) {
    if (!staf(actor)) return { ok: false, status: 403, error: 'Program untuk admin, musyrif, dan petugas.' };
    if (!adaId(locationId)) return { ok: false, status: 404, error: 'Lokasi tidak ditemukan.' };
    const lokasi = peta.lokasi.find((l) => l.id === locationId);
    if (!lokasi) return { ok: false, status: 404, error: 'Lokasi tidak ditemukan.' };
    const boleh = await lokasiBoleh(actor, peta);
    if (boleh !== null && !boleh.has(locationId)) {
      return { ok: false, status: 403, error: 'Lokasi ini bukan lokasi yang Anda tangani. Minta admin menugaskan Anda ke lokasi ini.' };
    }
    return { ok: true, lokasi };
  }

  // ------------------------------------------------------------------ daftar lokasi

  async function listLocations(actor) {
    if (!staf(actor)) return { ok: false, status: 403, error: 'Program untuk admin, musyrif, dan petugas.' };
    try {
      const peta = await petaAsrama();
      const boleh = await lokasiBoleh(actor, peta);
      const terlihat = peta.lokasi.filter((l) => boleh === null || boleh.has(l.id));
      const programs = await ambil('SELECT id, location_id, active FROM programs');
      const batch = await ambil('SELECT b.id, b.status, p.location_id FROM program_batches b JOIN programs p ON p.id = b.program_id');
      const peserta = await ambil(`SELECT bp.student_id, p.location_id FROM batch_participants bp
        JOIN program_batches b ON b.id = bp.batch_id JOIN programs p ON p.id = b.program_id WHERE bp.status = 'aktif'`);
      const penghuni = await ambil(`SELECT dormitory_id, count(*)::int AS jumlah FROM students WHERE status = 'active' AND dormitory_id IS NOT NULL GROUP BY dormitory_id`);
      const hunian = new Map(penghuni.map((row) => [row.dormitory_id, row.jumlah]));
      return {
        ok: true,
        value: {
          available: true,
          canAssignStaff: actor.role === ADMIN_ROLE,
          locations: terlihat.map((l) => {
            const asramaLokasi = peta.asrama.filter((a) => a.locationId === l.id);
            return {
              id: l.id, name: l.name, country: l.country,
              dormitories: asramaLokasi.length,
              residents: asramaLokasi.reduce((jumlah, a) => jumlah + (hunian.get(a.id) || 0), 0),
              programs: programs.filter((p) => p.location_id === l.id && p.active).length,
              activeBatches: batch.filter((b) => b.location_id === l.id && b.status === 'berjalan').length,
              plannedBatches: batch.filter((b) => b.location_id === l.id && b.status === 'direncanakan').length,
              participants: new Set(peserta.filter((p) => p.location_id === l.id).map((p) => p.student_id)).size
            };
          })
        }
      };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { ok: true, value: { available: false, canAssignStaff: false, locations: [] } };
    }
  }

  // ------------------------------------------------------------------ laporan lokasi

  function bentukBatch(row) {
    return {
      id: row.id, programId: row.program_id, name: row.name, startsOn: teksTanggal(row.starts_on), endsOn: teksTanggal(row.ends_on),
      status: row.status, note: row.note || '', participants: Number(row.peserta || 0), activeParticipants: Number(row.peserta_aktif || 0)
    };
  }

  async function report(locationId, actor) {
    return tulis(async () => {
      const peta = await petaAsrama();
      const izin = await bolehLokasi(locationId, actor, peta);
      if (!izin.ok) return izin;
      const asramaLokasi = peta.asrama.filter((a) => a.locationId === locationId);
      const idAsrama = asramaLokasi.map((a) => a.id);
      const penghuni = idAsrama.length
        ? await ambil(`SELECT dormitory_id, count(*)::int AS jumlah FROM students WHERE status = 'active' AND dormitory_id = ANY($1::uuid[]) GROUP BY dormitory_id`, [idAsrama])
        : [];
      const hunian = new Map(penghuni.map((row) => [row.dormitory_id, row.jumlah]));
      const pembina = idAsrama.length
        ? await ambil(`SELECT a.dormitory_id, acc.id, acc.name FROM staff_dormitory_assignments a JOIN accounts acc ON acc.id = a.account_id
            WHERE a.dormitory_id = ANY($1::uuid[]) AND acc.active ORDER BY acc.name`, [idAsrama])
        : [];
      const petugasLokasi = await ambil(`SELECT acc.id, acc.name, acc.role FROM location_staff s JOIN accounts acc ON acc.id = s.account_id
        WHERE s.location_id = $1 AND acc.active ORDER BY acc.name`, [locationId]);
      const program = await ambil('SELECT * FROM programs WHERE location_id = $1 ORDER BY active DESC, name', [locationId]);
      const batch = program.length
        ? await ambil(`SELECT b.*, (SELECT count(*) FROM batch_participants bp WHERE bp.batch_id = b.id) AS peserta,
              (SELECT count(*) FROM batch_participants bp WHERE bp.batch_id = b.id AND bp.status = 'aktif') AS peserta_aktif
            FROM program_batches b WHERE b.program_id = ANY($1::uuid[]) ORDER BY b.starts_on DESC, b.name`, [program.map((p) => p.id)])
        : [];
      const tanpaAsrama = program.length
        ? (await ambil(`SELECT count(DISTINCT s.id)::int AS jumlah FROM batch_participants bp
            JOIN program_batches b ON b.id = bp.batch_id JOIN students s ON s.id = bp.student_id
            WHERE b.program_id = ANY($1::uuid[]) AND bp.status = 'aktif' AND s.status = 'active' AND s.dormitory_id IS NULL`, [program.map((p) => p.id)]))[0].jumlah
        : 0;

      // Petugas lokasi: yang ditugaskan langsung ke lokasi, ditambah musyrif asrama di lokasi ini.
      const petugas = new Map();
      petugasLokasi.forEach((p) => petugas.set(p.id, { id: p.id, name: p.name, role: p.role, via: 'lokasi' }));
      pembina.forEach((p) => { if (!petugas.has(p.id)) petugas.set(p.id, { id: p.id, name: p.name, role: 'supervisor', via: 'asrama' }); });

      const daftarProgram = program.map((p) => ({
        id: p.id, name: p.name, kind: p.kind, kindLabel: JENIS[p.kind], description: p.description || '',
        durationDays: p.duration_days === null ? null : Number(p.duration_days), active: Boolean(p.active),
        batches: batch.filter((b) => b.program_id === p.id).map(bentukBatch)
      }));
      const semuaBatch = daftarProgram.flatMap((p) => p.batches);
      return {
        ok: true,
        value: {
          available: true,
          canManage: true,
          canAssignStaff: actor.role === ADMIN_ROLE,
          location: { id: izin.lokasi.id, name: izin.lokasi.name, country: izin.lokasi.country },
          dormitories: asramaLokasi.map((a) => ({
            id: a.id, name: a.name, area: a.area, gender: a.gender, capacity: Number(a.capacity) || 0, residents: hunian.get(a.id) || 0,
            supervisors: pembina.filter((p) => p.dormitory_id === a.id).map((p) => p.name)
          })),
          staff: [...petugas.values()],
          programs: daftarProgram,
          summary: {
            dormitories: asramaLokasi.length,
            residents: asramaLokasi.reduce((jumlah, a) => jumlah + (hunian.get(a.id) || 0), 0),
            staff: petugas.size,
            programs: daftarProgram.filter((p) => p.active).length,
            plannedBatches: semuaBatch.filter((b) => b.status === 'direncanakan').length,
            activeBatches: semuaBatch.filter((b) => b.status === 'berjalan').length,
            finishedBatches: semuaBatch.filter((b) => b.status === 'selesai').length,
            activeParticipants: semuaBatch.reduce((jumlah, b) => jumlah + b.activeParticipants, 0),
            participantsWithoutDormitory: tanpaAsrama
          }
        }
      };
    });
  }

  // Petugas lokasi: { accountId, assigned }. Hanya admin.
  async function setStaff(locationId, input, actor) {
    if (!actor || actor.role !== ADMIN_ROLE) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };
    const akunId = String((input || {}).accountId || '');
    const tugas = (input || {}).assigned !== false;
    if (!adaId(locationId) || !adaId(akunId)) return { ok: false, status: 404, error: 'Lokasi atau akun tidak ditemukan.' };
    return tulis(async () => {
      if (!(await ambil('SELECT 1 FROM locations WHERE id = $1', [locationId])).length) return { ok: false, status: 404, error: 'Lokasi tidak ditemukan.' };
      const akun = (await ambil('SELECT id, name, role, active FROM accounts WHERE id = $1', [akunId]))[0];
      if (!akun || !akun.active || !STAF_PETUGAS.includes(akun.role)) return { ok: false, status: 422, error: 'Pilih akun musyrif atau petugas pendaftaran yang aktif.' };
      if (tugas) {
        await ambil('INSERT INTO location_staff (location_id, account_id, assigned_by_account_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [locationId, akunId, actor.id || null]);
      } else {
        await ambil('DELETE FROM location_staff WHERE location_id = $1 AND account_id = $2', [locationId, akunId]);
      }
      return { ok: true, value: { locationId, accountId: akunId, assigned: tugas } };
    });
  }

  // Akun yang boleh ditugaskan ke lokasi, untuk pilihan di formulir admin.
  async function staffCandidates(actor) {
    if (!actor || actor.role !== ADMIN_ROLE) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };
    const rows = await ambil(`SELECT id, name, role FROM accounts WHERE active AND role = ANY($1::text[]) ORDER BY name`, [STAF_PETUGAS]);
    return { ok: true, value: { accounts: rows } };
  }

  // ------------------------------------------------------------------ program

  function bacaProgram(input, awal) {
    const sumber = { ...(awal || {}), ...(input || {}) };
    const nama = bersih(sumber.name, 100);
    const jenis = bersih(sumber.kind, 20);
    const durasi = sumber.durationDays === null || sumber.durationDays === undefined || sumber.durationDays === '' ? null : Number(sumber.durationDays);
    if (nama.length < 2) return { ok: false, status: 422, error: 'Isi nama program.' };
    if (!JENIS[jenis]) return { ok: false, status: 422, error: 'Pilih jenis program: karantina atau pembinaan.' };
    if (durasi !== null && (!Number.isInteger(durasi) || durasi < 1 || durasi > 3650)) return { ok: false, status: 422, error: 'Durasi program 1 sampai 3650 hari.' };
    return { ok: true, value: { nama, jenis, deskripsi: bersih(sumber.description, 500), durasi, aktif: sumber.active !== false } };
  }

  async function createProgram(locationId, input, actor) {
    return tulis(async () => {
      const peta = await petaAsrama();
      const izin = await bolehLokasi(locationId, actor, peta);
      if (!izin.ok) return izin;
      const baca = bacaProgram(input);
      if (!baca.ok) return baca;
      const p = baca.value;
      if ((await ambil('SELECT 1 FROM programs WHERE location_id = $1 AND lower(name) = lower($2)', [locationId, p.nama])).length) {
        return { ok: false, status: 409, error: 'Nama program sudah dipakai di lokasi ini.' };
      }
      const id = crypto.randomUUID();
      await ambil('INSERT INTO programs (id, location_id, name, kind, description, duration_days, active) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, locationId, p.nama, p.jenis, p.deskripsi, p.durasi, p.aktif]);
      return { ok: true, value: { id, locationId } };
    });
  }

  async function programBoleh(programId, actor) {
    if (!adaId(programId)) return { ok: false, status: 404, error: 'Program tidak ditemukan.' };
    const program = (await ambil('SELECT * FROM programs WHERE id = $1', [programId]))[0];
    if (!program) return { ok: false, status: 404, error: 'Program tidak ditemukan.' };
    const peta = await petaAsrama();
    const izin = await bolehLokasi(program.location_id, actor, peta);
    if (!izin.ok) return izin;
    return { ok: true, program, lokasi: izin.lokasi, peta };
  }

  async function updateProgram(programId, input, actor) {
    return tulis(async () => {
      const izin = await programBoleh(programId, actor);
      if (!izin.ok) return izin;
      const lama = izin.program;
      const baca = bacaProgram(input, { name: lama.name, kind: lama.kind, description: lama.description, durationDays: lama.duration_days, active: lama.active });
      if (!baca.ok) return baca;
      const p = baca.value;
      if ((await ambil('SELECT 1 FROM programs WHERE location_id = $1 AND lower(name) = lower($2) AND id <> $3', [lama.location_id, p.nama, programId])).length) {
        return { ok: false, status: 409, error: 'Nama program sudah dipakai di lokasi ini.' };
      }
      await ambil('UPDATE programs SET name = $2, kind = $3, description = $4, duration_days = $5, active = $6, updated_at = now() WHERE id = $1',
        [programId, p.nama, p.jenis, p.deskripsi, p.durasi, p.aktif]);
      return { ok: true, value: { id: programId } };
    });
  }

  // ------------------------------------------------------------------ batch

  function bacaBatch(input, awal) {
    const sumber = { ...(awal || {}), ...(input || {}) };
    const nama = bersih(sumber.name, 100);
    const mulai = bersih(sumber.startsOn, 10);
    const selesai = sumber.endsOn ? bersih(sumber.endsOn, 10) : null;
    if (!nama) return { ok: false, status: 422, error: 'Isi nama batch, misalnya "Batch 5, Januari 2027".' };
    if (!isTanggal(mulai)) return { ok: false, status: 422, error: 'Isi tanggal mulai batch.' };
    if (selesai && !isTanggal(selesai)) return { ok: false, status: 422, error: 'Tanggal selesai belum valid. Boleh dikosongkan bila belum pasti.' };
    if (selesai && selesai < mulai) return { ok: false, status: 422, error: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' };
    return { ok: true, value: { nama, mulai, selesai, catatan: bersih(sumber.note, 500) } };
  }

  async function createBatch(programId, input, actor) {
    return tulis(async () => {
      const izin = await programBoleh(programId, actor);
      if (!izin.ok) return izin;
      if (!izin.program.active) return { ok: false, status: 409, error: 'Program ini tidak aktif. Aktifkan dulu sebelum membuat batch.' };
      const baca = bacaBatch(input);
      if (!baca.ok) return baca;
      const b = baca.value;
      if ((await ambil('SELECT 1 FROM program_batches WHERE program_id = $1 AND lower(name) = lower($2)', [programId, b.nama])).length) {
        return { ok: false, status: 409, error: 'Nama batch sudah dipakai di program ini.' };
      }
      const id = crypto.randomUUID();
      await ambil('INSERT INTO program_batches (id, program_id, name, starts_on, ends_on, note, created_by_account_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, programId, b.nama, b.mulai, b.selesai, b.catatan, actor.id || null]);
      return { ok: true, value: { id, programId } };
    });
  }

  async function batchBoleh(batchId, actor) {
    if (!adaId(batchId)) return { ok: false, status: 404, error: 'Batch tidak ditemukan.' };
    const batch = (await ambil('SELECT * FROM program_batches WHERE id = $1', [batchId]))[0];
    if (!batch) return { ok: false, status: 404, error: 'Batch tidak ditemukan.' };
    const izin = await programBoleh(batch.program_id, actor);
    if (!izin.ok) return izin;
    return { ok: true, batch, program: izin.program, lokasi: izin.lokasi, peta: izin.peta };
  }

  async function batchDetail(batchId, actor) {
    return tulis(async () => {
      const izin = await batchBoleh(batchId, actor);
      if (!izin.ok) return izin;
      const peserta = await ambil(
        `SELECT bp.student_id, s.name, bp.status, bp.joined_on, bp.left_on, bp.note, d.name AS dormitory
         FROM batch_participants bp JOIN students s ON s.id = bp.student_id LEFT JOIN dormitories d ON d.id = s.dormitory_id
         WHERE bp.batch_id = $1 ORDER BY (bp.status = 'aktif') DESC, s.name`, [batchId]
      );
      const terbuka = ['direncanakan', 'berjalan'].includes(izin.batch.status);
      let calon = [];
      if (terbuka) {
        const asramaLokasi = izin.peta.asrama.filter((a) => a.locationId === izin.lokasi.id).map((a) => a.id);
        const sudah = new Set(peserta.filter((p) => p.status === 'aktif').map((p) => p.student_id));
        const rows = await ambil(
          `SELECT s.id, s.name, d.name AS dormitory FROM students s LEFT JOIN dormitories d ON d.id = s.dormitory_id
           WHERE s.status = 'active' AND ($1::boolean OR s.dormitory_id IS NULL OR s.dormitory_id = ANY($2::uuid[])) ORDER BY s.name LIMIT 500`,
          [actor.role === ADMIN_ROLE, asramaLokasi]
        );
        calon = rows.filter((s) => !sudah.has(s.id)).map((s) => ({ id: s.id, name: s.name, dormitory: s.dormitory || null }));
      }
      return {
        ok: true,
        value: {
          batch: { ...bentukBatch({ ...izin.batch, peserta: peserta.length, peserta_aktif: peserta.filter((p) => p.status === 'aktif').length }), nextStatuses: ALUR[izin.batch.status] },
          program: { id: izin.program.id, name: izin.program.name, kind: izin.program.kind, kindLabel: JENIS[izin.program.kind] },
          location: { id: izin.lokasi.id, name: izin.lokasi.name, country: izin.lokasi.country },
          participants: peserta.map((p) => ({ studentId: p.student_id, name: p.name, status: p.status, joinedOn: teksTanggal(p.joined_on), leftOn: teksTanggal(p.left_on), note: p.note || '', dormitory: p.dormitory || null })),
          candidates: calon
        }
      };
    });
  }

  // Ubah data batch dan/atau statusnya: { name, startsOn, endsOn, note, status }.
  async function updateBatch(batchId, input, actor) {
    return tulis(async () => {
      const izin = await batchBoleh(batchId, actor);
      if (!izin.ok) return izin;
      const lama = izin.batch;
      const sumber = input || {};
      const baca = bacaBatch(sumber, { name: lama.name, startsOn: teksTanggal(lama.starts_on), endsOn: teksTanggal(lama.ends_on), note: lama.note });
      if (!baca.ok) return baca;
      const b = baca.value;
      // endsOn: null dari klien berarti "kosongkan".
      const selesaiBaru = Object.prototype.hasOwnProperty.call(sumber, 'endsOn') && !sumber.endsOn ? null : b.selesai;
      const statusBaru = sumber.status ? bersih(sumber.status, 20) : lama.status;
      if (!STATUS_BATCH.includes(statusBaru)) return { ok: false, status: 422, error: 'Status batch belum valid.' };
      if (statusBaru !== lama.status && !ALUR[lama.status].includes(statusBaru)) {
        return { ok: false, status: 409, error: `Batch yang ${lama.status} tidak bisa diubah menjadi ${statusBaru}.` };
      }
      if (['selesai', 'dibatalkan'].includes(lama.status) && (b.nama !== lama.name || b.mulai !== teksTanggal(lama.starts_on) || selesaiBaru !== teksTanggal(lama.ends_on))) {
        return { ok: false, status: 409, error: 'Batch yang sudah ditutup tidak bisa diubah datanya.' };
      }
      if (b.nama.toLowerCase() !== String(lama.name).toLowerCase()
        && (await ambil('SELECT 1 FROM program_batches WHERE program_id = $1 AND lower(name) = lower($2) AND id <> $3', [lama.program_id, b.nama, batchId])).length) {
        return { ok: false, status: 409, error: 'Nama batch sudah dipakai di program ini.' };
      }
      const hariIni = tanggalJakarta(now());
      let selesaiAkhir = selesaiBaru;
      if (statusBaru === 'selesai' && !selesaiAkhir) selesaiAkhir = hariIni < b.mulai ? b.mulai : hariIni;
      return database.withTransaction(async (tx) => {
        await ambil('UPDATE program_batches SET name = $2, starts_on = $3, ends_on = $4, note = $5, status = $6, updated_at = now() WHERE id = $1',
          [batchId, b.nama, b.mulai, selesaiAkhir, b.catatan, statusBaru], tx);
        if (statusBaru !== lama.status && statusBaru === 'selesai') {
          await ambil(`UPDATE batch_participants SET status = 'lulus', left_on = $2, updated_at = now() WHERE batch_id = $1 AND status = 'aktif'`, [batchId, selesaiAkhir], tx);
        }
        if (statusBaru !== lama.status && statusBaru === 'dibatalkan') {
          await ambil(`UPDATE batch_participants SET status = 'keluar', left_on = $2, note = CASE WHEN note = '' THEN 'Batch dibatalkan.' ELSE note END, updated_at = now() WHERE batch_id = $1 AND status = 'aktif'`, [batchId, hariIni], tx);
        }
        return { ok: true, value: { id: batchId, status: statusBaru, previousStatus: lama.status } };
      });
    });
  }

  // ------------------------------------------------------------------ peserta

  async function addParticipants(batchId, input, actor) {
    return tulis(async () => {
      const izin = await batchBoleh(batchId, actor);
      if (!izin.ok) return izin;
      if (!['direncanakan', 'berjalan'].includes(izin.batch.status)) return { ok: false, status: 409, error: 'Batch yang sudah ditutup tidak menerima peserta baru.' };
      const ids = [...new Set((Array.isArray((input || {}).studentIds) ? input.studentIds : []).map(String))];
      if (!ids.length || ids.length > 100 || ids.some((id) => !adaId(id))) return { ok: false, status: 422, error: 'Pilih satu sampai 100 santri.' };
      const detail = await batchDetail(batchId, actor);
      if (!detail.ok) return detail;
      const boleh = new Set(detail.value.candidates.map((s) => s.id));
      const ditolak = ids.filter((id) => !boleh.has(id));
      if (ditolak.length) return { ok: false, status: 422, error: 'Ada santri yang tidak bisa ditambahkan: sudah menjadi peserta aktif, tidak aktif, atau bukan bagian dari lokasi yang Anda tangani.' };
      // Satu santri tidak aktif di dua batch dari program yang sama sekaligus.
      const bentrok = await ambil(
        `SELECT s.name FROM batch_participants bp JOIN program_batches b ON b.id = bp.batch_id JOIN students s ON s.id = bp.student_id
         WHERE b.program_id = $1 AND b.id <> $2 AND bp.status = 'aktif' AND bp.student_id = ANY($3::uuid[]) LIMIT 3`,
        [izin.batch.program_id, batchId, ids]
      );
      if (bentrok.length) return { ok: false, status: 409, error: `${bentrok.map((r) => r.name).join(', ')} masih aktif di batch lain pada program ini.` };
      const hariIni = tanggalJakarta(now());
      const mulai = hariIni > teksTanggal(izin.batch.starts_on) ? hariIni : teksTanggal(izin.batch.starts_on);
      await database.withTransaction(async (tx) => {
        for (const id of ids) {
          await ambil(
            `INSERT INTO batch_participants (batch_id, student_id, status, joined_on, added_by_account_id) VALUES ($1, $2, 'aktif', $3, $4)
             ON CONFLICT (batch_id, student_id) DO UPDATE SET status = 'aktif', left_on = NULL, joined_on = EXCLUDED.joined_on, updated_at = now()`,
            [batchId, id, mulai, actor.id || null], tx
          );
        }
      });
      return { ok: true, value: { batchId, added: ids.length } };
    });
  }

  // Ubah status satu peserta: { status: 'aktif'|'lulus'|'keluar'|'pindah', note }.
  async function setParticipant(batchId, studentId, input, actor) {
    return tulis(async () => {
      const izin = await batchBoleh(batchId, actor);
      if (!izin.ok) return izin;
      const status = bersih((input || {}).status, 20);
      if (!STATUS_PESERTA.includes(status)) return { ok: false, status: 422, error: 'Status peserta belum valid.' };
      if (!adaId(studentId)) return { ok: false, status: 404, error: 'Peserta tidak ditemukan.' };
      const hariIni = tanggalJakarta(now());
      const catatan = (input || {}).note === undefined ? null : bersih(input.note, 300);
      const hasil = await ambil(
        `UPDATE batch_participants SET status = $3::text, left_on = CASE WHEN $3::text = 'aktif' THEN NULL ELSE $4::date END,
           note = coalesce($5::text, note), updated_at = now()
         WHERE batch_id = $1 AND student_id = $2 RETURNING student_id`,
        [batchId, studentId, status, hariIni, catatan]
      );
      if (!hasil.length) return { ok: false, status: 404, error: 'Peserta tidak ditemukan di batch ini.' };
      return { ok: true, value: { batchId, studentId, status } };
    });
  }

  // ------------------------------------------------------------------ riwayat santri

  // Riwayat pembinaan satu santri lintas lokasi: batch yang diikuti dan penempatan asrama, urut
  // terbaru. Melekat pada santri, bukan pada lokasi, jadi tetap utuh setelah santri berpindah.
  async function studentHistory(studentId, actor) {
    if (!actor || !accessFor) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
    const akses = await accessFor(studentId, actor);
    if (!akses.exists) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    if (!akses.view) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
    try {
      const batch = await ambil(
        `SELECT bp.status, bp.joined_on, bp.left_on, bp.note, b.id AS batch_id, b.name AS batch_name, b.starts_on, b.ends_on, b.status AS batch_status,
                p.name AS program_name, p.kind, l.name AS location_name, l.country
         FROM batch_participants bp JOIN program_batches b ON b.id = bp.batch_id JOIN programs p ON p.id = b.program_id JOIN locations l ON l.id = p.location_id
         WHERE bp.student_id = $1 ORDER BY bp.joined_on DESC`, [studentId]
      );
      let penempatan = [];
      try {
        penempatan = await ambil(
          `SELECT h.from_label, h.to_label, h.reason, h.moved_at, acc.name AS moved_by FROM placement_history h
           LEFT JOIN accounts acc ON acc.id = h.moved_by_account_id WHERE h.student_id = $1 ORDER BY h.moved_at DESC`, [studentId]
        );
      } catch (error) {
        if (!tabelBelumAda(error)) throw error;
      }
      const items = [
        ...batch.map((row) => ({
          type: 'program', date: teksTanggal(row.joined_on), title: `${row.program_name}, ${row.batch_name}`,
          kindLabel: JENIS[row.kind], location: row.location_name, country: row.country, status: row.status,
          startsOn: teksTanggal(row.starts_on), endsOn: teksTanggal(row.ends_on), leftOn: teksTanggal(row.left_on), batchStatus: row.batch_status, note: row.note || ''
        })),
        ...penempatan.map((row) => ({ type: 'penempatan', date: tanggalJakarta(new Date(row.moved_at)), title: `${row.from_label} → ${row.to_label}`, reason: row.reason || '', movedBy: row.moved_by || null }))
      ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return { ok: true, value: { available: true, items } };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { ok: true, value: { available: false, items: [] } };
    }
  }

  return Object.freeze({ listLocations, report, setStaff, staffCandidates, createProgram, updateProgram, createBatch, batchDetail, updateBatch, addParticipants, setParticipant, studentHistory });
}

module.exports = { createProgramService, ALUR, JENIS, STATUS_PESERTA };
