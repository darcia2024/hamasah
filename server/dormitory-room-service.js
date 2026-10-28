'use strict';
// Struktur lokasi, asrama, kamar, dan penempatan santri (migrasi 059).
//
//   lokasi -> asrama -> kamar -> santri
//
// Setiap kamar punya kapasitas maksimal, daftar penghuni, tanda AC atau non-AC, dan boleh punya
// musyrif penanggung jawab. Santri bisa dipindahkan antar kamar atau antar asrama, dan setiap
// pemindahan tercatat di placement_history.
//
// Aturan akses: admin mengelola semua asrama. Musyrif hanya mengelola asrama yang ditugaskan
// kepadanya, dan pemindahan antar asrama hanya boleh bila ia memegang kedua asrama itu. Izin
// tambahan diberikan admin dengan menugaskan musyrif ke asrama tambahan (halaman Monitoring);
// tidak ada jalur lain yang melonggarkan batas ini.
//
// Kode ini boleh online lebih dulu daripada migrasi: selama tabelnya belum ada, pembacaan
// mengembalikan tersedia: false dan penyimpanan dibalas 409 dengan arahan ke halaman Pengaturan.

const crypto = require('node:crypto');

const ADMIN_ROLE = 'admin';
const SUPERVISOR_ROLE = 'supervisor';
const NEGARA = Object.freeze(['Mesir', 'Indonesia']);
const RIWAYAT_ASRAMA = 40;
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk struktur kamar. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';

function tabelBelumAda(error) {
  if (!error) return false;
  if (error.code === '42P01' || error.code === '42703') return true;
  return /(dormitory_rooms|placement_history|locations|room_id|location_id)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function bersih(value, maks) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maks);
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : null);
}

function adaId(value) {
  return /^[\w-]{8,64}$/.test(String(value || ''));
}

// Keadaan kamar: kosong, sebagian, penuh, atau melebihi (penghuni lebih banyak dari kapasitas).
function keadaanKamar(penghuni, kapasitas) {
  if (penghuni === 0) return 'kosong';
  if (penghuni > kapasitas) return 'melebihi';
  return penghuni === kapasitas ? 'penuh' : 'sebagian';
}

