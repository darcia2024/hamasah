'use strict';
const crypto = require('node:crypto');
// Iqamah santri: berapa lama lagi berlaku dan kapan harus mulai diperpanjang.
//
// Tanggal habis yang sudah dicek disimpan di visa_tracking.visa_expires_at, sumber yang
// sama dengan halaman Visa dan pengingat di dashboard admin. Santri tidak menulis ke sana:
// santri melapor tanggal iqamah barunya (residence_reports, migrasi 052), lalu musyrif
// asramanya atau admin menerima atau menolak. Musyrif dan admin juga bisa mengisi tanggal
// langsung. Penanda "sedang diurus" (residence_renewals) boleh dipasang santri sendiri,
// karena hanya informasi untuk musyrif dan tidak mengubah tanggal.
//
// Aturan waktu: perpanjangan mulai diurus paling lambat BATAS_URUS_HARI sebelum habis,
// dan berkas mulai disiapkan SIAPKAN_HARI sebelum habis. Paspor perlu berlaku minimal
// PASPOR_MINIMAL_HARI saat mengurus perpanjangan iqamah.

const BATAS_URUS_HARI = 30;
const SIAPKAN_HARI = 60;
const PASPOR_MINIMAL_HARI = 180;
const MAKS_TAHUN_KE_DEPAN = 3;
const HARI_MS = 24 * 60 * 60 * 1000;
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk laporan iqamah. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';
// Urutan daftar musyrif: yang perlu tindakan paling atas.
const URUTAN_TAHAP = Object.freeze({ habis: 0, urus: 1, siapkan: 2, kosong: 3, aman: 4 });

