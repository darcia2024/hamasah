'use strict';

const crypto = require('node:crypto');
const { createDocumentPdf } = require('./pdf.js');

// Surat masuk, surat keluar, dan arsip (migrasi 070).
//
// Alur satu surat: diajukan (dicatat, berkas pindaian opsional) -> diverifikasi -> disetujui atau ditolak. Surat yang sudah
// diputuskan dapat diunduh sebagai arsip PDF berisi nomor, jejak verifikasi, dan keputusan. Surat jenis "alur keluar"
// (permohonan pengunduran diri) membawa daftar periksa keluar: dokumen, tagihan, inventaris, dan kemungkinan refund AC.
// Santri baru dinyatakan keluar (status mengundurkan diri) oleh admin setelah surat disetujui dan semua butir daftar periksa
// beres atau tidak berlaku.
//
// Siapa boleh apa: mencatat dan mengisi daftar periksa = admin, petugas pendaftaran, dan musyrif (untuk santri asramanya);
// verifikasi = admin dan petugas pendaftaran; keputusan dan menyatakan santri keluar = admin saja.

const STATUS = Object.freeze({ diajukan: 'Diajukan', diverifikasi: 'Diverifikasi', disetujui: 'Disetujui', ditolak: 'Ditolak' });
const ARAH = Object.freeze({ masuk: 'Surat masuk', keluar: 'Surat keluar' });
const BUTIR = Object.freeze({ dokumen: 'Dokumen santri dikembalikan', tagihan: 'Tagihan dan kewajiban keuangan', inventaris: 'Inventaris dan barang pinjaman', 'refund-ac': 'Kemungkinan refund AC' });
const STATUS_BUTIR = Object.freeze({ belum: 'Belum diperiksa', beres: 'Beres', bermasalah: 'Bermasalah', 'tidak-berlaku': 'Tidak berlaku' });
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk surat dan arsip. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

function tabelBelumAda(error) {
  if (!error) return false;
  if (['42P01', '42703'].includes(error.code)) return true;
  return /(letter_types|letters|letter_events|exit_checklist_items)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function rapi(value, maks) {
  return String(value === undefined || value === null ? '' : value).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, maks);
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : null);
}