function createDormitoryRoomService({ database, staffDormitories, now = () => new Date() } = {}) {
  if (!database || typeof staffDormitories !== 'function') throw new Error('createDormitoryRoomService membutuhkan database dan staffDormitories.');

  async function ambil(sql, params = [], tx = database) {
    return (await tx.query(sql, params)).rows;
  }

  function pelakuStaf(actor) {
    return Boolean(actor && [ADMIN_ROLE, SUPERVISOR_ROLE].includes(actor.role));
  }

  // null = semua asrama (admin); daftar id untuk musyrif.
  async function asramaBoleh(actor) {
    return actor.role === SUPERVISOR_ROLE ? ((await staffDormitories(actor.id)) || []).map(String) : null;
  }

  async function bolehKelola(dormitoryId, actor) {
    if (!pelakuStaf(actor)) return { ok: false, status: 403, error: 'Kelola Asrama untuk musyrif dan admin.' };
    if (!adaId(dormitoryId)) return { ok: false, status: 404, error: 'Asrama tidak ditemukan.' };
    const asrama = (await ambil('SELECT id, name, area, gender, capacity FROM dormitories WHERE id = $1', [dormitoryId]))[0];
    if (!asrama) return { ok: false, status: 404, error: 'Asrama tidak ditemukan.' };
    const milik = await asramaBoleh(actor);
    if (milik !== null && !milik.includes(String(dormitoryId))) {
      return { ok: false, status: 403, error: 'Asrama ini bukan asrama yang Anda pegang. Minta admin menugaskan Anda bila perlu mengelolanya.' };
    }
    return { ok: true, asrama };
  }

  async function tulis(fn) {
    try {
      return await fn();
    } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  function bentukKamar(row, penghuni) {
    const daftar = penghuni.filter((s) => s.room_id === row.id);
    const kapasitas = Number(row.capacity);
    return {
      id: row.id,
      name: row.name,
      capacity: kapasitas,
      hasAc: Boolean(row.has_ac),
      note: row.note || '',
      supervisorId: row.supervisor_account_id || null,
      supervisorName: row.supervisor_name || null,
      occupants: daftar.map((s) => ({ id: s.id, name: s.name, onLeave: s.status === 'leave' })),
      occupied: daftar.length,
      free: Math.max(0, kapasitas - daftar.length),
      state: keadaanKamar(daftar.length, kapasitas)
    };
  }

  // Gambaran satu asrama: kamar, penghuni, santri yang belum berkamar, dan riwayat pemindahan.
  async function overview(dormitoryId, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    const musyrif = await ambil(
      `SELECT acc.id, acc.name FROM staff_dormitory_assignments a JOIN accounts acc ON acc.id = a.account_id
       WHERE a.dormitory_id = $1 ORDER BY acc.name`,
      [dormitoryId]
    );
    let santri;
    try {
      santri = await ambil(`SELECT id, name, room_id, status FROM students WHERE dormitory_id = $1 AND status IN ('active', 'leave') ORDER BY name`, [dormitoryId]);
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      santri = (await ambil(`SELECT id, name, status FROM students WHERE dormitory_id = $1 AND status IN ('active', 'leave') ORDER BY name`, [dormitoryId])).map((s) => ({ ...s, room_id: null }));
    }
    let kamar;
    let riwayat;
    let lokasi = null;
    try {
      kamar = await ambil(
        `SELECT r.*, acc.name AS supervisor_name FROM dormitory_rooms r
         LEFT JOIN accounts acc ON acc.id = r.supervisor_account_id
         WHERE r.dormitory_id = $1 ORDER BY r.name`,
        [dormitoryId]
      );
      riwayat = await ambil(
        `SELECT h.id, h.student_id, s.name AS student_name, h.from_label, h.to_label, h.reason, h.moved_at, acc.name AS moved_by
         FROM placement_history h JOIN students s ON s.id = h.student_id
         LEFT JOIN accounts acc ON acc.id = h.moved_by_account_id
         WHERE h.to_dormitory_id = $1 OR h.from_dormitory_id = $1
         ORDER BY h.moved_at DESC LIMIT ${RIWAYAT_ASRAMA}`,
        [dormitoryId]
      );
      lokasi = (await ambil(
        `SELECT l.id, l.name, l.country FROM dormitories d JOIN locations l ON l.id = d.location_id WHERE d.id = $1`,
        [dormitoryId]
      ))[0] || null;
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return {
        ok: true,
        value: {
          available: false,
          dormitory: { id: izin.asrama.id, name: izin.asrama.name, area: izin.asrama.area, gender: izin.asrama.gender },
          supervisors: musyrif, rooms: [], unplaced: santri.map((s) => ({ id: s.id, name: s.name })), history: [], summary: null, location: null
        }
      };
    }
    // Santri hanya dianggap menghuni kamar bila kamarnya milik asrama ini (lihat migrasi 059).
    const idKamar = new Set(kamar.map((k) => k.id));
    const berkamar = santri.filter((s) => s.room_id && idKamar.has(s.room_id));
    const rooms = kamar.map((k) => bentukKamar(k, berkamar));
    const kapasitas = rooms.reduce((jumlah, k) => jumlah + k.capacity, 0);
    const terisi = rooms.reduce((jumlah, k) => jumlah + k.occupied, 0);
    return {
      ok: true,
      value: {
        available: true,
        dormitory: { id: izin.asrama.id, name: izin.asrama.name, area: izin.asrama.area, gender: izin.asrama.gender },
        location: lokasi,
        supervisors: musyrif,
        rooms,
        unplaced: santri.filter((s) => s.status !== 'leave' && (!s.room_id || !idKamar.has(s.room_id))).map((s) => ({ id: s.id, name: s.name })),
        history: riwayat.map((h) => ({ id: h.id, studentId: h.student_id, studentName: h.student_name, from: h.from_label, to: h.to_label, reason: h.reason, movedBy: h.moved_by || null, movedAt: iso(h.moved_at) })),
        summary: {
          rooms: rooms.length,
          capacity: kapasitas,
          occupied: terisi,
          free: Math.max(0, kapasitas - terisi),
          empty: rooms.filter((k) => k.state === 'kosong').length,
          full: rooms.filter((k) => ['penuh', 'melebihi'].includes(k.state)).length,
          withAc: rooms.filter((k) => k.hasAc).length,
          withoutAc: rooms.filter((k) => !k.hasAc).length,
          held: berkamar.filter((s) => s.status === 'leave').length,
          unplaced: santri.filter((s) => s.status !== 'leave').length - berkamar.filter((s) => s.status !== 'leave').length
        }
      }
    };
  }

  async function bacaKamarInput(input, dormitoryId, kamarId) {
    const sumber = input || {};
    const nama = bersih(sumber.name, 60);
    const kapasitas = Number(sumber.capacity);
    const catatan = bersih(sumber.note, 300);
    if (!nama) return { ok: false, status: 422, error: 'Isi nama atau nomor kamar.' };
    if (!Number.isInteger(kapasitas) || kapasitas < 1 || kapasitas > 40) return { ok: false, status: 422, error: 'Kapasitas kamar 1 sampai 40 orang.' };
    let penanggung = null;
    if (sumber.supervisorId) {
      penanggung = String(sumber.supervisorId);
      const pegang = await ambil('SELECT 1 FROM staff_dormitory_assignments WHERE dormitory_id = $1 AND account_id = $2', [dormitoryId, penanggung]);
      if (!adaId(penanggung) || !pegang.length) return { ok: false, status: 422, error: 'Penanggung jawab harus musyrif yang memegang asrama ini.' };
    }
    const kembar = await ambil('SELECT id FROM dormitory_rooms WHERE dormitory_id = $1 AND lower(name) = lower($2) AND ($3::uuid IS NULL OR id <> $3::uuid)', [dormitoryId, nama, kamarId || null]);
    if (kembar.length) return { ok: false, status: 409, error: 'Nama kamar sudah dipakai di asrama ini.' };
    return { ok: true, value: { nama, kapasitas, catatan, penanggung, adaAc: Boolean(sumber.hasAc) } };
  }

  async function createRoom(dormitoryId, input, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    return tulis(async () => {
      const baca = await bacaKamarInput(input, dormitoryId, null);
      if (!baca.ok) return baca;
      const k = baca.value;
      const id = crypto.randomUUID();
      await ambil(
        `INSERT INTO dormitory_rooms (id, dormitory_id, name, capacity, has_ac, note, supervisor_account_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, dormitoryId, k.nama, k.kapasitas, k.adaAc, k.catatan, k.penanggung]
      );
      return { ok: true, value: { id } };
    });
  }

  async function ambilKamar(dormitoryId, roomId) {
    if (!adaId(roomId)) return null;
    return (await ambil('SELECT * FROM dormitory_rooms WHERE id = $1 AND dormitory_id = $2', [roomId, dormitoryId]))[0] || null;
  }

  async function updateRoom(dormitoryId, roomId, input, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    return tulis(async () => {
      const kamar = await ambilKamar(dormitoryId, roomId);
      if (!kamar) return { ok: false, status: 404, error: 'Kamar tidak ditemukan.' };
      const baca = await bacaKamarInput({ ...{ name: kamar.name, capacity: kamar.capacity, hasAc: kamar.has_ac, note: kamar.note, supervisorId: kamar.supervisor_account_id }, ...input }, dormitoryId, roomId);
      if (!baca.ok) return baca;
      const k = baca.value;
      const [{ jumlah }] = await ambil(`SELECT count(*)::int AS jumlah FROM students WHERE room_id = $1 AND dormitory_id = $2 AND status IN ('active', 'leave')`, [roomId, dormitoryId]);
      if (k.kapasitas < jumlah) return { ok: false, status: 409, error: `Kamar ini dihuni ${jumlah} santri, kapasitasnya tidak bisa di bawah itu. Pindahkan dulu sebagian penghuninya.` };
      await ambil(
        `UPDATE dormitory_rooms SET name = $3, capacity = $4, has_ac = $5, note = $6, supervisor_account_id = $7, updated_at = now()
         WHERE id = $1 AND dormitory_id = $2`,
        [roomId, dormitoryId, k.nama, k.kapasitas, k.adaAc, k.catatan, k.penanggung]
      );
      return { ok: true, value: { id: roomId } };
    });
  }

  async function deleteRoom(dormitoryId, roomId, actor) {
    const izin = await bolehKelola(dormitoryId, actor);
    if (!izin.ok) return izin;
    return tulis(async () => {
      const kamar = await ambilKamar(dormitoryId, roomId);
      if (!kamar) return { ok: false, status: 404, error: 'Kamar tidak ditemukan.' };
      const [{ jumlah }] = await ambil(`SELECT count(*)::int AS jumlah FROM students WHERE room_id = $1 AND dormitory_id = $2 AND status IN ('active', 'leave')`, [roomId, dormitoryId]);
      if (jumlah > 0) return { ok: false, status: 409, error: `Kamar ini masih dihuni ${jumlah} santri. Pindahkan penghuninya dulu.` };
      await ambil('DELETE FROM dormitory_rooms WHERE id = $1 AND dormitory_id = $2', [roomId, dormitoryId]);
      return { ok: true, value: { id: roomId } };
    });
  }

  function labelTempat(asrama, kamar) {
    if (!asrama) return 'Belum berasrama';
    return kamar ? `${asrama.name}, kamar ${kamar.name}` : `${asrama.name}, belum berkamar`;
  }

  // Tempatkan atau pindahkan santri: { dormitoryId, roomId (boleh kosong), reason }.
  // Musyrif harus memegang asrama asal (bila ada) dan asrama tujuan.
  async function placeStudent(studentId, input, actor) {
    if (!pelakuStaf(actor)) return { ok: false, status: 403, error: 'Kelola Asrama untuk musyrif dan admin.' };
    if (!adaId(studentId)) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    const sumber = input || {};
    const tujuanId = String(sumber.dormitoryId || '');
    const kamarId = sumber.roomId ? String(sumber.roomId) : null;
    const alasan = bersih(sumber.reason, 300);
    if (!adaId(tujuanId)) return { ok: false, status: 422, error: 'Pilih asrama tujuan.' };
    return tulis(async () => {
      const santri = (await ambil(`SELECT id, name, gender, dormitory_id, room_id FROM students WHERE id = $1 AND status IN ('active', 'leave')`, [studentId]))[0];
      if (!santri) return { ok: false, status: 404, error: 'Santri aktif tidak ditemukan.' };
      const milik = await asramaBoleh(actor);
      if (milik !== null) {
        if (santri.dormitory_id && !milik.includes(String(santri.dormitory_id))) return { ok: false, status: 403, error: 'Santri ini bukan penghuni asrama yang Anda pegang.' };
        if (!milik.includes(tujuanId)) return { ok: false, status: 403, error: 'Asrama tujuan bukan asrama yang Anda pegang. Pemindahan antar asrama perlu izin tambahan dari admin.' };
      }
      const tujuan = (await ambil('SELECT id, name, gender FROM dormitories WHERE id = $1', [tujuanId]))[0];
      if (!tujuan) return { ok: false, status: 404, error: 'Asrama tujuan tidak ditemukan.' };
      if (santri.gender && tujuan.gender !== santri.gender) return { ok: false, status: 422, error: `Asrama ${tujuan.name} untuk ${tujuan.gender}, santri ini ${santri.gender}.` };
      const kamarTujuan = kamarId ? await ambilKamar(tujuanId, kamarId) : null;
      if (kamarId && !kamarTujuan) return { ok: false, status: 404, error: 'Kamar tujuan tidak ditemukan di asrama itu.' };
      const asalAsrama = santri.dormitory_id ? (await ambil('SELECT id, name FROM dormitories WHERE id = $1', [santri.dormitory_id]))[0] : null;
      const asalKamar = santri.room_id && santri.dormitory_id ? await ambilKamar(santri.dormitory_id, santri.room_id) : null;
      if (asalAsrama && asalAsrama.id === tujuan.id && (asalKamar ? asalKamar.id : null) === (kamarTujuan ? kamarTujuan.id : null)) {
        return { ok: false, status: 409, error: 'Santri sudah berada di tempat itu.' };
      }
      return database.withTransaction(async (tx) => {
        if (kamarTujuan) {
          // Kunci baris kamar supaya dua pemindahan bersamaan tidak sama-sama mengambil kursi terakhir.
          await ambil('SELECT id FROM dormitory_rooms WHERE id = $1 FOR UPDATE', [kamarTujuan.id], tx);
          const [{ jumlah }] = await ambil(`SELECT count(*)::int AS jumlah FROM students WHERE room_id = $1 AND dormitory_id = $2 AND status IN ('active', 'leave') AND id <> $3`, [kamarTujuan.id, tujuan.id, santri.id], tx);
          if (jumlah >= Number(kamarTujuan.capacity)) return { ok: false, status: 409, error: `Kamar ${kamarTujuan.name} sudah penuh (${jumlah} dari ${kamarTujuan.capacity}).` };
        }
        await ambil('UPDATE students SET dormitory_id = $2, room_id = $3, updated_at = now() WHERE id = $1', [santri.id, tujuan.id, kamarTujuan ? kamarTujuan.id : null], tx);
        await ambil(
          `INSERT INTO placement_history (id, student_id, from_dormitory_id, from_room_id, from_label, to_dormitory_id, to_room_id, to_label, reason, moved_by_account_id, moved_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [crypto.randomUUID(), santri.id, asalAsrama ? asalAsrama.id : null, asalKamar ? asalKamar.id : null, labelTempat(asalAsrama, asalKamar),
            tujuan.id, kamarTujuan ? kamarTujuan.id : null, labelTempat(tujuan, kamarTujuan), alasan, actor.id || null, now().toISOString()],
          tx
        );
        return { ok: true, value: { studentId: santri.id, studentName: santri.name, from: labelTempat(asalAsrama, asalKamar), to: labelTempat(tujuan, kamarTujuan), crossDormitory: !asalAsrama || asalAsrama.id !== tujuan.id } };
      });
    });
  }

  // Lokasi: admin saja. Menempelkan asrama ke lokasi ikut mengisi negara asrama (saringan Monitoring pusat).
  async function listLocations(actor) {
    if (!actor || actor.role !== ADMIN_ROLE) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };
    try {
      const lokasi = await ambil(
        `SELECT l.id, l.name, l.country, count(d.id)::int AS dormitories FROM locations l
         LEFT JOIN dormitories d ON d.location_id = l.id GROUP BY l.id ORDER BY l.country, l.name`
      );
      return { ok: true, value: { available: true, locations: lokasi } };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { ok: true, value: { available: false, locations: [] } };
    }
  }

  async function createLocation(input, actor) {
    if (!actor || actor.role !== ADMIN_ROLE) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };
    const nama = bersih((input || {}).name, 80);
    const negara = bersih((input || {}).country, 20);
    if (nama.length < 2) return { ok: false, status: 422, error: 'Isi nama lokasi.' };
    if (!NEGARA.includes(negara)) return { ok: false, status: 422, error: 'Pilih negara lokasi.' };
    return tulis(async () => {
      const sudah = await ambil('SELECT id FROM locations WHERE lower(name) = lower($1) AND country = $2', [nama, negara]);
      if (sudah.length) return { ok: false, status: 409, error: 'Lokasi itu sudah ada.' };
      const id = crypto.randomUUID();
      await ambil('INSERT INTO locations (id, name, country) VALUES ($1, $2, $3)', [id, nama, negara]);
      return { ok: true, value: { id, name: nama, country: negara } };
    });
  }

  // Tempel asrama ke lokasi: { locationId }. Negara asrama mengikuti negara lokasi.
  async function setDormitoryLocation(dormitoryId, input, actor) {
    if (!actor || actor.role !== ADMIN_ROLE) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };
    if (!adaId(dormitoryId)) return { ok: false, status: 404, error: 'Asrama tidak ditemukan.' };
    const lokasiId = (input || {}).locationId ? String((input || {}).locationId) : null;
    return tulis(async () => {
      const lokasi = lokasiId ? (await ambil('SELECT id, name, country FROM locations WHERE id = $1', [adaId(lokasiId) ? lokasiId : crypto.randomUUID()]))[0] : null;
      if (lokasiId && !lokasi) return { ok: false, status: 404, error: 'Lokasi tidak ditemukan.' };
      const ubah = await ambil('UPDATE dormitories SET location_id = $2, updated_at = now() WHERE id = $1 RETURNING id', [dormitoryId, lokasi ? lokasi.id : null]);
      if (!ubah.length) return { ok: false, status: 404, error: 'Asrama tidak ditemukan.' };
      if (lokasi) {
        try {
          await ambil('UPDATE dormitories SET country = $2 WHERE id = $1', [dormitoryId, lokasi.country]);
        } catch (error) {
          if (error.code !== '42703') throw error;
        }
      }
      return { ok: true, value: { dormitoryId, location: lokasi } };
    });
  }

  return Object.freeze({ overview, createRoom, updateRoom, deleteRoom, placeStudent, listLocations, createLocation, setDormitoryLocation });
}

module.exports = { createDormitoryRoomService, keadaanKamar, DATABASE_BELUM_SIAP };
