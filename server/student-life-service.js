'use strict';

const crypto = require('node:crypto');

// Kehidupan santri sehari-hari: peta hafalan 30 juz, pengumuman, dan pengajuan izin.
//
// Data di tabel student_juz_progress, announcements, dan student_leave_requests (migrasi
// 045). Kode ini boleh online lebih dulu: selama tabel belum ada, pembacaan mengembalikan
// kosong dengan tersedia: false, dan penyimpanan ditolak dengan arahan ke halaman
// Pengaturan. Hak akses per santri memakai accessFor milik student-portal-service, jadi
// musyrif hanya bisa mengubah santri di asrama yang dia pegang.

const JUZ_STATUSES = Object.freeze(['belum', 'sedang', 'hafal']);
const AUDIENCES = Object.freeze(['santri', 'wali', 'semua']);
const LEAVE_KINDS = Object.freeze({ 'keluar-asrama': 'Izin keluar asrama', sakit: 'Izin sakit', lainnya: 'Izin lainnya' });
const LEAVE_DECISIONS = Object.freeze(['disetujui', 'ditolak']);
const MAX_LEAVE_DAYS = 30;
const MAX_PENDING_LEAVES = 3;
const HARI_MS = 24 * 60 * 60 * 1000;

const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk fitur ini. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';
// Batas pesan wali per santri per hari, supaya kotak masuk musyrif tidak dibanjiri.
const MAX_FAMILY_MESSAGES_PER_DAY = 10;