function tabelBelumAda(error) {
  if (!error) return false;
  if (error.code === '42P01') return true;
  return /(residence_reports|residence_renewals)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function clean(value, max = 300) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function tanggalJakarta(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function isTanggal(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function geser(iso, hari) {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + hari * HARI_MS).toISOString().slice(0, 10);
}

function selisihHari(dari, ke) {
  return Math.round((new Date(`${ke}T00:00:00Z`) - new Date(`${dari}T00:00:00Z`)) / HARI_MS);
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : null);
}

// Status iqamah pada hari tertentu. tahap: kosong (belum ada tanggal), aman, siapkan
// (berkas mulai disiapkan), urus (sudah lewat batas mulai mengurus), habis.
function hitungIqamah(expiresOn, hariIni) {
  if (!expiresOn) return { expiresOn: null, sisaHari: null, batasUrus: null, mulaiSiapkan: null, tahap: 'kosong' };
  const sisaHari = selisihHari(hariIni, expiresOn);
  let tahap = 'aman';
  if (sisaHari < 0) tahap = 'habis';
  else if (sisaHari <= BATAS_URUS_HARI) tahap = 'urus';
  else if (sisaHari <= SIAPKAN_HARI) tahap = 'siapkan';
  return {
    expiresOn,
    sisaHari,
    batasUrus: geser(expiresOn, -BATAS_URUS_HARI),
    mulaiSiapkan: geser(expiresOn, -SIAPKAN_HARI),
    tahap
  };
}

function hitungPaspor(expiresOn, hariIni) {
  if (!expiresOn) return null;
  const sisaHari = selisihHari(hariIni, expiresOn);
  return { expiresOn, sisaHari, cukup: sisaHari >= PASPOR_MINIMAL_HARI };
}

function createResidenceService({ database, accessFor, listStudentsForActor, staffDormitories, now = () => new Date() } = {}) {
  if (!database || typeof accessFor !== 'function' || typeof listStudentsForActor !== 'function' || typeof staffDormitories !== 'function') {
    throw new Error('createResidenceService membutuhkan database, accessFor, listStudentsForActor, dan staffDormitories.');
  }

  async function ambil(sql, params = []) {
    return (await database.query(sql, params)).rows;
  }

  // Bacaan dari tabel migrasi 052 boleh gagal karena tabel belum ada: hasilnya `kosong`.
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

  function hariIni() {
    return tanggalJakarta(now());
  }

  function barisLaporan(row) {
    return {
      id: row.id,
      studentId: row.student_id,
      expiresOn: row.expires_on,
      note: row.note,
      status: row.status,
      createdAt: iso(row.created_at),
      decidedAt: iso(row.decided_at),
      decisionNote: row.decision_note || null
    };
  }

  // Status iqamah untuk sekumpulan santri sekaligus.
  async function statusUntuk(studentIds) {
    const ids = studentIds.map(String);
    if (!ids.length) return new Map();
    const tanggal = await ambil(
      `SELECT student_id::text AS student_id, visa_expires_at::text AS iqamah, passport_expires_at::text AS paspor
         FROM visa_tracking WHERE student_id::text = ANY($1::text[])`,
      [ids]
    );
    const tambahan = await baca(async () => ({
      tersedia: true,
      laporan: await ambil(
        `SELECT DISTINCT ON (student_id) id, student_id::text AS student_id, expires_on::text AS expires_on, note, status,
                created_at, decided_at, decision_note
           FROM residence_reports WHERE student_id::text = ANY($1::text[])
          ORDER BY student_id, (status = 'menunggu') DESC, created_at DESC`,
        [ids]
      ),
      pengurusan: await ambil(
        `SELECT student_id::text AS student_id, started_on::text AS started_on, note, updated_at
           FROM residence_renewals WHERE student_id::text = ANY($1::text[])`,
        [ids]
      )
    }), { tersedia: false, laporan: [], pengurusan: [] });
    const hari = hariIni();
    const hasil = new Map();
    for (const id of ids) {
      const t = tanggal.find((row) => row.student_id === id) || {};
      const laporan = tambahan.laporan.find((row) => row.student_id === id);
      const urus = tambahan.pengurusan.find((row) => row.student_id === id);
      hasil.set(id, {
        tersedia: tambahan.tersedia,
        iqamah: hitungIqamah(t.iqamah || null, hari),
        paspor: hitungPaspor(t.paspor || null, hari),
        laporan: laporan ? barisLaporan(laporan) : null,
        pengurusan: urus ? { startedOn: urus.started_on, note: urus.note, updatedAt: iso(urus.updated_at) } : null
      });
    }
    return hasil;
  }

  // ------------------------------------------------------------------ santri dan wali
  async function forFamily(actor) {
    if (!actor || !['student', 'parent', 'admin'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya untuk santri dan wali.' };
    const anak = actor.role === 'admin' ? [] : await listStudentsForActor(actor);
    const status = await statusUntuk(anak.map((s) => s.id));
    return {
      ok: true,
      value: {
        today: hariIni(),
        aturan: { batasUrusHari: BATAS_URUS_HARI, siapkanHari: SIAPKAN_HARI, pasporMinimalHari: PASPOR_MINIMAL_HARI },
        students: anak.map((s) => ({ id: s.id, name: s.name, ...status.get(String(s.id)) }))
      }
    };
  }

  function validasiTanggal(expiresOn) {
    if (!isTanggal(expiresOn)) return 'Isi tanggal habis iqamah sesuai kartu iqamah.';
    const hari = hariIni();
    if (expiresOn < geser(hari, -365)) return 'Tanggal terlalu lama di masa lalu. Periksa lagi tahunnya.';
    if (expiresOn > geser(hari, 365 * MAKS_TAHUN_KE_DEPAN)) return `Tanggal lebih dari ${MAKS_TAHUN_KE_DEPAN} tahun ke depan. Periksa lagi tahunnya.`;
    return null;
  }

  // Santri melapor tanggal iqamah baru (biasanya setelah perpanjangan selesai). Laporan
  // yang masih menunggu diganti dengan yang baru, jadi musyrif hanya mengecek satu.
  async function report(studentId, input, actor) {
    if (!actor || actor.role !== 'student') return { ok: false, status: 403, error: 'Laporan iqamah dikirim oleh santri sendiri.' };
    const akses = await accessFor(studentId, actor);
    if (!akses.exists) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    if (!akses.view) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
    const source = input || {};
    const expiresOn = clean(source.expiresOn, 10);
    const salah = validasiTanggal(expiresOn);
    if (salah) return { ok: false, error: salah };
    const note = clean(source.note);
    return tulis(async () => {
      await database.withTransaction(async (tx) => {
        await tx.query("DELETE FROM residence_reports WHERE student_id = $1 AND status = 'menunggu'", [studentId]);
        await tx.query(
          `INSERT INTO residence_reports (id, student_id, expires_on, note, status, reported_by_account_id, created_at)
           VALUES ($1, $2, $3, $4, 'menunggu', $5, $6)`,
          [crypto.randomUUID(), studentId, expiresOn, note, actor.id || null, now().toISOString()]
        );
      });
      return { ok: true, value: (await statusUntuk([studentId])).get(String(studentId)) };
    });
  }

  // Penanda pengurusan perpanjangan: santri sendiri, musyrif asramanya, atau admin.
  async function setRenewal(studentId, input, actor) {
    const akses = await accessFor(studentId, actor);
    if (!akses.exists) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    const bolehSantri = actor && actor.role === 'student' && akses.view;
    if (!bolehSantri && !akses.write) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
    const source = input || {};
    const aktif = source.aktif !== false;
    return tulis(async () => {
      if (aktif) {
        await database.query(
          `INSERT INTO residence_renewals (student_id, started_on, note, updated_by_account_id, updated_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (student_id) DO UPDATE SET note = EXCLUDED.note, updated_by_account_id = EXCLUDED.updated_by_account_id, updated_at = now()`,
          [studentId, hariIni(), clean(source.note), actor.id || null]
        );
      } else {
        await database.query('DELETE FROM residence_renewals WHERE student_id = $1', [studentId]);
      }
      return { ok: true, value: (await statusUntuk([studentId])).get(String(studentId)) };
    });
  }

  // ------------------------------------------------------------------ musyrif dan admin
  async function simpanTanggal(tx, studentId, expiresOn) {
    await tx.query(
      `INSERT INTO visa_tracking (student_id, status, visa_expires_at, updated_at)
       VALUES ($1, 'approved', $2, now())
       ON CONFLICT (student_id) DO UPDATE
         SET visa_expires_at = EXCLUDED.visa_expires_at,
             status = CASE WHEN visa_tracking.status = 'expired' THEN 'approved' ELSE visa_tracking.status END,
             updated_at = now()`,
      [studentId, expiresOn]
    );
  }

  // Tanggal baru berarti perpanjangan selesai: penanda pengurusan dilepas. Tabel 052
  // boleh belum ada; tanggalnya tetap tersimpan.
  async function bersihkanSetelahTanggalBaru(tx, studentId, expiresOn, actor) {
    try {
      await tx.query('SAVEPOINT iqamah_052');
      await tx.query('DELETE FROM residence_renewals WHERE student_id = $1', [studentId]);
      await tx.query(
        `UPDATE residence_reports
            SET status = CASE WHEN expires_on = $2::date THEN 'diterima' ELSE 'ditolak' END,
                decision_note = CASE WHEN expires_on = $2::date THEN NULL ELSE 'Tanggal diisi langsung oleh musyrif atau admin.' END,
                decided_by_account_id = $3, decided_at = now()
          WHERE student_id = $1 AND status = 'menunggu'`,
        [studentId, expiresOn, actor.id || null]
      );
      await tx.query('RELEASE SAVEPOINT iqamah_052');
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      await tx.query('ROLLBACK TO SAVEPOINT iqamah_052');
    }
  }

  async function setExpiry(studentId, input, actor) {
    const akses = await accessFor(studentId, actor);
    if (!akses.exists) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    if (!akses.write || !['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya musyrif asrama santri ini atau admin.' };
    const expiresOn = clean(input && input.expiresOn, 10);
    const salah = validasiTanggal(expiresOn);
    if (salah) return { ok: false, error: salah };
    await database.withTransaction(async (tx) => {
      await simpanTanggal(tx, studentId, expiresOn);
      await bersihkanSetelahTanggalBaru(tx, studentId, expiresOn, actor);
    });
    return { ok: true, value: (await statusUntuk([studentId])).get(String(studentId)) };
  }

  async function decideReport(reportId, input, actor) {
    if (!actor || !['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya musyrif dan admin.' };
    const source = input || {};
    const decision = clean(source.decision, 10);
    const note = clean(source.note) || null;
    if (!['diterima', 'ditolak'].includes(decision)) return { ok: false, error: 'Pilih terima atau tolak.' };
    if (decision === 'ditolak' && !note) return { ok: false, error: 'Tulis alasan penolakan supaya santri tahu yang perlu diperbaiki.' };
    return tulis(async () => {
      const [laporan] = await ambil(
        'SELECT id, student_id::text AS student_id, expires_on::text AS expires_on, status FROM residence_reports WHERE id::text = $1',
        [String(reportId)]
      );
      if (!laporan) return { ok: false, status: 404, error: 'Laporan iqamah tidak ditemukan.' };
      const akses = await accessFor(laporan.student_id, actor);
      if (!akses.write) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
      if (laporan.status !== 'menunggu') return { ok: false, status: 409, error: 'Laporan ini sudah diputuskan.' };
      await database.withTransaction(async (tx) => {
        await tx.query(
          `UPDATE residence_reports SET status = $2, decision_note = $3, decided_by_account_id = $4, decided_at = now()
            WHERE id = $1 AND status = 'menunggu'`,
          [laporan.id, decision, note, actor.id || null]
        );
        if (decision === 'diterima') {
          await simpanTanggal(tx, laporan.student_id, laporan.expires_on);
          await tx.query('DELETE FROM residence_renewals WHERE student_id = $1', [laporan.student_id]);
        }
      });
      return { ok: true, value: { studentId: laporan.student_id, decision, ...(await statusUntuk([laporan.student_id])).get(laporan.student_id) } };
    });
  }

  // Daftar santri satu asrama untuk musyrifnya atau admin, yang perlu tindakan di atas.
  async function forDormitory(dormitoryId, actor) {
    if (!actor || !['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya musyrif dan admin.' };
    if (actor.role === 'supervisor') {
      const milik = (await staffDormitories(actor.id)).map(String);
      if (!milik.includes(String(dormitoryId))) return { ok: false, status: 403, error: 'Asrama ini bukan asrama yang Anda pegang.' };
    }
    const santri = await ambil(
      `SELECT id::text AS id, name FROM students WHERE dormitory_id::text = $1 AND status = 'active' ORDER BY name`,
      [String(dormitoryId)]
    );
    const status = await statusUntuk(santri.map((s) => s.id));
    const daftar = santri.map((s) => ({ id: s.id, name: s.name, ...status.get(s.id) }));
    daftar.sort((a, b) => {
      const menungguA = a.laporan && a.laporan.status === 'menunggu' ? 0 : 1;
      const menungguB = b.laporan && b.laporan.status === 'menunggu' ? 0 : 1;
      if (menungguA !== menungguB) return menungguA - menungguB;
      const tahap = URUTAN_TAHAP[a.iqamah.tahap] - URUTAN_TAHAP[b.iqamah.tahap];
      if (tahap) return tahap;
      return (a.iqamah.sisaHari ?? Infinity) - (b.iqamah.sisaHari ?? Infinity);
    });
    const tersedia = daftar.length ? daftar[0].tersedia : (await baca(async () => {
      await ambil('SELECT 1 FROM residence_reports LIMIT 1');
      return true;
    }, false));
    return {
      ok: true,
      value: {
        today: hariIni(),
        tersedia,
        aturan: { batasUrusHari: BATAS_URUS_HARI, siapkanHari: SIAPKAN_HARI, pasporMinimalHari: PASPOR_MINIMAL_HARI },
        students: daftar
      }
    };
  }

  return Object.freeze({ forFamily, forDormitory, report, setRenewal, setExpiry, decideReport });
}

module.exports = { BATAS_URUS_HARI, PASPOR_MINIMAL_HARI, SIAPKAN_HARI, createResidenceService, hitungIqamah };