function tanggalValid(teks) {
  if (!TANGGAL.test(String(teks || ''))) return false;
  const d = new Date(`${teks}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === teks;
}

function createLetterArchiveService({ database, staffDormitories, finalizeExit, acState = null, now = () => new Date() } = {}) {
  if (!database || typeof staffDormitories !== 'function') throw new Error('createLetterArchiveService membutuhkan database dan staffDormitories.');

  async function tulis(fn) {
    try { return await fn(); } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  const boleh = (actor) => Boolean(actor && ['admin', 'registration-officer', 'supervisor'].includes(actor.role));
  const verifikator = (actor) => Boolean(actor && ['admin', 'registration-officer'].includes(actor.role));
  const admin = (actor) => Boolean(actor && actor.role === 'admin');
  const TOLAK = { ok: false, status: 403, error: 'Hanya admin, petugas pendaftaran, dan musyrif yang mengelola surat.' };

  // null = semua santri; selain itu id asrama yang dipegang musyrif.
  async function batas(actor) {
    return actor.role === 'supervisor' ? ((await staffDormitories(actor.id)) || []) : null;
  }

  async function santriDalamBatas(studentId, actor) {
    if (!UUID.test(String(studentId))) return false;
    const { rows } = await database.query('SELECT dormitory_id FROM students WHERE id = $1', [studentId]);
    if (!rows.length) return false;
    const b = await batas(actor);
    return b === null || (rows[0].dormitory_id !== null && b.includes(rows[0].dormitory_id));
  }

  // ------------------------------------------------------------------ jenis surat

  function bentukJenis(row) {
    return { id: row.id, code: row.code, name: row.name, direction: row.direction, directionLabel: ARAH[row.direction], exitFlow: Boolean(row.exit_flow), confirmed: Boolean(row.confirmed), active: Boolean(row.active) };
  }

  async function listTypes(actor) {
    if (!boleh(actor)) return TOLAK;
    try {
      const { rows } = await database.query('SELECT * FROM letter_types ORDER BY active DESC, sort_order, name');
      const items = rows.map(bentukJenis);
      return { ok: true, value: { available: true, items, unconfirmed: items.filter((j) => j.active && !j.confirmed).length, canEdit: admin(actor) } };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { ok: true, value: { available: false, items: [], unconfirmed: 0, canEdit: admin(actor) } };
    }
  }

  async function createType(input, actor) {
    if (!admin(actor)) return { ok: false, status: 403, error: 'Hanya admin yang menambah jenis surat.' };
    const sumber = input || {};
    const nama = rapi(sumber.name, 120);
    if (nama.length < 3) return { ok: false, error: 'Nama jenis surat 3 sampai 120 karakter.' };
    if (!ARAH[sumber.direction]) return { ok: false, error: 'Pilih surat masuk atau surat keluar.' };
    const code = nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    if (code.length < 3) return { ok: false, error: 'Nama jenis surat belum valid.' };
    return tulis(async () => {
      const ada = await database.query('SELECT 1 FROM letter_types WHERE code = $1 OR lower(name) = lower($2)', [code, nama]);
      if (ada.rows.length) return { ok: false, status: 409, error: 'Jenis surat dengan nama itu sudah ada.' };
      const { rows } = await database.query('INSERT INTO letter_types (id, code, name, direction, exit_flow, confirmed) VALUES ($1, $2, $3, $4, $5, true) RETURNING *', [crypto.randomUUID(), code, nama, sumber.direction, Boolean(sumber.exitFlow)]);
      return { ok: true, value: bentukJenis(rows[0]) };
    });
  }

  async function updateType(id, input, actor) {
    if (!admin(actor)) return { ok: false, status: 403, error: 'Hanya admin yang mengubah jenis surat.' };
    if (!UUID.test(String(id))) return { ok: false, status: 404, error: 'Jenis surat tidak ditemukan.' };
    const sumber = input || {};
    return tulis(async () => {
      const { rows } = await database.query('SELECT * FROM letter_types WHERE id = $1', [id]);
      if (!rows.length) return { ok: false, status: 404, error: 'Jenis surat tidak ditemukan.' };
      const nama = sumber.name === undefined ? rows[0].name : rapi(sumber.name, 120);
      if (nama.length < 3) return { ok: false, error: 'Nama jenis surat 3 sampai 120 karakter.' };
      const arah = sumber.direction === undefined ? rows[0].direction : sumber.direction;
      if (!ARAH[arah]) return { ok: false, error: 'Pilih surat masuk atau surat keluar.' };
      const baru = await database.query(
        'UPDATE letter_types SET name = $2, direction = $3, exit_flow = $4, active = $5, confirmed = true WHERE id = $1 RETURNING *',
        [id, nama, arah, sumber.exitFlow === undefined ? rows[0].exit_flow : Boolean(sumber.exitFlow), sumber.active === undefined ? rows[0].active : Boolean(sumber.active)]
      );
      return { ok: true, value: bentukJenis(baru.rows[0]) };
    });
  }

  // Admin menyatakan daftar jenis surat sudah sesuai template asli.
  async function confirmTypes(actor) {
    if (!admin(actor)) return { ok: false, status: 403, error: 'Hanya admin yang mengonfirmasi daftar jenis surat.' };
    return tulis(async () => {
      const { rowCount } = await database.query('UPDATE letter_types SET confirmed = true WHERE active AND NOT confirmed');
      return { ok: true, value: { confirmed: rowCount || 0 } };
    });
  }

  // ------------------------------------------------------------------ surat

  function bentukSurat(row) {
    return {
      id: row.id, referenceNo: row.reference_no, typeId: row.type_id, typeName: row.type_name, direction: row.direction, directionLabel: ARAH[row.direction], exitFlow: Boolean(row.exit_flow),
      studentId: row.student_id || null, studentName: row.student_name || null, counterparty: row.counterparty || '', dormitoryName: row.dormitory_name || null,
      subject: row.subject, notes: row.notes || '', letterDate: row.letter_date_text, fileId: row.file_id || null,
      status: row.status, statusLabel: STATUS[row.status], createdBy: row.created_by || null, createdAt: iso(row.created_at),
      verifiedBy: row.verified_by || null, verifiedAt: iso(row.verified_at), decidedBy: row.decided_by || null, decidedAt: iso(row.decided_at), decisionNote: row.decision_note || '',
      exitCompletedAt: iso(row.exit_completed_at), exitCompletedBy: row.exit_by || null
    };
  }

  const SELECT = `SELECT l.*, to_char(l.letter_date, 'YYYY-MM-DD') AS letter_date_text, t.name AS type_name, t.direction, t.exit_flow, s.name AS student_name, d.name AS dormitory_name,
        cb.name AS created_by, vb.name AS verified_by, db.name AS decided_by, eb.name AS exit_by
      FROM letters l JOIN letter_types t ON t.id = l.type_id LEFT JOIN students s ON s.id = l.student_id LEFT JOIN dormitories d ON d.id = s.dormitory_id
      LEFT JOIN accounts cb ON cb.id = l.created_by_account_id LEFT JOIN accounts vb ON vb.id = l.verified_by_account_id
      LEFT JOIN accounts db ON db.id = l.decided_by_account_id LEFT JOIN accounts eb ON eb.id = l.exit_completed_by_account_id`;

  async function catat(letterId, action, note, actor) {
    await database.query('INSERT INTO letter_events (id, letter_id, action, note, actor_account_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [crypto.randomUUID(), letterId, action, rapi(note, 500), actor.id || null, now()]);
  }

  async function ambilSurat(id, actor) {
    if (!UUID.test(String(id))) return null;
    const { rows } = await database.query(`${SELECT} WHERE l.id = $1`, [id]);
    if (!rows.length) return null;
    const b = await batas(actor);
    if (b !== null) {
      const dorm = (await database.query('SELECT dormitory_id FROM students WHERE id = $1', [rows[0].student_id])).rows[0];
      if (!dorm || !dorm.dormitory_id || !b.includes(dorm.dormitory_id)) return null;
    }
    return rows[0];
  }

  async function santriPilihan(actor) {
    if (!boleh(actor)) return TOLAK;
    const b = await batas(actor);
    const { rows } = await database.query(
      `SELECT s.id, s.name, s.status, d.name AS dormitory_name FROM students s LEFT JOIN dormitories d ON d.id = s.dormitory_id
        WHERE s.status IN ('active', 'leave') AND ($1::uuid[] IS NULL OR s.dormitory_id = ANY($1::uuid[])) ORDER BY s.name LIMIT 1000`, [b]
    );
    return { ok: true, value: { items: rows.map((r) => ({ id: r.id, name: r.name, dormitoryName: r.dormitory_name || null })) } };
  }

  async function list(actor, { status, typeId, q } = {}) {
    if (!boleh(actor)) return TOLAK;
    if (status && !STATUS[status]) return { ok: false, error: 'Status surat tidak dikenal.' };
    const b = await batas(actor);
    try {
      const { rows } = await database.query(
        `${SELECT} WHERE ($1::text IS NULL OR l.status = $1) AND ($2::uuid IS NULL OR l.type_id = $2)
            AND ($3::text IS NULL OR s.name ILIKE $3 OR l.subject ILIKE $3 OR l.reference_no ILIKE $3 OR l.counterparty ILIKE $3)
            AND ($4::uuid[] IS NULL OR s.dormitory_id = ANY($4::uuid[])) ORDER BY l.created_at DESC LIMIT 200`,
        [status || null, typeId && UUID.test(typeId) ? typeId : null, q ? `%${rapi(q, 80).replace(/[%_]/g, '')}%` : null, b]
      );
      const hitung = rows.reduce((h, r) => ({ ...h, [r.status]: (h[r.status] || 0) + 1 }), {});
      return { ok: true, value: { available: true, items: rows.map(bentukSurat), counts: hitung, statuses: Object.entries(STATUS).map(([id, label]) => ({ id, label })) } };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { ok: true, value: { available: false, items: [], counts: {}, statuses: [] } };
    }
  }

  async function nomorBaru(arah, tahun) {
    const awalan = arah === 'keluar' ? 'SK' : 'SM';
    const pola = `${awalan}/HI/${tahun}/%`;
    const { rows } = await database.query('SELECT reference_no FROM letters WHERE reference_no LIKE $1 ORDER BY reference_no DESC LIMIT 1', [pola]);
    const terakhir = rows[0] ? Number(rows[0].reference_no.split('/').pop()) : 0;
    return `${awalan}/HI/${tahun}/${String(terakhir + 1).padStart(5, '0')}`;
  }

  async function create(input, actor) {
    if (!boleh(actor)) return TOLAK;
    const sumber = input || {};
    const subject = rapi(sumber.subject, 160).replace(/\n/g, ' ');
    if (subject.length < 3) return { ok: false, error: 'Perihal surat 3 sampai 160 karakter.' };
    const tanggal = sumber.letterDate ? String(sumber.letterDate) : now().toISOString().slice(0, 10);
    if (!tanggalValid(tanggal)) return { ok: false, error: 'Tanggal surat tidak valid.' };
    if (!UUID.test(String(sumber.typeId))) return { ok: false, error: 'Pilih jenis surat.' };
    // Surat bisa terikat pada satu santri, atau surat umum untuk lembaga (undangan, surat dinas) yang hanya dikelola admin dan petugas pendaftaran.
    const umum = !sumber.studentId;
    const pihak = rapi(sumber.counterparty, 160).replace(/\n/g, ' ');
    if (umum) {
      if ((await batas(actor)) !== null) return { ok: false, status: 403, error: 'Surat umum dicatat admin atau petugas pendaftaran. Musyrif mencatat surat untuk santri asramanya.' };
      if (pihak.length < 3) return { ok: false, error: 'Tulis pengirim atau penerima surat (minimal 3 karakter).' };
    } else if (!(await santriDalamBatas(sumber.studentId, actor))) {
      return { ok: false, status: 404, error: 'Santri tidak ditemukan atau bukan tanggung jawab Anda.' };
    }
    return tulis(async () => {
      const jenis = (await database.query('SELECT * FROM letter_types WHERE id = $1', [sumber.typeId])).rows[0];
      if (!jenis || !jenis.active) return { ok: false, error: 'Jenis surat ini tidak tersedia.' };
      if (umum && jenis.exit_flow) return { ok: false, error: 'Permohonan pengunduran diri harus terikat pada seorang santri.' };
      let fileId = null;
      if (sumber.fileId) {
        const berkas = (await database.query(`SELECT id FROM file_objects WHERE id = $1 AND purpose = 'letter-scan' AND entity_id = $2 AND status = 'ready'`, [UUID.test(String(sumber.fileId)) ? sumber.fileId : null, umum ? 'umum' : String(sumber.studentId)])).rows[0];
        if (!berkas) return { ok: false, error: 'Berkas pindaian tidak ditemukan untuk santri ini.' };
        fileId = berkas.id;
      }
      const id = crypto.randomUUID();
      const tahun = tanggal.slice(0, 4);
      let nomor = await nomorBaru(jenis.direction, tahun);
      for (let percobaan = 0; ; percobaan += 1) {
        try {
          await database.query(
            `INSERT INTO letters (id, reference_no, type_id, student_id, counterparty, subject, notes, letter_date, file_id, created_by_account_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [id, nomor, jenis.id, umum ? null : sumber.studentId, umum ? pihak : '', subject, rapi(sumber.notes, 2000), tanggal, fileId, actor.id || null, now()]
          );
          break;
        } catch (error) {
          if (error && error.code === '23505' && percobaan < 3) { nomor = await nomorBaru(jenis.direction, tahun); continue; }
          throw error;
        }
      }
      await catat(id, 'dibuat', fileId ? 'Surat dicatat beserta berkas pindaian.' : 'Surat dicatat tanpa berkas pindaian.', actor);
      if (jenis.exit_flow) {
        for (const kind of Object.keys(BUTIR)) await database.query('INSERT INTO exit_checklist_items (letter_id, kind) VALUES ($1, $2)', [id, kind]);
      }
      return { ok: true, value: bentukSurat(await ambilSurat(id, actor)) };
    });
  }

  // Petunjuk otomatis untuk daftar periksa keluar; keputusan tetap di tangan petugas.
  async function petunjukKeluar(studentId) {
    const tanya = async (sql, params) => { try { return (await database.query(sql, params)).rows; } catch (error) { if (['42P01', '42703'].includes(error.code)) return []; throw error; } };
    const tagihan = (await tanya(`SELECT count(*)::int AS jumlah, COALESCE(sum(amount_rupiah), 0)::bigint AS total FROM invoices WHERE student_id = $1 AND status = 'unpaid'`, [studentId]))[0] || { jumlah: 0, total: 0 };
    const kamar = (await tanya(`SELECT r.name, r.has_ac FROM students s JOIN dormitory_rooms r ON r.id = s.room_id WHERE s.id = $1`, [studentId]))[0] || null;
    const acStatus = acState ? await acState(studentId) : null;
    const dokumen = (await tanya(`SELECT count(*)::int AS jumlah FROM student_documents WHERE student_id = $1 AND archived_at IS NULL`, [studentId]))[0] || { jumlah: 0 };
    return {
      tagihan: { count: Number(tagihan.jumlah), totalRupiah: Number(tagihan.total), hint: Number(tagihan.jumlah) ? `${tagihan.jumlah} tagihan belum lunas, total Rp${Number(tagihan.total).toLocaleString('id-ID')}.` : 'Tidak ada tagihan yang belum lunas.' },
      'refund-ac': { room: kamar ? kamar.name : null, hasAc: kamar ? Boolean(kamar.has_ac) : null, ac: acStatus, hint: acStatus ? acStatus.hint : kamar ? (kamar.has_ac ? `Kamar ${kamar.name} memakai AC: periksa apakah ada refund atau pengembalian biaya AC.` : `Kamar ${kamar.name} tanpa AC: biasanya tidak ada refund AC.`) : 'Santri belum punya kamar tercatat.' },
      dokumen: { count: Number(dokumen.jumlah), hint: `${dokumen.jumlah} dokumen pribadi tersimpan di profil santri; pastikan yang asli sudah dikembalikan.` },
      inventaris: { hint: 'Periksa kunci, kasur, lemari, dan barang pinjaman lain; catat di kolom catatan.' }
    };
  }

  async function detail(id, actor) {
    if (!boleh(actor)) return TOLAK;
    return tulis(async () => {
      const row = await ambilSurat(id, actor);
      if (!row) return { ok: false, status: 404, error: 'Surat tidak ditemukan.' };
      const peristiwa = (await database.query(`SELECT e.action, e.note, e.created_at, a.name AS actor_name FROM letter_events e LEFT JOIN accounts a ON a.id = e.actor_account_id WHERE e.letter_id = $1 ORDER BY e.created_at`, [id])).rows;
      let daftarKeluar = null;
      if (row.exit_flow) {
        const butir = (await database.query(`SELECT c.kind, c.status, c.note, c.checked_at, a.name AS checked_by FROM exit_checklist_items c LEFT JOIN accounts a ON a.id = c.checked_by_account_id WHERE c.letter_id = $1`, [id])).rows;
        const petunjuk = await petunjukKeluar(row.student_id);
        daftarKeluar = {
          items: Object.keys(BUTIR).map((kind) => {
            const b = butir.find((x) => x.kind === kind) || { status: 'belum', note: '' };
            return { kind, label: BUTIR[kind], status: b.status, statusLabel: STATUS_BUTIR[b.status], note: b.note || '', checkedBy: b.checked_by || null, checkedAt: iso(b.checked_at), hint: (petunjuk[kind] || {}).hint || '' };
          }),
          hints: petunjuk,
          statuses: Object.entries(STATUS_BUTIR).map(([idStatus, label]) => ({ id: idStatus, label })),
          canFinalize: admin(actor) && row.status === 'disetujui' && !row.exit_completed_at
        };
      }
      return {
        ok: true,
        value: {
          letter: bentukSurat(row),
          events: peristiwa.map((e) => ({ action: e.action, note: e.note, at: iso(e.created_at), by: e.actor_name || null })),
          exitChecklist: daftarKeluar,
          can: { verify: verifikator(actor) && row.status === 'diajukan', decide: admin(actor) && ['diajukan', 'diverifikasi'].includes(row.status), archive: ['disetujui', 'ditolak'].includes(row.status) }
        }
      };
    });
  }

  async function verify(id, input, actor) {
    if (!verifikator(actor)) return { ok: false, status: 403, error: 'Hanya admin dan petugas pendaftaran yang memverifikasi surat.' };
    return tulis(async () => {
      const row = await ambilSurat(id, actor);
      if (!row) return { ok: false, status: 404, error: 'Surat tidak ditemukan.' };
      if (row.status !== 'diajukan') return { ok: false, status: 409, error: 'Surat ini sudah diverifikasi atau diputuskan.' };
      await database.query(`UPDATE letters SET status = 'diverifikasi', verified_by_account_id = $2, verified_at = $3 WHERE id = $1`, [id, actor.id || null, now()]);
      await catat(id, 'verifikasi', input && input.note, actor);
      return { ok: true, value: bentukSurat(await ambilSurat(id, actor)) };
    });
  }

  async function decide(id, input, actor) {
    if (!admin(actor)) return { ok: false, status: 403, error: 'Hanya admin yang memutuskan surat.' };
    const keputusan = String(input && input.decision || '');
    if (!['disetujui', 'ditolak'].includes(keputusan)) return { ok: false, error: 'Keputusan harus disetujui atau ditolak.' };
    const catatan = rapi(input && input.note, 500);
    if (keputusan === 'ditolak' && catatan.length < 5) return { ok: false, error: 'Tulis alasan penolakan (minimal 5 karakter).' };
    return tulis(async () => {
      const row = await ambilSurat(id, actor);
      if (!row) return { ok: false, status: 404, error: 'Surat tidak ditemukan.' };
      if (!['diajukan', 'diverifikasi'].includes(row.status)) return { ok: false, status: 409, error: 'Surat ini sudah diputuskan.' };
      if (keputusan === 'disetujui' && row.status !== 'diverifikasi') return { ok: false, status: 409, error: 'Surat harus diverifikasi lebih dulu sebelum disetujui.' };
      await database.query('UPDATE letters SET status = $2, decided_by_account_id = $3, decided_at = $4, decision_note = $5 WHERE id = $1', [id, keputusan, actor.id || null, now(), catatan]);
      await catat(id, keputusan === 'disetujui' ? 'persetujuan' : 'penolakan', catatan, actor);
      return { ok: true, value: bentukSurat(await ambilSurat(id, actor)) };
    });
  }

  async function setChecklist(id, kind, input, actor) {
    if (!boleh(actor)) return TOLAK;
    if (!BUTIR[kind]) return { ok: false, status: 404, error: 'Butir daftar periksa tidak dikenal.' };
    const status = String(input && input.status || '');
    if (!STATUS_BUTIR[status]) return { ok: false, error: 'Status butir tidak dikenal.' };
    const catatan = rapi(input && input.note, 500);
    if (['bermasalah', 'tidak-berlaku'].includes(status) && catatan.length < 3) return { ok: false, error: 'Tulis catatan untuk butir yang bermasalah atau tidak berlaku.' };
    return tulis(async () => {
      const row = await ambilSurat(id, actor);
      if (!row || !row.exit_flow) return { ok: false, status: 404, error: 'Daftar periksa keluar tidak ditemukan.' };
      // Refund AC: tidak boleh dinyatakan beres selagi pengajuan belum diputuskan, dan tidak boleh dilewati bila santri punya hak yang belum diajukan.
      if (kind === 'refund-ac' && acState && ['beres', 'tidak-berlaku'].includes(status)) {
        const ac = await acState(row.student_id);
        if (ac && status === 'beres' && ac.pending > 0) return { ok: false, status: 409, error: 'Masih ada pengajuan refund AC yang belum dicairkan atau diputuskan. Selesaikan dulu di halaman Inventaris dan AC.' };
        if (ac && ac.eligibleUnrequested > 0) return { ok: false, status: 409, error: 'Santri ini berkontribusi pada AC patungan dan punya hak refund yang belum diajukan. Ajukan refund di halaman Inventaris dan AC, atau catat alasannya di sana bila ditolak.' };
      }
      if (row.exit_completed_at) return { ok: false, status: 409, error: 'Santri sudah dinyatakan keluar; daftar periksa tidak dapat diubah.' };
      if (row.status === 'ditolak') return { ok: false, status: 409, error: 'Permohonan ini ditolak; daftar periksa tidak dipakai.' };
      await database.query(
        `INSERT INTO exit_checklist_items (letter_id, kind, status, note, checked_by_account_id, checked_at) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (letter_id, kind) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, checked_by_account_id = EXCLUDED.checked_by_account_id, checked_at = EXCLUDED.checked_at`,
        [id, kind, status, catatan, actor.id || null, now()]
      );
      await catat(id, 'daftar-keluar', `${BUTIR[kind]}: ${STATUS_BUTIR[status]}${catatan ? `. ${catatan}` : ''}`, actor);
      return { ok: true, value: { kind, status, note: catatan } };
    });
  }

  // Menyatakan santri keluar: surat disetujui, semua butir beres atau tidak berlaku. Status santri menjadi mengundurkan diri.
  async function completeExit(id, input, actor) {
    if (!admin(actor)) return { ok: false, status: 403, error: 'Hanya admin yang menyatakan santri keluar.' };
    if (typeof finalizeExit !== 'function') return { ok: false, status: 501, error: 'Proses keluar belum tersedia.' };
    return tulis(async () => {
      const row = await ambilSurat(id, actor);
      if (!row || !row.exit_flow) return { ok: false, status: 404, error: 'Permohonan pengunduran diri tidak ditemukan.' };
      if (row.status !== 'disetujui') return { ok: false, status: 409, error: 'Permohonan harus disetujui lebih dulu.' };
      if (row.exit_completed_at) return { ok: false, status: 409, error: 'Santri ini sudah dinyatakan keluar.' };
      const butir = (await database.query('SELECT kind, status FROM exit_checklist_items WHERE letter_id = $1', [id])).rows;
      const belumBeres = Object.keys(BUTIR).filter((kind) => { const b = butir.find((x) => x.kind === kind); return !b || !['beres', 'tidak-berlaku'].includes(b.status); });
      if (belumBeres.length) return { ok: false, status: 409, error: `Daftar periksa belum beres: ${belumBeres.map((k) => BUTIR[k]).join(', ')}.` };
      const hasil = await finalizeExit(row.student_id, rapi(input && input.reason, 300) || `Mengundurkan diri (${row.reference_no}).`, actor);
      if (!hasil.ok) return hasil;
      await database.query('UPDATE letters SET exit_completed_at = $2, exit_completed_by_account_id = $3 WHERE id = $1', [id, now(), actor.id || null]);
      await catat(id, 'keluar', 'Santri dinyatakan keluar (mengundurkan diri).', actor);
      return { ok: true, value: bentukSurat(await ambilSurat(id, actor)) };
    });
  }

  // ------------------------------------------------------------------ arsip PDF

  const WAKTU = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

  async function archivePdf(id, actor) {
    if (!boleh(actor)) return TOLAK;
    return tulis(async () => {
      const dasar = await ambilSurat(id, actor);
      if (!dasar) return { ok: false, status: 404, error: 'Surat tidak ditemukan.' };
      if (!['disetujui', 'ditolak'].includes(dasar.status)) return { ok: false, status: 409, error: 'Arsip PDF tersedia setelah surat disetujui atau ditolak.' };
      const rincian = await detail(id, actor);
      const { letter: s, events, exitChecklist } = rincian.value;
      const blok = [
        { kind: 'title', text: 'Arsip Surat' },
        { kind: 'subtitle', text: `${s.referenceNo} · ${s.typeName} · ${s.directionLabel}` },
        { kind: 'rule' },
        { kind: 'heading', text: 'Data surat' },
        { kind: 'item', text: s.studentId ? `Santri: ${s.studentName}${s.dormitoryName ? ` (${s.dormitoryName})` : ''}` : `${s.direction === 'keluar' ? 'Penerima' : 'Pengirim'}: ${s.counterparty}` },
        { kind: 'item', text: `Perihal: ${s.subject}` },
        { kind: 'item', text: `Tanggal surat: ${s.letterDate}` },
        { kind: 'item', text: s.fileId ? 'Berkas pindaian: tersimpan di arsip digital Hamasah.' : 'Berkas pindaian: tidak dilampirkan.' }
      ];
      if (s.notes) blok.push({ kind: 'heading', text: 'Catatan' }, { kind: 'text', text: s.notes });
      blok.push({ kind: 'heading', text: 'Keputusan' }, { kind: 'text', text: `${s.statusLabel}${s.decidedBy ? ` oleh ${s.decidedBy}` : ''}${s.decidedAt ? ` pada ${WAKTU.format(new Date(s.decidedAt))}` : ''}.` });
      if (s.decisionNote) blok.push({ kind: 'text', text: `Catatan keputusan: ${s.decisionNote}` });
      if (s.verifiedBy) blok.push({ kind: 'text', text: `Diverifikasi oleh ${s.verifiedBy} pada ${WAKTU.format(new Date(s.verifiedAt))}.` });
      if (exitChecklist) {
        blok.push({ kind: 'heading', text: 'Daftar periksa keluar' });
        exitChecklist.items.forEach((b) => blok.push({ kind: 'item', text: `${b.label}: ${b.statusLabel}${b.note ? ` (${b.note})` : ''}` }));
        if (s.exitCompletedAt) blok.push({ kind: 'text', text: `Santri dinyatakan keluar pada ${WAKTU.format(new Date(s.exitCompletedAt))}${s.exitCompletedBy ? ` oleh ${s.exitCompletedBy}` : ''}.` });
      }
      blok.push({ kind: 'heading', text: 'Jejak proses' });
      events.forEach((e) => blok.push({ kind: 'muted', text: `${WAKTU.format(new Date(e.at))} · ${e.action}${e.by ? ` · ${e.by}` : ''}${e.note ? ` · ${e.note}` : ''}` }));
      return { ok: true, value: { buffer: createDocumentPdf({ blocks: blok, footer: `${s.referenceNo} · diarsipkan ${WAKTU.format(now())}` }), fileName: `arsip-${s.referenceNo.replace(/[^\w.-]+/g, '-')}.pdf` } };
    });
  }

  return { listTypes, createType, updateType, confirmTypes, santriPilihan, list, create, detail, verify, decide, setChecklist, completeExit, archivePdf };
}

module.exports = { createLetterArchiveService, STATUS, BUTIR };