function tabelBelumAda(error) {
  if (!error) return false;
  if (error.code === '42P01') return true;
  return /(student_juz_progress|announcements|student_leave_requests|family_messages)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function teks(value) {
  // Isi pengumuman boleh berparagraf: hanya spasi di tepi yang dibuang.
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function tanggalJakarta(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : null);
}

function createStudentLifeService({ database, accessFor, getStudent, staffDormitories, recordAttendance, now = () => new Date() } = {}) {
  if (!database || typeof accessFor !== 'function' || typeof getStudent !== 'function'
    || typeof staffDormitories !== 'function' || typeof recordAttendance !== 'function') {
    throw new Error('createStudentLifeService membutuhkan database, accessFor, getStudent, staffDormitories, dan recordAttendance.');
  }

  // Menjalankan kueri; tabel yang belum ada dibalas `kosong` (pembacaan) atau 409 (penulisan).
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

  async function aksesSantri(studentId, actor, perlu) {
    const akses = await accessFor(studentId, actor);
    if (!akses.exists) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    if (!akses[perlu]) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
    return { ok: true };
  }

  // -------------------------------------------------------------- peta hafalan juz

  async function juzMap(studentId, actor) {
    const akses = await aksesSantri(studentId, actor, 'view');
    if (!akses.ok) return akses;
    const hasil = await baca(async () => {
      const { rows } = await database.query('SELECT juz, status, updated_at FROM student_juz_progress WHERE student_id = $1', [studentId]);
      return { tersedia: true, rows };
    }, { tersedia: false, rows: [] });
    const peta = new Map(hasil.rows.map((row) => [Number(row.juz), row.status]));
    const juz = Array.from({ length: 30 }, (_, indeks) => ({ number: indeks + 1, status: peta.get(indeks + 1) || 'belum' }));
    const terakhir = hasil.rows.reduce((paling, row) => (!paling || new Date(row.updated_at) > paling ? new Date(row.updated_at) : paling), null);
    return {
      ok: true,
      value: {
        tersedia: hasil.tersedia,
        juz,
        hafal: juz.filter((item) => item.status === 'hafal').length,
        sedang: juz.filter((item) => item.status === 'sedang').length,
        updatedAt: iso(terakhir)
      }
    };
  }

  // Musyrif asrama santri itu atau admin. status 'belum' menghapus tandanya.
  async function setJuz(studentId, juzInput, statusInput, actor) {
    const akses = await aksesSantri(studentId, actor, 'write');
    if (!akses.ok) return akses;
    const juz = Number(juzInput);
    const status = clean(statusInput);
    if (!Number.isInteger(juz) || juz < 1 || juz > 30) return { ok: false, error: 'Juz harus 1 sampai 30.' };
    if (!JUZ_STATUSES.includes(status)) return { ok: false, error: 'Status hafalan tidak dikenal.' };
    return tulis(async () => {
      if (status === 'belum') {
        await database.query('DELETE FROM student_juz_progress WHERE student_id = $1 AND juz = $2', [studentId, juz]);
      } else {
        await database.query(
          `INSERT INTO student_juz_progress (student_id, juz, status, updated_by_account_id, updated_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (student_id, juz) DO UPDATE
             SET status = EXCLUDED.status, updated_by_account_id = EXCLUDED.updated_by_account_id, updated_at = now()`,
          [studentId, juz, status, actor.id || null]
        );
      }
      return { ok: true, value: { juz, status } };
    });
  }

  // ------------------------------------------------------------------ pengumuman

  // Asrama yang relevan bagi pembaca: santri (asramanya), wali (asrama anak-anaknya),
  // musyrif (asrama yang dipegang). null berarti semua (admin).
  async function asramaPembaca(actor) {
    if (actor.role === 'admin') return null;
    if (actor.role === 'supervisor') return await staffDormitories(actor.id);
    if (actor.role === 'student') {
      const { rows } = await database.query('SELECT dormitory_id FROM students WHERE student_account_id = $1 AND dormitory_id IS NOT NULL', [actor.id]);
      return rows.map((row) => row.dormitory_id);
    }
    if (actor.role === 'parent') {
      const { rows } = await database.query(
        `SELECT DISTINCT s.dormitory_id FROM students s
           JOIN student_parent_accounts pa ON pa.student_id = s.id
          WHERE pa.parent_account_id = $1 AND s.dormitory_id IS NOT NULL`,
        [actor.id]
      );
      return rows.map((row) => row.dormitory_id);
    }
    return [];
  }

  function bolehKelola(pengumuman, actor, asramaMusyrif) {
    if (actor.role === 'admin') return true;
    return actor.role === 'supervisor' && Boolean(pengumuman.dormitory_id) && asramaMusyrif.includes(pengumuman.dormitory_id);
  }

  // Pengumuman yang masih berlaku untuk pembaca ini, terbaru dulu.
  async function announcementsFor(actor, { limit = 10 } = {}) {
    if (!actor) return { ok: false, status: 401, error: 'Sesi diperlukan.' };
    const asrama = await asramaPembaca(actor);
    const hariIni = tanggalJakarta(now());
    const sasaran = actor.role === 'student' ? ['santri', 'semua'] : actor.role === 'parent' ? ['wali', 'semua'] : AUDIENCES;
    const hasil = await baca(async () => {
      const { rows } = await database.query(
        `SELECT a.id, a.title, a.body, a.audience, a.dormitory_id, d.name AS dormitory_name, a.expires_on::text AS expires_on,
                a.created_at, ac.name AS author
           FROM announcements a
           LEFT JOIN dormitories d ON d.id = a.dormitory_id
           LEFT JOIN accounts ac ON ac.id = a.created_by_account_id
          WHERE a.audience = ANY($1::text[])
            AND (a.expires_on IS NULL OR a.expires_on >= $2::date)
            AND ($3::uuid[] IS NULL OR a.dormitory_id IS NULL OR a.dormitory_id = ANY($3::uuid[]))
          ORDER BY a.created_at DESC
          LIMIT $4`,
        [sasaran, hariIni, asrama, Math.min(Math.max(Number(limit) || 10, 1), 50)]
      );
      return { tersedia: true, rows };
    }, { tersedia: false, rows: [] });
    const asramaMusyrif = actor.role === 'supervisor' ? asrama : [];
    return {
      ok: true,
      value: {
        tersedia: hasil.tersedia,
        items: hasil.rows.map((row) => ({
          id: row.id,
          title: row.title,
          body: row.body,
          audience: row.audience,
          dormitoryName: row.dormitory_name || null,
          expiresOn: row.expires_on || null,
          createdAt: iso(row.created_at),
          author: row.author || null,
          canDelete: bolehKelola(row, actor, asramaMusyrif)
        }))
      }
    };
  }

  // Asrama yang boleh dituju penulis: admin semua, musyrif yang dipegang.
  async function announcementTargets(actor) {
    if (!actor || !['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif.' };
    const milik = actor.role === 'supervisor' ? await staffDormitories(actor.id) : null;
    const { rows } = await database.query(
      'SELECT id, name FROM dormitories WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[])) ORDER BY name',
      [milik]
    );
    return { ok: true, value: { allowAll: actor.role === 'admin', dormitories: rows.map((row) => ({ id: row.id, name: row.name })) } };
  }

  async function createAnnouncement(input, actor) {
    if (!actor || !['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif.' };
    const source = input || {};
    const title = clean(source.title);
    const body = teks(source.body);
    const audience = clean(source.audience);
    const dormitoryId = clean(source.dormitoryId) || null;
    const expiresOn = clean(source.expiresOn) || null;
    if (title.length < 3 || title.length > 120) return { ok: false, error: 'Judul pengumuman 3 sampai 120 karakter.' };
    if (body.length < 10 || body.length > 2000) return { ok: false, error: 'Isi pengumuman 10 sampai 2000 karakter.' };
    if (!AUDIENCES.includes(audience)) return { ok: false, error: 'Pilih penerima pengumuman.' };
    if (expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || expiresOn < tanggalJakarta(now()))) {
      return { ok: false, error: 'Tanggal berakhir harus hari ini atau setelahnya.' };
    }
    if (actor.role === 'supervisor') {
      // Musyrif hanya menulis untuk asrama yang dia pegang.
      const milik = await staffDormitories(actor.id);
      if (!dormitoryId || !milik.includes(dormitoryId)) return { ok: false, status: 403, error: 'Musyrif hanya dapat menulis pengumuman untuk asrama yang dipegang.' };
    }
    return tulis(async () => {
      if (dormitoryId) {
        const { rows } = await database.query('SELECT 1 FROM dormitories WHERE id = $1', [dormitoryId]);
        if (!rows.length) return { ok: false, error: 'Asrama tidak ditemukan.' };
      }
      const id = crypto.randomUUID();
      await database.query(
        `INSERT INTO announcements (id, title, body, audience, dormitory_id, expires_on, created_by_account_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, title, body, audience, dormitoryId, expiresOn, actor.id || null, now()]
      );
      return { ok: true, value: { id, title, audience, dormitoryId, expiresOn } };
    });
  }

  async function removeAnnouncement(id, actor) {
    if (!actor || !['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif.' };
    return tulis(async () => {
      const { rows } = await database.query('SELECT id, dormitory_id FROM announcements WHERE id = $1', [id]);
      if (!rows.length) return { ok: false, status: 404, error: 'Pengumuman tidak ditemukan.' };
      const asramaMusyrif = actor.role === 'supervisor' ? await staffDormitories(actor.id) : [];
      if (!bolehKelola(rows[0], actor, asramaMusyrif)) return { ok: false, status: 403, error: 'Pengumuman ini di luar asrama yang Anda pegang.' };
      await database.query('DELETE FROM announcements WHERE id = $1', [id]);
      return { ok: true, value: { id } };
    });
  }

  // ---------------------------------------------------------------------- izin

  function toLeave(row) {
    return {
      id: row.id,
      studentId: row.student_id,
      studentName: row.student_name || undefined,
      dormitoryName: row.dormitory_name || undefined,
      kind: row.kind,
      kindLabel: LEAVE_KINDS[row.kind] || row.kind,
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
      reason: row.reason,
      status: row.status,
      decisionNote: row.decision_note || null,
      decidedBy: row.decided_by || null,
      decidedAt: iso(row.decided_at),
      createdAt: iso(row.created_at)
    };
  }

  const SELECT_LEAVE = `SELECT l.*, s.name AS student_name, d.name AS dormitory_name, ac.name AS decided_by
      FROM student_leave_requests l
      JOIN students s ON s.id = l.student_id
      LEFT JOIN dormitories d ON d.id = s.dormitory_id
      LEFT JOIN accounts ac ON ac.id = l.decided_by_account_id`;

  // Santri mengajukan izin untuk dirinya sendiri.
  async function requestLeave(studentId, input, actor) {
    if (!actor || actor.role !== 'student') return { ok: false, status: 403, error: 'Pengajuan izin dibuat oleh santri sendiri.' };
    const akses = await aksesSantri(studentId, actor, 'view');
    if (!akses.ok) return akses;
    const source = input || {};
    const kind = clean(source.kind);
    const startsAt = new Date(clean(source.startsAt));
    const endsAt = new Date(clean(source.endsAt));
    const reason = clean(source.reason);
    if (!LEAVE_KINDS[kind]) return { ok: false, error: 'Pilih jenis izin.' };
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return { ok: false, error: 'Isi waktu mulai dan selesai izin.' };
    if (endsAt <= startsAt) return { ok: false, error: 'Waktu selesai harus setelah waktu mulai.' };
    if (endsAt - startsAt > MAX_LEAVE_DAYS * HARI_MS) return { ok: false, error: `Izin paling lama ${MAX_LEAVE_DAYS} hari. Untuk lebih lama, hubungi musyrif langsung.` };
    if (startsAt < new Date(now().getTime() - HARI_MS)) return { ok: false, error: 'Izin tidak bisa diajukan untuk waktu yang sudah lewat lebih dari sehari.' };
    if (reason.length < 5 || reason.length > 500) return { ok: false, error: 'Alasan izin 5 sampai 500 karakter.' };
    return tulis(async () => {
      const { rows: menunggu } = await database.query(
        "SELECT count(*)::int AS jumlah FROM student_leave_requests WHERE student_id = $1 AND status = 'menunggu'",
        [studentId]
      );
      if (menunggu[0].jumlah >= MAX_PENDING_LEAVES) {
        return { ok: false, error: `Masih ada ${menunggu[0].jumlah} izin yang menunggu keputusan. Tunggu atau batalkan salah satunya.` };
      }
      const id = crypto.randomUUID();
      await database.query(
        `INSERT INTO student_leave_requests (id, student_id, kind, starts_at, ends_at, reason, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'menunggu', $7)`,
        [id, studentId, kind, startsAt.toISOString(), endsAt.toISOString(), reason, now()]
      );
      const { rows } = await database.query(`${SELECT_LEAVE} WHERE l.id = $1`, [id]);
      return { ok: true, value: toLeave(rows[0]) };
    });
  }

  // Riwayat izin satu santri: santri itu, walinya, musyrifnya, admin.
  async function leavesOf(studentId, actor) {
    const akses = await aksesSantri(studentId, actor, 'view');
    if (!akses.ok) return akses;
    const hasil = await baca(async () => {
      const { rows } = await database.query(`${SELECT_LEAVE} WHERE l.student_id = $1 ORDER BY l.created_at DESC LIMIT 20`, [studentId]);
      return { tersedia: true, rows };
    }, { tersedia: false, rows: [] });
    return { ok: true, value: { tersedia: hasil.tersedia, items: hasil.rows.map(toLeave) } };
  }

  // Antrean untuk musyrif (asrama yang dipegang) dan admin (semua).
  async function leaveQueue(actor, statusInput) {
    if (!actor || !['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif.' };
    const status = clean(statusInput) || 'menunggu';
    if (!['menunggu', 'disetujui', 'ditolak', 'dibatalkan', 'semua'].includes(status)) return { ok: false, error: 'Status izin tidak dikenal.' };
    const asrama = actor.role === 'supervisor' ? await staffDormitories(actor.id) : null;
    const hasil = await baca(async () => {
      const { rows } = await database.query(
        `${SELECT_LEAVE}
          WHERE ($1::text = 'semua' OR l.status = $1)
            AND ($2::uuid[] IS NULL OR s.dormitory_id = ANY($2::uuid[]))
          ORDER BY l.created_at DESC LIMIT 50`,
        [status, asrama]
      );
      return { tersedia: true, rows };
    }, { tersedia: false, rows: [] });
    return { ok: true, value: { tersedia: hasil.tersedia, items: hasil.rows.map(toLeave) } };
  }

  // Disetujui atau ditolak, hanya dari status menunggu. Izin yang disetujui juga dicatat
  // sebagai kehadiran berstatus izin di kegiatan harian santri.
  async function decideLeave(id, input, actor) {
    if (!actor || !['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif.' };
    const source = input || {};
    const decision = clean(source.decision);
    const note = clean(source.note) || null;
    if (!LEAVE_DECISIONS.includes(decision)) return { ok: false, error: 'Pilih setujui atau tolak.' };
    if (note && note.length > 300) return { ok: false, error: 'Catatan paling banyak 300 karakter.' };
    if (decision === 'ditolak' && !note) return { ok: false, error: 'Tulis alasan penolakan supaya santri tahu.' };
    return tulis(async () => {
      const { rows } = await database.query(`${SELECT_LEAVE} WHERE l.id = $1`, [id]);
      if (!rows.length) return { ok: false, status: 404, error: 'Pengajuan izin tidak ditemukan.' };
      const izin = toLeave(rows[0]);
      const akses = await aksesSantri(izin.studentId, actor, 'write');
      if (!akses.ok) return akses;
      if (izin.status !== 'menunggu') return { ok: false, status: 409, error: 'Izin ini sudah diputuskan atau dibatalkan.' };
      const { rows: diubah } = await database.query(
        `UPDATE student_leave_requests
            SET status = $2, decision_note = $3, decided_by_account_id = $4, decided_at = $5
          WHERE id = $1 AND status = 'menunggu'
          RETURNING id`,
        [id, decision, note, actor.id || null, now()]
      );
      if (!diubah.length) return { ok: false, status: 409, error: 'Izin ini baru saja diputuskan orang lain.' };
      if (decision === 'disetujui') {
        const catatan = await recordAttendance(izin.studentId, {
          status: 'excused',
          category: izin.kindLabel,
          note: [izin.reason, note].filter(Boolean).join(' · ').slice(0, 500),
          occurredAt: izin.startsAt
        }, actor);
        if (catatan && catatan.ok && catatan.value && catatan.value.id) {
          await database.query('UPDATE student_leave_requests SET attendance_id = $2 WHERE id = $1', [id, catatan.value.id]);
        }
      }
      const { rows: akhir } = await database.query(`${SELECT_LEAVE} WHERE l.id = $1`, [id]);
      return { ok: true, value: toLeave(akhir[0]) };
    });
  }

  async function cancelLeave(id, actor) {
    if (!actor || actor.role !== 'student') return { ok: false, status: 403, error: 'Hanya santri yang mengajukan.' };
    return tulis(async () => {
      const { rows } = await database.query('SELECT student_id, status FROM student_leave_requests WHERE id = $1', [id]);
      if (!rows.length) return { ok: false, status: 404, error: 'Pengajuan izin tidak ditemukan.' };
      const akses = await aksesSantri(rows[0].student_id, actor, 'view');
      if (!akses.ok) return akses;
      const { rows: diubah } = await database.query(
        "UPDATE student_leave_requests SET status = 'dibatalkan', decided_at = $2 WHERE id = $1 AND status = 'menunggu' RETURNING id",
        [id, now()]
      );
      if (!diubah.length) return { ok: false, status: 409, error: 'Izin yang sudah diputuskan tidak bisa dibatalkan.' };
      return { ok: true, value: { id, studentId: rows[0].student_id } };
    });
  }

  // ------------------------------------------------- pesan dan doa dari wali
  // Dibaca musyrif asrama santri itu dan admin. Santri tidak membacanya; wali hanya
  // melihat pesannya sendiri beserta status sudah dibaca.

  function toFamilyMessage(row) {
    return {
      id: row.id,
      studentId: row.student_id,
      studentName: row.student_name || undefined,
      dormitoryName: row.dormitory_name || undefined,
      parentName: row.parent_name || undefined,
      body: row.body,
      readAt: iso(row.read_at),
      readBy: row.read_by || null,
      createdAt: iso(row.created_at)
    };
  }

  const SELECT_FAMILY = `SELECT m.*, s.name AS student_name, d.name AS dormitory_name, p.name AS parent_name, r.name AS read_by
      FROM family_messages m
      JOIN students s ON s.id = m.student_id
      LEFT JOIN dormitories d ON d.id = s.dormitory_id
      LEFT JOIN accounts p ON p.id = m.parent_account_id
      LEFT JOIN accounts r ON r.id = m.read_by_account_id`;

  async function sendFamilyMessage(studentId, input, actor) {
    if (!actor || actor.role !== 'parent') return { ok: false, status: 403, error: 'Pesan untuk ananda dikirim oleh wali.' };
    const akses = await aksesSantri(studentId, actor, 'view');
    if (!akses.ok) return akses;
    const body = teks(input && input.body);
    if (body.length < 5 || body.length > 1000) return { ok: false, error: 'Pesan 5 sampai 1000 karakter.' };
    return tulis(async () => {
      const { rows: hitung } = await database.query(
        `SELECT count(*)::int AS jumlah FROM family_messages
          WHERE student_id = $1 AND parent_account_id = $2 AND created_at > $3`,
        [studentId, actor.id, new Date(now().getTime() - HARI_MS)]
      );
      if (hitung[0].jumlah >= MAX_FAMILY_MESSAGES_PER_DAY) {
        return { ok: false, status: 429, error: `Paling banyak ${MAX_FAMILY_MESSAGES_PER_DAY} pesan sehari untuk satu ananda. Coba lagi besok.` };
      }
      const id = crypto.randomUUID();
      await database.query(
        'INSERT INTO family_messages (id, student_id, parent_account_id, body, created_at) VALUES ($1, $2, $3, $4, $5)',
        [id, studentId, actor.id, body, now()]
      );
      const { rows } = await database.query(`${SELECT_FAMILY} WHERE m.id = $1`, [id]);
      return { ok: true, value: toFamilyMessage(rows[0]) };
    });
  }

  // Wali: pesannya sendiri untuk santri ini. Musyrif asramanya dan admin: semua pesan
  // untuk santri ini. Santri: ditolak.
  async function familyMessagesOf(studentId, actor) {
    if (!actor || actor.role === 'student') return { ok: false, status: 403, error: 'Pesan wali hanya dibaca musyrif.' };
    const akses = await aksesSantri(studentId, actor, 'view');
    if (!akses.ok) return akses;
    const hasil = await baca(async () => {
      const { rows } = await database.query(
        `${SELECT_FAMILY} WHERE m.student_id = $1 AND ($2::uuid IS NULL OR m.parent_account_id = $2) ORDER BY m.created_at DESC LIMIT 20`,
        [studentId, actor.role === 'parent' ? actor.id : null]
      );
      return { tersedia: true, rows };
    }, { tersedia: false, rows: [] });
    return { ok: true, value: { tersedia: hasil.tersedia, items: hasil.rows.map(toFamilyMessage) } };
  }

  // Kotak masuk musyrif (asrama yang dipegang) dan admin (semua). status: belum | semua.
  async function familyInbox(actor, statusInput) {
    if (!actor || !['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif.' };
    const status = clean(statusInput) || 'belum';
    if (!['belum', 'semua'].includes(status)) return { ok: false, error: 'Status pesan tidak dikenal.' };
    const asrama = actor.role === 'supervisor' ? await staffDormitories(actor.id) : null;
    const hasil = await baca(async () => {
      const { rows } = await database.query(
        `${SELECT_FAMILY}
          WHERE ($1::text = 'semua' OR m.read_at IS NULL)
            AND ($2::uuid[] IS NULL OR s.dormitory_id = ANY($2::uuid[]))
          ORDER BY m.created_at DESC LIMIT 50`,
        [status, asrama]
      );
      return { tersedia: true, rows };
    }, { tersedia: false, rows: [] });
    return { ok: true, value: { tersedia: hasil.tersedia, items: hasil.rows.map(toFamilyMessage) } };
  }

  async function markFamilyMessageRead(id, actor) {
    if (!actor || !['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif.' };
    return tulis(async () => {
      const { rows } = await database.query('SELECT student_id, read_at FROM family_messages WHERE id = $1', [id]);
      if (!rows.length) return { ok: false, status: 404, error: 'Pesan tidak ditemukan.' };
      const akses = await aksesSantri(rows[0].student_id, actor, 'write');
      if (!akses.ok) return akses;
      if (!rows[0].read_at) {
        await database.query(
          'UPDATE family_messages SET read_at = $2, read_by_account_id = $3 WHERE id = $1 AND read_at IS NULL',
          [id, now(), actor.id || null]
        );
      }
      const { rows: akhir } = await database.query(`${SELECT_FAMILY} WHERE m.id = $1`, [id]);
      return { ok: true, value: toFamilyMessage(akhir[0]) };
    });
  }

  return Object.freeze({
    announcementTargets, announcementsFor, cancelLeave, createAnnouncement, decideLeave,
    familyInbox, familyMessagesOf, juzMap, leaveQueue, leavesOf, markFamilyMessageRead,
    removeAnnouncement, requestLeave, sendFamilyMessage, setJuz
  });
}

module.exports = { AUDIENCES, JUZ_STATUSES, LEAVE_KINDS, createStudentLifeService };
